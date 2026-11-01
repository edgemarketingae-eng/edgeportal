import type {
  ManualLineInput,
  PayLineDto,
  PayrollCloseResult,
  PayrollMonthDetail,
  PayrollMonthRow,
  PayrollMonths,
  PayrollWarning,
  PayslipDto,
  PayslipRow,
} from "@edge/contracts";
import {
  DbNotFoundError,
  Employee,
  lockForUpdate,
  PayrollMonth,
  Payslip,
  SalaryAdvance,
  StaffProfile,
  Types,
  withTx,
  type EmployeeDoc,
  type EmployeePayDoc,
  type PayslipDoc,
  type SalaryAdvanceDoc,
} from "@edge/db";
import { now } from "@edge/domain/clock";
import { DEPOSIT_CURRENCY } from "@edge/domain/crm/enums";
import { addMonths, formatMonth, monthRange, type Month } from "@edge/domain/hr/calendar";
import { MANUAL_PAY_LINE_KINDS, type PayCurrency, type PayLineKind, type PayLineSource } from "@edge/domain/hr/enums";
import { negativeTotals, netIn, totalsByCurrency } from "@edge/domain/hr/pay";
import { toMinor } from "@edge/domain/money";
import { audit } from "../audit";
import { userNames } from "../crm/common";
import { verifiedCommissionByMonth } from "../crm/deposits";
import { BusinessError, NotFoundError, TransitionError, ValidationError } from "../errors";
import { oid } from "../ids";
import { iso } from "../mappers";
import { attendanceSummaries } from "./attendance";
import { assertNotSelf, draftMonth, lastClosedMonth, monthNow, tellEmployee, type HrActor } from "./common";
import { payForMonth } from "./employees";

interface Line {
  _id?: Types.ObjectId;
  kind: PayLineKind;
  label: string;
  currency: PayCurrency;
  amountMinor: number;
  source: PayLineSource;
  forMonth: string | null;
  advanceId: Types.ObjectId | null;
}

const system = (kind: PayLineKind, label: string, currency: PayCurrency, amountMinor: number, extra: Partial<Line> = {}): Line => ({
  kind,
  label,
  currency,
  amountMinor,
  source: "SYSTEM",
  forMonth: null,
  advanceId: null,
  ...extra,
});

const COMMISSION_KINDS: PayLineKind[] = ["COMMISSION", "COMMISSION_ADJUSTMENT"];
const key = (person: string, month: Month) => `${person}:${month}`;

/**
 * What each person is still owed (or overpaid) in commission for closed months: actual commission now, minus what closed
 * payslips recorded for that month. A month with no payslip counts as zero recorded. Only closed payslips count, so
 * refreshing a draft never changes the answer, and because the sum is recalculated every time nothing can be paid twice.
 */
async function commissionDifferences(closedMonths: Month[]) {
  const out = new Map<string, { month: Month; minor: number }[]>();
  if (!closedMonths.length) return out;
  const from = monthRange(closedMonths[0]!).from;
  const to = monthRange(closedMonths[closedMonths.length - 1]!).to;
  const [actual, slips] = await Promise.all([
    verifiedCommissionByMonth(from, to),
    Payslip.find({ closedAt: { $ne: null }, "lines.kind": { $in: COMMISSION_KINDS } }, { employeeId: 1, lines: 1 }).lean(),
  ]);
  const diff = new Map<string, number>();
  for (const a of actual) diff.set(key(a.person, a.month), a.minor);
  for (const s of slips)
    for (const l of s.lines)
      if (COMMISSION_KINDS.includes(l.kind) && l.forMonth) {
        const k = key(String(s.employeeId), l.forMonth);
        diff.set(k, (diff.get(k) ?? 0) - l.amountMinor);
      }
  for (const [k, minor] of diff) {
    if (!minor) continue;
    const [person, month] = k.split(":") as [string, Month];
    out.set(
      person,
      [...(out.get(person) ?? []), { month, minor }].sort((a, b) => a.month.localeCompare(b.month)),
    );
  }
  return out;
}

const employedIn = (e: EmployeeDoc, from: Date, to: Date) => e.joinedOn < to && (!e.leftOn || e.leftOn >= from);

