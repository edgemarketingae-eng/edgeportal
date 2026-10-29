import type { DepositFilters, DepositInput, DepositList, DepositSummary, LeadDepositDto, StaffCommissionDto } from "@edge/contracts";
import { Lead, LeadConversion, LeadDeposit, StaffProfile, Types, withTx, type LeadDepositDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import { commissionFor, depositMonthRange, nextSlab, rateFor, type CommissionRates } from "@edge/domain/crm/commission";
import { DEPOSIT_CURRENCY, type DepositSequence } from "@edge/domain/crm/enums";
import { DEPOSIT_SEQUENCE_LABELS } from "@edge/domain/crm/labels";
import { dubaiDateOnly } from "@edge/domain/dates";
import type { Actor } from "@edge/domain/enums";
import { formatMoney, toMinor } from "@edge/domain/money";
import { audit } from "../audit";
import { env } from "../env";
import { BusinessError, NotFoundError, TransitionError, ValidationError } from "../errors";
import { oid } from "../ids";
import { day, iso } from "../mappers";
import { notifyPermissionHolders, notifyUser } from "../notifications/in-app";
import { pageOf } from "../paging";
import { getSetting } from "../settings";
import { actorId, between, leadHref, loadLead, lockLead, optId, periodRange, recordActivity, userNames } from "./common";
import { has, listCrmUsers, type CrmScope } from "./scope";

const depositsHref = () => `${env.CRM_APP_URL}/deposits`;
const usd = (minor: number) => formatMoney(minor, DEPOSIT_CURRENCY);
/** Sequences a lead can have only once (unless the earlier one was rejected). */
const ONCE: DepositSequence[] = ["FIRST"];

const canManage = (scope: CrmScope) => has(scope, "crm.commission.manage");
const pctText = (fraction: string) => `${Number((Number(fraction) * 100).toFixed(4))}%`;
const monthName = (from: Date) => from.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** One person's later deposits for one month after a re-rate. `beforeMinor` / `afterMinor` are their summed commission. */
export interface MonthRerate {
  creditedToId: string;
  /** "2026-10" */
  month: string;
  count: number;
  totalMinor: number;
  pct: string;
  beforeMinor: number;
  afterMinor: number;
  /** Deposits whose rate, commission or month total changed. */
  changed: number;
}

/**
 * Re-rate one person's verified later deposits for the month of `depositedAt`: their total picks the slab and every one
 * of them earns that rate on its whole amount. Call it inside `withTx`: it bumps the person's `commissionRev` first, so a
 * concurrent re-rate for the same person hits a write conflict and retries on fresh data. `write: false` only reports.
 */
export async function rerateLaterMonth(
  creditedToId: Types.ObjectId,
  depositedAt: Date,
  rates: CommissionRates,
  { write = true }: { write?: boolean } = {},
): Promise<MonthRerate> {
  if (write) await StaffProfile.updateOne({ _id: creditedToId }, { $inc: { commissionRev: 1 } });
  const { from, to } = depositMonthRange(depositedAt);
  const rows = await LeadDeposit.find(
    { creditedToId, sequence: "LATER", status: "VERIFIED", depositedAt: { $gte: from, $lt: to } },
    { amountMinor: 1, commissionPct: 1, commissionMinor: 1, slabBaseMinor: 1 },
  ).lean();
  const totalMinor = rows.reduce((sum, d) => sum + d.amountMinor, 0);
  const pct = rateFor(rates, "LATER", totalMinor);
  let beforeMinor = 0;
  let afterMinor = 0;
  const ops = [];
  for (const d of rows) {
    const commissionMinor = commissionFor(d.amountMinor, pct);
    beforeMinor += d.commissionMinor ?? 0;
    afterMinor += commissionMinor;
    if (d.commissionPct !== pct || d.commissionMinor !== commissionMinor || d.slabBaseMinor !== totalMinor)
      ops.push({
        updateOne: {
          filter: { _id: d._id, status: "VERIFIED" as const },
          update: { $set: { commissionPct: pct, commissionMinor, slabBaseMinor: totalMinor } },
        },
      });
  }
  if (write && ops.length) await LeadDeposit.bulkWrite(ops);
  return {
    creditedToId: String(creditedToId),
    month: from.toISOString().slice(0, 7),
    count: rows.length,
    totalMinor,
    pct,
    beforeMinor,
    afterMinor,
    changed: ops.length,
  };
}

/** The (person, month) groups of verified later deposits matching `match`, oldest month first. */
async function laterMonthGroups(match: Record<string, unknown>) {
  const rows = await LeadDeposit.aggregate<{ _id: { p: Types.ObjectId; y: number; m: number } }>([
    { $match: { sequence: "LATER", status: "VERIFIED", ...match } },
    { $group: { _id: { p: "$creditedToId", y: { $year: "$depositedAt" }, m: { $month: "$depositedAt" } } } },
    { $sort: { "_id.y": 1, "_id.m": 1, "_id.p": 1 } },
  ]);
  return rows.map((r) => ({ creditedToId: r._id.p, monthStart: new Date(Date.UTC(r._id.y, r._id.m - 1, 1)) }));
}

/** Re-rate each group in its own transaction (or only report, `apply: false`); a group whose commission changed is audited. */
async function rerateGroups(groups: { creditedToId: Types.ObjectId; monthStart: Date }[], apply: boolean, actor: Actor) {
  const rates = await getSetting("crm.commission");
  const out: MonthRerate[] = [];
  for (const g of groups) {
    const r = apply
      ? await withTx(async () => {
          const r = await rerateLaterMonth(g.creditedToId, g.monthStart, rates);
          if (r.changed)
            await audit({
              actor,
              action: "crm.commission.rerate",
              entityType: "StaffProfile",
              entityId: r.creditedToId,
              before: { month: r.month, commissionMinor: r.beforeMinor },
              after: { month: r.month, totalMinor: r.totalMinor, pct: r.pct, commissionMinor: r.afterMinor, deposits: r.count },
            });
          return r;
        })
      : await rerateLaterMonth(g.creditedToId, g.monthStart, rates, { write: false });
    out.push(r);
  }
  return out;
}

/** New slab rates apply to the current month (it is still open): everyone's later deposits this month are re-rated. */
export async function rerateCurrentMonth(actor: Actor) {
  const { from, to } = depositMonthRange(dubaiDateOnly(now()));
  return rerateGroups(await laterMonthGroups({ depositedAt: { $gte: from, $lt: to } }), true, actor);
}

/**
 * Backfill for later deposits rated per deposit (before slabs went monthly): re-rate every person-month that has a
 * verified later deposit without a month total (`all`: every person-month), optionally from a month ("2026-10") on.
 * `apply: false` only reports what would change. Running it again after applying changes nothing.
 */
export async function rerateLaterCommission(opts: { apply: boolean; all?: boolean; fromMonth?: string }, actor: Actor) {
  const match: Record<string, unknown> = opts.all ? {} : { slabBaseMinor: null };
  if (opts.fromMonth) {
    const from = new Date(`${opts.fromMonth}-01T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}$/.test(opts.fromMonth) || Number.isNaN(from.getTime())) throw new Error("fromMonth must look like 2026-10");
    match.depositedAt = { $gte: from };
  }
  return rerateGroups(await laterMonthGroups(match), opts.apply, actor);
}

/** "October 2026 later deposits: $29,000.00, so 2.5% on all of them." */
function monthLine(r: MonthRerate) {
  const from = new Date(`${r.month}-01T00:00:00.000Z`);
  return `${monthName(from)} later deposits: ${usd(r.totalMinor)}, so ${pctText(r.pct)} on all of them.`;
}

/**
 * Sales logs a deposit the lead made at the broker. It earns nothing until a commission manager verifies it.
 * Credit goes to the lead owner at this moment (the logger when the lead is unassigned).
 */
export async function logDeposit(leadId: string, input: DepositInput, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const lead = await loadLead(leadId, scope);
  if (lead.mergedIntoId) throw new TransitionError("This lead was merged into another lead");
  const amountMinor = toMinor(input.amount);
  if (amountMinor <= 0) throw new ValidationError({ amount: "Enter an amount above zero" });
  const depositedAt = new Date(`${input.depositedAt}T00:00:00.000Z`);
  if (Number.isNaN(depositedAt.getTime())) throw new ValidationError({ depositedAt: "Choose the deposit date" });
  if (depositedAt > dubaiDateOnly(now())) throw new ValidationError({ depositedAt: "The deposit date can't be in the future" });
  const given = input.jetaFxClientId?.trim() || null;
  if (!lead.jetaFxClientId && !given) throw new ValidationError({ jetaFxClientId: "Enter the lead's JetaFX client ID" });
  const at = now();
  const result = await withTx(async () => {
    const l = await lockLead(lead._id);
    if (
      ONCE.includes(input.sequence) &&
      (await LeadDeposit.exists({ leadId: l._id, sequence: input.sequence, status: { $ne: "REJECTED" } }))
    )
      throw new BusinessError(`This lead already has a ${DEPOSIT_SEQUENCE_LABELS[input.sequence].toLowerCase()}`, {
        sequence: "Already logged",
      });
    const clientId = l.jetaFxClientId || given;
    const me = actorId(actor)!;
    const creditedToId = l.ownerId ?? me;
    const [d] = await LeadDeposit.create([
      {
        leadId: l._id,
        projectId: l.projectId,
        creditedToId,
        loggedById: me,
        sequence: input.sequence,
        amountMinor,
        currency: DEPOSIT_CURRENCY,
        depositedAt,
        jetaFxClientId: clientId,
        reference: input.reference?.trim() || null,
        note: input.note?.trim() || null,
      },
    ]);
    await Lead.updateOne({ _id: l._id }, { $set: { lastActivityAt: at, ...(l.jetaFxClientId ? {} : { jetaFxClientId: clientId }) } });
    await recordActivity(l._id, "DEPOSIT_LOGGED", actor, {
      body: input.note?.trim() || null,
      data: {
        depositId: String(d!._id),
        sequence: input.sequence,
        amountMinor,
        currency: DEPOSIT_CURRENCY,
        depositedAt: input.depositedAt,
      },
    });
    await audit({
      actor,
      action: "lead.deposit.log",
      entityType: "LeadDeposit",
      entityId: String(d!._id),
      after: { leadId, sequence: input.sequence, amountMinor, depositedAt: input.depositedAt, creditedToId: String(creditedToId) },
    });
    return { id: String(d!._id), name: l.name };
  });
  await notifyPermissionHolders("crm.commission.manage", {
    title: "Deposit to verify",
    body: `${result.name}: ${usd(amountMinor)} (${DEPOSIT_SEQUENCE_LABELS[input.sequence]})`,
    href: depositsHref(),
  });
  return result.id;
}

async function loadDeposit(id: string) {
  const d = await LeadDeposit.findById(oid(id, "Deposit")).lean();
  if (!d) throw new NotFoundError("Deposit");
  return d as LeadDepositDoc;
}

/**
 * Verify (commission managers). A first deposit's commission is fixed with today's first-deposit rate. A later deposit
 * joins the credited person's month (by deposit date), and the whole month is re-rated by its new later-deposit total.
 */
export async function verifyDeposit(id: string, actor: Actor & { type: "USER" }, scope: CrmScope) {
  if (!canManage(scope)) throw new NotFoundError("Deposit");
  const d = await loadDeposit(id);
  if (d.status !== "PENDING") throw new TransitionError("Only pending deposits can be verified");
  const rates = await getSetting("crm.commission");
  const first = d.sequence === "FIRST";
  const fixed = first ? { commissionPct: rates.firstPct, commissionMinor: commissionFor(d.amountMinor, rates.firstPct) } : {};
  const at = now();
  const { lead, commissionMinor, month } = await withTx(async () => {
    const r = await LeadDeposit.updateOne(
      { _id: d._id, status: "PENDING" },
      { $set: { status: "VERIFIED", reviewedById: actorId(actor), reviewedAt: at, rejectReason: null, ...fixed } },
    );
    if (r.modifiedCount !== 1) throw new TransitionError("Only pending deposits can be verified");
    const month = first ? null : await rerateLaterMonth(d.creditedToId, d.depositedAt, rates);
    const pct = month?.pct ?? rates.firstPct;
    const commissionMinor = commissionFor(d.amountMinor, pct);
    const l = await Lead.findById(d.leadId, { name: 1 }).lean();
    await recordActivity(d.leadId, "DEPOSIT_VERIFIED", actor, {
      data: { depositId: id, sequence: d.sequence, amountMinor: d.amountMinor, currency: d.currency },
    });
    await audit({
      actor,
      action: "lead.deposit.verify",
      entityType: "LeadDeposit",
      entityId: id,
      after: {
        commissionPct: pct,
        commissionMinor,
        ...(month ? { month: month.month, monthTotalMinor: month.totalMinor, monthCommissionMinor: month.afterMinor } : {}),
      },
    });
    return { lead: l, commissionMinor, month };
  });
  const raised = month && month.afterMinor - commissionMinor > month.beforeMinor;
  await notifyUser(String(d.creditedToId), {
    title: "Deposit verified",
    body:
      `${lead?.name ?? "A lead"}: ${usd(d.amountMinor)} (${DEPOSIT_SEQUENCE_LABELS[d.sequence]}). Your commission: ${usd(commissionMinor)}.` +
      (month ? ` ${monthLine(month)}${raised ? " Your earlier ones this month went up too." : ""}` : ""),
    href: leadHref(d.leadId),
  });
}

/** Reject a pending deposit, or a verified one that the broker reversed. It earns no commission. */
export async function rejectDeposit(id: string, reason: string, actor: Actor & { type: "USER" }, scope: CrmScope) {
  if (!canManage(scope)) throw new NotFoundError("Deposit");
  const d = await loadDeposit(id);
  if (d.status === "REJECTED") throw new TransitionError("This deposit is already rejected");
  const why = reason.trim();
  const at = now();
  const rates = d.status === "VERIFIED" && d.sequence === "LATER" ? await getSetting("crm.commission") : null;
  const { lead, month } = await withTx(async () => {
    const r = await LeadDeposit.updateOne(
      { _id: d._id, status: d.status },
      {
        $set: {
          status: "REJECTED",
          reviewedById: actorId(actor),
          reviewedAt: at,
          rejectReason: why,
          commissionPct: null,
          commissionMinor: null,
          slabBaseMinor: null,
        },
      },
    );
    if (r.modifiedCount !== 1) throw new TransitionError("The deposit changed meanwhile; reload and try again");
    // A verified later deposit leaves its month: the rest are re-rated by the smaller total.
    const month = rates ? await rerateLaterMonth(d.creditedToId, d.depositedAt, rates) : null;
    const l = await Lead.findById(d.leadId, { name: 1 }).lean();
    await recordActivity(d.leadId, "DEPOSIT_REJECTED", actor, {
      body: why,
      data: { depositId: id, sequence: d.sequence, amountMinor: d.amountMinor, currency: d.currency, wasVerified: d.status === "VERIFIED" },
    });
    await audit({
      actor,
      action: "lead.deposit.reject",
      entityType: "LeadDeposit",
      entityId: id,
      before: { status: d.status, commissionMinor: d.commissionMinor ?? null },
      after: {
        reason: why,
        ...(month ? { month: month.month, monthTotalMinor: month.totalMinor, monthCommissionMinor: month.afterMinor } : {}),
      },
    });
    return { lead: l, month };
  });
  await notifyUser(String(d.creditedToId), {
    title: "Deposit rejected",
    body:
      `${lead?.name ?? "A lead"}: ${usd(d.amountMinor)} (${DEPOSIT_SEQUENCE_LABELS[d.sequence]}). ${why}` +
      (month?.count ? ` ${monthLine(month)}` : ""),
    href: leadHref(d.leadId),
  });
}

function mayDelete(d: Pick<LeadDepositDoc, "status" | "loggedById" | "creditedToId">, scope: CrmScope) {
  return d.status === "PENDING" && (canManage(scope) || d.loggedById.equals(scope.me) || d.creditedToId.equals(scope.me));
}

/** A pending deposit logged by mistake: the logger, the credited person or a commission manager may delete it. */
export async function deleteDeposit(id: string, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const d = await loadDeposit(id);
  if (!canManage(scope)) await loadLead(d.leadId, scope);
  if (!mayDelete(d, scope)) throw new BusinessError("Only a pending deposit you logged can be deleted");
  await withTx(async () => {
    const r = await LeadDeposit.deleteOne({ _id: d._id, status: "PENDING" });
    if (r.deletedCount !== 1) throw new TransitionError("Only pending deposits can be deleted");
    await recordActivity(d.leadId, "SYSTEM", actor, {
      body: `Pending ${DEPOSIT_SEQUENCE_LABELS[d.sequence].toLowerCase()} of ${usd(d.amountMinor)} deleted`,
      data: { depositId: id },
    });
    await audit({
      actor,
      action: "lead.deposit.delete",
      entityType: "LeadDeposit",
      entityId: id,
      before: { sequence: d.sequence, amountMinor: d.amountMinor },
    });
  });
}

/** Deposits -> DTOs. Commission is shown to commission managers and to the person credited, nobody else. */
export async function toDepositDtos(rows: LeadDepositDoc[], scope: CrmScope): Promise<LeadDepositDto[]> {
  if (!rows.length) return [];
  const leadIds = [...new Set(rows.map((d) => String(d.leadId)))].map((x) => new Types.ObjectId(x));
  const [leads, names] = await Promise.all([
    Lead.find({ _id: { $in: leadIds } }, { name: 1 }).lean(),
    userNames(rows.flatMap((d) => [d.creditedToId, d.loggedById, d.reviewedById])),
  ]);
  const leadName = new Map(leads.map((l) => [String(l._id), l.name]));
  const ref = (id: Types.ObjectId | null | undefined) => (id ? { id: String(id), name: names.get(String(id)) ?? "Unknown" } : null);
  const manage = canManage(scope);
  return rows.map((d) => {
    const seesCommission = manage || d.creditedToId.equals(scope.me);
    return {
      id: String(d._id),
      lead: { id: String(d.leadId), name: leadName.get(String(d.leadId)) ?? "Deleted lead" },
      creditedTo: ref(d.creditedToId),
      loggedBy: ref(d.loggedById),
      sequence: d.sequence,
      amountMinor: d.amountMinor,
      currency: d.currency,
      depositedAt: day(d.depositedAt)!,
      jetaFxClientId: d.jetaFxClientId ?? null,
      reference: d.reference ?? null,
      note: d.note ?? null,
      status: d.status,
      reviewedBy: ref(d.reviewedById),
      reviewedAt: iso(d.reviewedAt),
      rejectReason: d.rejectReason ?? null,
      commissionPct: seesCommission ? (d.commissionPct ?? null) : null,
      commissionMinor: seesCommission ? (d.commissionMinor ?? null) : null,
      slabBaseMinor: seesCommission ? (d.slabBaseMinor ?? null) : null,
      createdAt: iso(d.createdAt)!,
      canDelete: mayDelete(d, scope),
    };
  });
}

export async function depositsForLead(leadId: Types.ObjectId, scope: CrmScope) {
  const rows = await LeadDeposit.find({ leadId }).sort({ depositedAt: -1, createdAt: -1 }).lean();
  return toDepositDtos(rows as LeadDepositDoc[], scope);
}

async function summarize(match: Record<string, unknown>): Promise<Omit<DepositSummary, "month">> {
  const rows = await LeadDeposit.aggregate<{ _id: string; n: number; amount: number; commission: number }>([
    { $match: match },
    {
      $group: {
        _id: "$status",
        n: { $sum: 1 },
        amount: { $sum: "$amountMinor" },
        commission: { $sum: { $ifNull: ["$commissionMinor", 0] } },
      },
    },
  ]);
  const by = new Map(rows.map((r) => [r._id, r]));
  return {
    pendingCount: by.get("PENDING")?.n ?? 0,
    pendingMinor: by.get("PENDING")?.amount ?? 0,
    verifiedCount: by.get("VERIFIED")?.n ?? 0,
    verifiedMinor: by.get("VERIFIED")?.amount ?? 0,
    commissionMinor: by.get("VERIFIED")?.commission ?? 0,
  };
}

/** One person's verified later deposits this month, the slab they reach and the next one. */
async function monthProgress(creditedToId: Types.ObjectId): Promise<DepositSummary["month"]> {
  const { from, to } = depositMonthRange(dubaiDateOnly(now()));
  const [rates, [r]] = await Promise.all([
    getSetting("crm.commission"),
    LeadDeposit.aggregate<{ v: number }>([
      { $match: { creditedToId, sequence: "LATER", status: "VERIFIED", depositedAt: { $gte: from, $lt: to } } },
      { $group: { _id: null, v: { $sum: "$amountMinor" } } },
    ]),
  ]);
  const laterMinor = r?.v ?? 0;
  const next = nextSlab(rates, laterMinor);
  return { laterMinor, pct: rateFor(rates, "LATER", laterMinor), next: next ? { fromMinor: next.fromMinor, pct: next.pct } : null };
}

/**
 * The deposits page: commission managers see everyone's (newest first, filter by person); everyone else sees the
 * deposits credited to them or logged by them. The summary only counts deposits credited to the viewer unless they manage.
 */
export async function listDeposits(filters: DepositFilters, scope: CrmScope): Promise<DepositList> {
  const manage = canManage(scope);
  const base: Record<string, unknown> = {};
  const range = periodRange(filters.period ?? "all", now());
  const dates = between(range.fromDay, range.toDay);
  if (dates) base.depositedAt = dates;
  const staff = optId(filters.staff);
  if (manage && staff) base.creditedToId = staff;
  const match = manage ? base : { ...base, $or: [{ creditedToId: scope.me }, { loggedById: scope.me }] };
  const list = { ...match, ...(filters.status ? { status: filters.status } : {}) };
  const { page, pageSize } = pageOf(filters, { def: 50 });
  const total = await LeadDeposit.countDocuments(list);
  const last = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(page, last);
  const monthOf = manage ? staff : scope.me;
  const [rows, summary, people, month] = await Promise.all([
    LeadDeposit.find(list)
      .sort({ depositedAt: -1, createdAt: -1, _id: -1 })
      .skip((p - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    summarize(manage ? base : { ...base, creditedToId: scope.me }),
    manage ? listCrmUsers() : Promise.resolve([]),
    monthOf ? monthProgress(monthOf) : Promise.resolve(null),
  ]);
  return {
    rows: await toDepositDtos(rows as LeadDepositDoc[], scope),
    total,
    page: p,
    pageSize,
    summary: { ...summary, month },
    manage,
    staff: people.map((u) => ({ id: u.id, name: u.name, available: u.available })),
  };
}

/** One person's earnings for their staff page (commission managers only). */
export async function getStaffCommission(userId: string, scope: CrmScope): Promise<StaffCommissionDto> {
  if (!canManage(scope)) throw new NotFoundError("Staff");
  const uid = oid(userId, "Staff");
  const at = now();
  const month = periodRange("month", at);
  const lastMonth = periodRange("lastMonth", at);
  const sum = async (match: Record<string, unknown>, field: "$commissionMinor" | "$amountMinor") => {
    const [r] = await LeadDeposit.aggregate<{ v: number; n: number }>([
      { $match: { creditedToId: uid, ...match } },
      { $group: { _id: null, v: { $sum: { $ifNull: [field, 0] } }, n: { $sum: 1 } } },
    ]);
    return { v: r?.v ?? 0, n: r?.n ?? 0 };
  };
  const verified = { status: "VERIFIED" };
  const [cMonth, cLast, cAll, dMonth, dAll, pending, convMonth, convAll, recent] = await Promise.all([
    sum({ ...verified, depositedAt: between(month.fromDay, month.toDay) }, "$commissionMinor"),
    sum({ ...verified, depositedAt: between(lastMonth.fromDay, lastMonth.toDay) }, "$commissionMinor"),
    sum(verified, "$commissionMinor"),
    sum({ ...verified, depositedAt: between(month.fromDay, month.toDay) }, "$amountMinor"),
    sum(verified, "$amountMinor"),
    sum({ status: "PENDING" }, "$amountMinor"),
    LeadConversion.countDocuments({ creditedToId: uid, convertedAt: between(month.from, month.to) }),
    LeadConversion.countDocuments({ creditedToId: uid }),
    LeadDeposit.find({ creditedToId: uid }).sort({ depositedAt: -1, createdAt: -1 }).limit(10).lean(),
  ]);
  return {
    commission: { month: cMonth.v, lastMonth: cLast.v, all: cAll.v },
    deposits: { month: dMonth.v, all: dAll.v },
    pending: { count: pending.n, minor: pending.v },
    conversions: { month: convMonth, all: convAll },
    recent: await toDepositDtos(recent as LeadDepositDoc[], scope),
  };
}