function baseLines(pay: EmployeePayDoc | undefined) {
  if (!pay) return [];
  const lines: Line[] = [];
  if (pay.baseMinor) lines.push(system("SALARY", "Salary", pay.currency, pay.baseMinor));
  for (const a of pay.allowances ?? []) lines.push(system("ALLOWANCE", a.label, pay.currency, a.amountMinor));
  return lines;
}

/** A negative adjustment takes only what this payslip can spare. The rest stays unrecorded, so it comes back next month. */
function adjustmentLines(differences: { month: Month; minor: number }[], lines: Line[]) {
  const out = [...lines];
  const adjust = (d: { month: Month; minor: number }, minor: number) =>
    out.push(
      system("COMMISSION_ADJUSTMENT", `Commission adjustment for ${formatMonth(d.month)}`, DEPOSIT_CURRENCY, minor, { forMonth: d.month }),
    );
  for (const d of differences.filter((x) => x.minor > 0)) adjust(d, d.minor);
  for (const d of differences.filter((x) => x.minor < 0)) {
    const spare = Math.max(0, netIn(out, DEPOSIT_CURRENCY));
    const taken = Math.min(spare, -d.minor);
    if (taken) adjust(d, -taken);
  }
  return out;
}

const sameLines = (a: Line[], b: Line[]) => {
  const flat = (rows: Line[]) =>
    rows.map((l) => [l.kind, l.label, l.currency, l.amountMinor, l.source, l.forMonth ?? null, l.advanceId ? String(l.advanceId) : null]);
  return JSON.stringify(flat(a)) === JSON.stringify(flat(b));
};

/**
 * Inside withTx, with the month locked: rebuild every system line of a draft month and keep HR's manual lines. Returns
 * how many payslips' figures changed, which is how close knows that what HR reviewed is no longer current.
 */
async function rebuildMonth(month: Month) {
  const { from, to } = monthRange(month);
  const closedMonths = (await PayrollMonth.find({ status: "CLOSED" }, { month: 1 }).sort({ month: 1 }).lean()).map((m) => m.month);
  const [employees, pays, commission, differences, advances, existing] = await Promise.all([
    Employee.find({}).lean() as Promise<EmployeeDoc[]>,
    payForMonth(month),
    verifiedCommissionByMonth(from, to),
    commissionDifferences(closedMonths),
    SalaryAdvance.find({
      status: "APPROVED",
      installments: { $elemMatch: { status: "SCHEDULED", month: { $lte: month } } },
    }).lean() as Promise<SalaryAdvanceDoc[]>,
    Payslip.find({ month }).lean() as Promise<PayslipDoc[]>,
  ]);
  const commissionOf = new Map(commission.map((c) => [c.person, c.minor]));
  const slipOf = new Map(existing.map((s) => [String(s.employeeId), s]));
  const eligible = employees.filter((e) => employedIn(e, from, to) || differences.has(String(e._id)));
  const summaries = await attendanceSummaries(
    month,
    eligible.map((e) => e._id),
  );
  let changed = 0;
  for (const e of eligible) {
    const id = String(e._id);
    const slip = slipOf.get(id);
    slipOf.delete(id);
    const manual = (slip?.lines ?? []).filter((l) => l.source === "MANUAL") as Line[];
    const lines: Line[] = employedIn(e, from, to) ? baseLines(pays.get(id)) : [];
    const earned = commissionOf.get(id);
    if (earned && employedIn(e, from, to)) lines.push(system("COMMISSION", "Commission", DEPOSIT_CURRENCY, earned, { forMonth: month }));
    for (const a of advances.filter((x) => x.employeeId.equals(e._id)))
      for (const i of a.installments.filter((x) => x.status === "SCHEDULED" && x.month <= month))
        lines.push(
          system("ADVANCE_REPAYMENT", `Advance repayment, ${formatMonth(i.month)}`, a.currency, -i.amountMinor, { advanceId: a._id }),
        );
    const next = [...adjustmentLines(differences.get(id) ?? [], [...lines, ...manual]).filter((l) => l.source === "SYSTEM"), ...manual];
    if (!sameLines((slip?.lines ?? []) as Line[], next)) changed += 1;
    await Payslip.updateOne(
      { month, employeeId: e._id },
      { $set: { lines: next, attendance: summaries.get(id) ?? null } },
      { upsert: true },
    );
  }
  // Someone no longer due a payslip keeps it only if HR added something to it by hand.
  for (const [, s] of slipOf) {
    const manual = s.lines.filter((l) => l.source === "MANUAL");
    if (manual.length === s.lines.length) continue;
    changed += 1;
    if (manual.length) await Payslip.updateOne({ _id: s._id }, { $set: { lines: manual } });
    else await Payslip.deleteOne({ _id: s._id });
  }
  return changed;
}

async function warningsFor(month: Month, slips: PayslipDoc[]): Promise<PayrollWarning[]> {
  const { from, to } = monthRange(month);
  const [employees, pays, commission] = await Promise.all([
    Employee.find({}).lean() as Promise<EmployeeDoc[]>,
    payForMonth(month),
    verifiedCommissionByMonth(from, to),
  ]);
  const recorded = new Set(employees.map((e) => String(e._id)));
  const unrecorded = commission.filter((c) => !recorded.has(c.person));
  const names = await userNames([...employees.map((e) => e._id), ...unrecorded.map((c) => c.person)]);
  const person = (id: string) => ({ id, name: names.get(id) ?? "Unknown" });
  const out: PayrollWarning[] = [];
  for (const e of employees.filter((x) => employedIn(x, from, to))) {
    const id = String(e._id);
    if (!pays.has(id))
      out.push({
        kind: "NO_PAY",
        blocking: true,
        employee: person(id),
        message: "No salary set. Add one, or an explicit zero if they aren't paid a salary.",
      });
    if (e.joinedOn >= from)
      out.push({
        kind: "JOINED",
        blocking: false,
        employee: person(id),
        message: "Joined this month. Salaries aren't prorated, so add a deduction if needed.",
      });
    if (e.leftOn && e.leftOn < to) {
      const owed = await SalaryAdvance.exists({
        employeeId: e._id,
        status: "APPROVED",
        installments: { $elemMatch: { status: "SCHEDULED", month: { $gt: month } } },
      });
      out.push({
        kind: "LEFT",
        blocking: false,
        employee: person(id),
        message: `Left this month. Salaries aren't prorated, so add a deduction if needed.${owed ? " They still have advance installments after this month: move them here." : ""}`,
      });
    }
  }
  for (const c of unrecorded)
    out.push({
      kind: "COMMISSION_NO_RECORD",
      blocking: false,
      employee: person(c.person),
      message: "Has commission this month but no HR record, so it isn't included yet.",
    });
  for (const s of slips) {
    const bad = negativeTotals(s.lines);
    if (bad.length)
      out.push({
        kind: "NEGATIVE",
        blocking: true,
        employee: person(String(s.employeeId)),
        message: `Total is negative in ${bad.map((b) => b.currency).join(" and ")}. Currencies can't offset each other, so change a line.`,
      });
  }
  return out;
}

const toLine = (l: PayslipDoc["lines"][number]): PayLineDto => ({
  id: String(l._id),
  kind: l.kind,
  label: l.label,
  currency: l.currency,
  amountMinor: l.amountMinor,
  source: l.source,
  forMonth: l.forMonth ?? null,
});

async function toSlipDtos(rows: PayslipDoc[]): Promise<PayslipDto[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.employeeId);
  const [names, staff, records] = await Promise.all([
    userNames(ids),
    StaffProfile.find({ _id: { $in: ids } }, { title: 1 }).lean(),
    Employee.find({ _id: { $in: ids } }, { department: 1 }).lean(),
  ]);
  const titleOf = new Map(staff.map((s) => [String(s._id), s.title ?? null]));
  const deptOf = new Map(records.map((r) => [String(r._id), r.department ?? null]));
  return rows
    .map((s) => ({
      id: String(s._id),
      month: s.month,
      employee: {
        id: String(s.employeeId),
        name: names.get(String(s.employeeId)) ?? "Unknown",
        title: titleOf.get(String(s.employeeId)) ?? null,
        department: deptOf.get(String(s.employeeId)) ?? null,
      },
      lines: s.lines.map(toLine),
      totals: totalsByCurrency(s.lines),
      attendance: s.attendance ?? null,
      closedAt: iso(s.closedAt),
    }))
    .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
}

export async function listPayrollMonths(): Promise<PayrollMonths> {
  const [months, slips] = await Promise.all([
    PayrollMonth.find().sort({ month: -1 }).lean(),
    Payslip.find({}, { month: 1, lines: 1 }).lean(),
  ]);
  const rows: PayrollMonthRow[] = months.map((m) => {
    const own = slips.filter((s) => s.month === m.month);
    return {
      month: m.month,
      status: m.status,
      people: own.length,
      totals: totalsByCurrency(own.flatMap((s) => s.lines)),
      closedAt: iso(m.closedAt),
    };
  });
  const draft = months.find((m) => m.status === "DRAFT");
  const closed = months.find((m) => m.status === "CLOSED");
  return { rows, next: draft ? null : closed ? addMonths(closed.month, 1) : monthNow(), firstRun: !months.length };
}

export async function getPayrollMonth(month: Month): Promise<PayrollMonthDetail> {
  const m = await PayrollMonth.findOne({ month }).lean();
  if (!m) throw new NotFoundError("Salary month");
  const rows = (await Payslip.find({ month }).lean()) as PayslipDoc[];
  return {
    month,
    status: m.status,
    closedAt: iso(m.closedAt),
    payslips: await toSlipDtos(rows),
    totals: totalsByCurrency(rows.flatMap((s) => s.lines)),
    warnings: m.status === "DRAFT" ? await warningsFor(month, rows) : [],
  };
}

/** Months run in order, one draft at a time: two open drafts would both pay the same commission difference. */
export async function startMonth(month: Month, actor: HrActor) {
  if (await draftMonth()) throw new BusinessError("Close the month in progress first");
  const closed = await lastClosedMonth();
  if (closed && month !== addMonths(closed, 1)) throw new BusinessError(`The next month to run is ${formatMonth(addMonths(closed, 1))}`);
  if (!closed && month > monthNow()) throw new ValidationError({ month: "Choose this month or an earlier one" });
  await withTx(async () => {
    await PayrollMonth.create([{ month, startedById: new Types.ObjectId(actor.id) }]);
    await rebuildMonth(month);
    await audit({ actor, action: "hr.payroll.start", entityType: "PayrollMonth", entityId: month });
  });
}

async function lockDraft(month: Month) {
  try {
    await lockForUpdate(PayrollMonth, { month, status: "DRAFT" });
  } catch (e) {
    if (e instanceof DbNotFoundError) throw new TransitionError("This month isn't in draft");
    throw e;
  }
}

export async function refreshMonth(month: Month, actor: HrActor) {
  return withTx(async () => {
    await lockDraft(month);
    const changed = await rebuildMonth(month);
    await audit({ actor, action: "hr.payroll.refresh", entityType: "PayrollMonth", entityId: month, after: { changed } });
    return changed;
  });
}

/**
 * One-way. The month is rebuilt under its lock first: if any figure moved since HR last looked (a deposit verified, say),
 * the new figures are saved and nothing closes, so HR never finalises numbers they didn't see.
 */
export async function closeMonth(month: Month, actor: HrActor): Promise<PayrollCloseResult> {
  const result = await withTx(async () => {
    await lockDraft(month);
    const changed = await rebuildMonth(month);
    if (changed) return { closed: false, changed, people: [] as string[] };
    const slips = (await Payslip.find({ month }).lean()) as PayslipDoc[];
    const blocking = (await warningsFor(month, slips)).filter((w) => w.blocking);
    if (blocking.length) throw new BusinessError(`${blocking[0]!.employee.name}: ${blocking[0]!.message}`);
    const at = now();
    await Payslip.updateMany({ month }, { $set: { closedAt: at } });
    await PayrollMonth.updateOne(
      { month, status: "DRAFT" },
      { $set: { status: "CLOSED", closedAt: at, closedById: new Types.ObjectId(actor.id) } },
    );
    const advanceIds = [...new Set(slips.flatMap((s) => s.lines.filter((l) => l.advanceId).map((l) => String(l.advanceId))))].map(
      (x) => new Types.ObjectId(x),
    );
    for (const a of (await SalaryAdvance.find({ _id: { $in: advanceIds } }).lean()) as SalaryAdvanceDoc[]) {
      const installments = a.installments.map((i) =>
        i.status === "SCHEDULED" && i.month <= month ? { month: i.month, amountMinor: i.amountMinor, status: "DEDUCTED" as const } : i,
      );
      const repaid = installments.every((i) => i.status === "DEDUCTED");
      await SalaryAdvance.updateOne({ _id: a._id }, { $set: { installments, ...(repaid ? { status: "REPAID" } : {}) } });
    }
    await audit({ actor, action: "hr.payroll.close", entityType: "PayrollMonth", entityId: month, after: { payslips: slips.length } });
    return { closed: true, changed: 0, people: slips.map((s) => String(s.employeeId)) };
  });
  for (const id of result.people)
    await tellEmployee(id, {
      title: "Your payslip is ready",
      body: `Your payslip for ${formatMonth(month)} is ready.`,
      path: `/salary/${month}`,
    });
  return { closed: result.closed, changed: result.changed };
}

async function loadDraftSlip(id: string) {
  const s = await Payslip.findById(oid(id, "Payslip")).lean();
  if (!s) throw new NotFoundError("Payslip");
  return s as PayslipDoc;
}

export async function addManualLine(id: string, input: ManualLineInput, actor: HrActor) {
  const s = await loadDraftSlip(id);
  await assertNotSelf(actor, s.employeeId, "change your payslip");
  if (!(MANUAL_PAY_LINE_KINDS as readonly string[]).includes(input.kind)) throw new ValidationError({ kind: "Choose bonus or deduction" });
  const minor = toMinor(input.amount);
  await withTx(async () => {
    await lockDraft(s.month);
    await Payslip.updateOne(
      { _id: s._id, closedAt: null },
      {
        $push: {
          lines: {
            kind: input.kind,
            label: input.label.trim(),
            currency: input.currency,
            amountMinor: input.kind === "DEDUCTION" ? -minor : minor,
            source: "MANUAL",
          },
        },
      },
    );
    await audit({ actor, action: "hr.payslip.line.add", entityType: "Payslip", entityId: id, after: { month: s.month, kind: input.kind } });
  });
}

export async function removeManualLine(id: string, lineId: string, actor: HrActor) {
  const s = await loadDraftSlip(id);
  await assertNotSelf(actor, s.employeeId, "change your payslip");
  // Checked here, not in the $pull filter: system lines must never be removable.
  const line = s.lines.find((l) => String(l._id) === lineId && l.source === "MANUAL");
  if (!line) throw new NotFoundError("Line");
  await withTx(async () => {
    await lockDraft(s.month);
    const set = await Payslip.updateOne({ _id: s._id, closedAt: null }, { $pull: { lines: { _id: line._id } } });
    if (set.modifiedCount !== 1) throw new NotFoundError("Line");
    await audit({ actor, action: "hr.payslip.line.remove", entityType: "Payslip", entityId: id, after: { month: s.month } });
  });
}

/** Staff only ever see closed payslips. */
export async function myPayslips(userId: string): Promise<PayslipRow[]> {
  const rows = (await Payslip.find({ employeeId: oid(userId), closedAt: { $ne: null } })
    .sort({ month: -1 })
    .limit(60)
    .lean()) as PayslipDoc[];
  return (await toSlipDtos(rows)).sort((a, b) => b.month.localeCompare(a.month));
}

export async function myPayslip(userId: string, month: Month): Promise<PayslipDto> {
  const s = await Payslip.findOne({ employeeId: oid(userId), month, closedAt: { $ne: null } }).lean();
  if (!s) throw new NotFoundError("Payslip");
  const [dto] = await toSlipDtos([s as PayslipDoc]);
  return dto!;
}
