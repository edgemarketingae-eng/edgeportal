import type {
  BalanceAdjustInput,
  EmployeeLeaveDto,
  LeaveApplyInput,
  LeaveBalanceDto,
  LeaveFilters,
  LeaveLedgerRow,
  LeaveRequestDto,
  MyLeave,
} from "@edge/contracts";
import {
  AttendanceDay,
  Employee,
  FileAsset,
  LeaveLedger,
  LeaveRequest,
  lockForUpdate,
  Types,
  withTx,
  type EmployeeDoc,
  type LeaveLedgerDoc,
  type LeaveRequestDoc,
} from "@edge/db";
import { now } from "@edge/domain/clock";
import { dubaiDateOnly, formatDate } from "@edge/domain/dates";
import { formatMonth, monthOf, monthsBetween, type Month } from "@edge/domain/hr/calendar";
import { HALF_DAY_LABELS } from "@edge/domain/hr/labels";
import { carryForward, centiByYear, formatDays, leaveDays, monthlyAccrual, sumCenti, toCentiDays } from "@edge/domain/hr/leave";
import type { SettingValue } from "@edge/domain/settings/schema";
import { audit } from "../audit";
import { userNames } from "../crm/common";
import { BusinessError, NotFoundError, TransitionError, ValidationError } from "../errors";
import { oid } from "../ids";
import { day as dayText, iso } from "../mappers";
import { notifyPermissionHolders } from "../notifications/in-app";
import { findPage } from "../paging";
import { getSetting } from "../settings";
import { claimFile } from "../files/service";
import {
  assertMonthOpen,
  assertNotSelf,
  calendarFor,
  closedMonthsIn,
  hrHref,
  loadEmployee,
  loadOwnRecord,
  tellEmployee,
  today,
  toDay,
  workCalendar,
  type HrActor,
} from "./common";

type LeaveType = SettingValue<"hr.leaveTypes">[number];
const OPEN_STATUSES = ["PENDING", "APPROVED"] as const;
const tracksBalance = (t: Pick<LeaveType, "accrual">) => t.accrual !== "NONE";
const monthsOfDays = (days: { day: Date }[]) => [...new Set(days.map((d) => monthOf(d.day)))];
const rangeText = (r: Pick<LeaveRequestDoc, "fromDay" | "toDay">) =>
  r.fromDay.getTime() === r.toDay.getTime() ? formatDate(r.fromDay) : `${formatDate(r.fromDay)} to ${formatDate(r.toDay)}`;

/** One leave year per type: the balance (sum of every row) and what was actually taken. Reads inside a transaction use its snapshot. */
async function yearTotals(employeeId: Types.ObjectId, year: number) {
  const rows = await LeaveLedger.aggregate<{ _id: string; balance: number; taken: number }>([
    { $match: { employeeId, leaveYear: year } },
    {
      $group: {
        _id: "$typeKey",
        balance: { $sum: "$centiDays" },
        taken: { $sum: { $cond: [{ $in: ["$kind", ["TAKEN", "RETURNED"]] }, "$centiDays", 0] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id, { balance: r.balance, taken: Math.max(0, -r.taken) }]));
}

async function balancesFor(e: EmployeeDoc, year: number): Promise<LeaveBalanceDto[]> {
  const [types, totals] = await Promise.all([getSetting("hr.leaveTypes"), yearTotals(e._id, year)]);
  return types
    .filter((t) => t.active || totals.get(t.key)?.balance)
    .map((t) => ({
      typeKey: t.key,
      name: t.name,
      paid: t.paid,
      tracksBalance: tracksBalance(t),
      needsAttachment: t.needsAttachment,
      balanceCenti: totals.get(t.key)?.balance ?? 0,
      takenCenti: totals.get(t.key)?.taken ?? 0,
      active: t.active,
    }));
}

async function ledgerRows(employeeId: Types.ObjectId): Promise<LeaveLedgerRow[]> {
  const [rows, types] = await Promise.all([
    LeaveLedger.find({ employeeId }).sort({ createdAt: -1, _id: -1 }).limit(60).lean(),
    getSetting("hr.leaveTypes"),
  ]);
  const names = await userNames(rows.map((r) => r.byId));
  return (rows as LeaveLedgerDoc[]).map((r) => ({
    id: String(r._id),
    typeName: types.find((t) => t.key === r.typeKey)?.name ?? r.typeKey,
    leaveYear: r.leaveYear,
    kind: r.kind,
    centiDays: r.centiDays,
    note: r.note ?? null,
    by: r.byId ? (names.get(String(r.byId)) ?? "Unknown") : null,
    createdAt: iso(r.createdAt)!,
  }));
}

async function toLeaveDtos(rows: LeaveRequestDoc[]): Promise<LeaveRequestDto[]> {
  if (!rows.length) return [];
  const year = today().getUTCFullYear();
  const pendingPeople = [...new Set(rows.filter((r) => r.status === "PENDING" && r.tracksBalance).map((r) => String(r.employeeId)))];
  const [names, files, totals] = await Promise.all([
    userNames(rows.flatMap((r) => [r.employeeId, r.decidedById])),
    FileAsset.find({ _id: { $in: rows.map((r) => r.attachmentId).filter(Boolean) } }, { originalName: 1 }).lean(),
    Promise.all(pendingPeople.map(async (p) => [p, await yearTotals(new Types.ObjectId(p), year)] as const)),
  ]);
  const fileName = new Map(files.map((f) => [String(f._id), f.originalName]));
  const totalsOf = new Map(totals);
  return rows.map((r) => {
    const balance = r.status === "PENDING" && r.tracksBalance ? (totalsOf.get(String(r.employeeId))?.get(r.typeKey)?.balance ?? 0) : null;
    return {
      id: String(r._id),
      employee: { id: String(r.employeeId), name: names.get(String(r.employeeId)) ?? "Unknown" },
      typeKey: r.typeKey,
      typeName: r.typeName,
      paid: r.paid,
      tracksBalance: r.tracksBalance,
      fromDay: dayText(r.fromDay)!,
      toDay: dayText(r.toDay)!,
      halfDay: r.halfDay ?? null,
      centiDays: r.centiDays,
      reason: r.reason ?? null,
      attachment: r.attachmentId ? { id: String(r.attachmentId), name: fileName.get(String(r.attachmentId)) ?? "Attachment" } : null,
      status: r.status,
      decidedBy: r.decidedById ? { id: String(r.decidedById), name: names.get(String(r.decidedById)) ?? "Unknown" } : null,
      decidedAt: iso(r.decidedAt),
      decisionNote: r.decisionNote ?? null,
      allowedNegative: !!r.allowedNegative,
      createdAt: iso(r.createdAt)!,
      balanceAfterCenti: balance === null ? null : balance - r.centiDays,
    };
  });
}

export async function myLeave(userId: string): Promise<MyLeave> {
  const year = today().getUTCFullYear();
  const e = (await Employee.findById(oid(userId)).lean()) as EmployeeDoc | null;
  if (!e) return { setUp: false, year, balances: [], requests: [], ledger: [] };
  const [balances, rows, ledger] = await Promise.all([
    balancesFor(e, year),
    LeaveRequest.find({ employeeId: e._id }).sort({ fromDay: -1 }).limit(50).lean(),
    ledgerRows(e._id),
  ]);
  return { setUp: true, year, balances, requests: await toLeaveDtos(rows as LeaveRequestDoc[]), ledger };
}

export async function myBalances(e: EmployeeDoc) {
  return balancesFor(e, today().getUTCFullYear());
}

export async function employeeLeave(id: string): Promise<EmployeeLeaveDto> {
  const e = await loadEmployee(id);
  const year = today().getUTCFullYear();
  const [balances, ledger] = await Promise.all([balancesFor(e, year), ledgerRows(e._id)]);
  return { year, balances, ledger };
}

export async function listLeaveRequests(q: LeaveFilters) {
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.staff) filter.employeeId = oid(q.staff, "Employee");
  const page = await findPage<LeaveRequestDoc>(LeaveRequest, filter, { fromDay: -1 }, q);
  return { ...page, rows: await toLeaveDtos(page.rows) };
}

async function fileRequest(e: EmployeeDoc, input: LeaveApplyInput, actor: HrActor, byHr: boolean) {
  const types = await getSetting("hr.leaveTypes");
  const type = types.find((t) => t.key === input.typeKey && t.active);
  if (!type) throw new ValidationError({ typeKey: "Choose a leave type" });
  const from = toDay(input.fromDay);
  const to = toDay(input.toDay);
  if (to < from) throw new ValidationError({ toDay: "The last day can't be before the first day" });
  const half = input.halfDay ?? null;
  if (half && from.getTime() !== to.getTime()) throw new ValidationError({ halfDay: "A half day has to be a single day" });
  if (from < e.joinedOn) throw new ValidationError({ fromDay: "This is before the joining date" });
  if (type.needsAttachment && !input.attachmentId && !byHr)
    throw new ValidationError({ attachment: `${type.name} needs a document attached` });
  const days = leaveDays(from, to, calendarFor(await workCalendar(), e), !!half);
  if (!days.length) throw new ValidationError({ fromDay: "These dates are all days off" });
  const closed = await closedMonthsIn(monthsOfDays(days));
  if (closed.length)
    throw new BusinessError(
      `${formatMonth(closed[0]!)} is already closed, so leave can't be added to it. Ask HR to adjust the balance instead.`,
    );
  if (await LeaveRequest.exists({ employeeId: e._id, status: { $in: OPEN_STATUSES }, fromDay: { $lte: to }, toDay: { $gte: from } }))
    throw new BusinessError("These dates overlap another leave request", { fromDay: "Overlaps another request" });
  const centiDays = sumCenti(days);
  const id = await withTx(async () => {
    const [r] = await LeaveRequest.create([
      {
        employeeId: e._id,
        typeKey: type.key,
        typeName: type.name,
        paid: type.paid,
        tracksBalance: tracksBalance(type),
        fromDay: from,
        toDay: to,
        halfDay: half,
        days,
        centiDays,
        reason: input.reason?.trim() || null,
        attachmentId: input.attachmentId ? new Types.ObjectId(input.attachmentId) : null,
        filedById: new Types.ObjectId(actor.id),
      },
    ]);
    if (input.attachmentId) await claimFile(input.attachmentId, actor, { linkedType: "LeaveRequest", linkedId: r!._id, ownerId: e._id });
    await audit({
      actor,
      action: "hr.leave.apply",
      entityType: "LeaveRequest",
      entityId: String(r!._id),
      after: { typeKey: type.key, from: input.fromDay, to: input.toDay, centiDays },
    });
    return String(r!._id);
  });
  await notifyPermissionHolders("hr.manage", {
    title: "Leave to approve",
    body: `${(await userNames([e._id])).get(String(e._id)) ?? "Someone"}: ${type.name}, ${formatDays(centiDays)} (${rangeText({ fromDay: from, toDay: to })})`,
    href: hrHref("/hr/leave"),
  });
  return id;
}

export async function applyLeave(userId: string, input: LeaveApplyInput, actor: HrActor) {
  return fileRequest(await loadOwnRecord(userId), input, actor, false);
}

export async function fileLeaveFor(employeeId: string, input: LeaveApplyInput, actor: HrActor) {
  return fileRequest(await loadEmployee(employeeId), input, actor, true);
}

async function loadRequest(id: string) {
  const r = await LeaveRequest.findById(oid(id, "Leave request")).lean();
  if (!r) throw new NotFoundError("Leave request");
  return r as LeaveRequestDoc;
}

/**
 * Approve: debit each leave year and write the leave days to attendance, replacing any HR mark. The employee lock runs
 * first because ledger inserts never conflict: two approvals at once could otherwise both pass the balance check.
 */
export async function approveLeave(id: string, input: { note?: string; allowNegative?: boolean }, actor: HrActor) {
  const r = await loadRequest(id);
  await assertNotSelf(actor, r.employeeId, "approve your leave");
  if (r.status !== "PENDING") throw new TransitionError("Only pending leave can be approved");
  const months = monthsOfDays(r.days);
  const closed = await closedMonthsIn(months);
  if (closed.length)
    throw new BusinessError(
      `${formatMonth(closed[0]!)} is closed, so this leave can't be approved. Reject it and adjust the balance instead.`,
    );
  await withTx(async () => {
    await lockForUpdate(Employee, { _id: r.employeeId });
    for (const m of months) await assertMonthOpen(m);
    if (
      await LeaveRequest.exists({
        _id: { $ne: r._id },
        employeeId: r.employeeId,
        status: "APPROVED",
        fromDay: { $lte: r.toDay },
        toDay: { $gte: r.fromDay },
      })
    )
      throw new BusinessError("This overlaps leave that's already approved");
    let wentNegative = false;
    if (r.tracksBalance) {
      for (const [year, centi] of centiByYear(r.days)) {
        const balance = (await yearTotals(r.employeeId, year)).get(r.typeKey)?.balance ?? 0;
        if (balance - centi >= 0) continue;
        if (!input.allowNegative)
          throw new BusinessError(`Only ${formatDays(balance)} left in ${year}. Tick "allow negative balance" to approve anyway.`);
        wentNegative = true;
      }
      await LeaveLedger.create(
        [...centiByYear(r.days)].map(([year, centi]) => ({
          employeeId: r.employeeId,
          typeKey: r.typeKey,
          leaveYear: year,
          kind: "TAKEN" as const,
          centiDays: -centi,
          key: `taken:${r._id}:${year}`,
          leaveRequestId: r._id,
          byId: new Types.ObjectId(actor.id),
        })),
        { ordered: true },
      );
    }
    const set = await LeaveRequest.updateOne(
      { _id: r._id, status: "PENDING" },
      {
        $set: {
          status: "APPROVED",
          decidedById: new Types.ObjectId(actor.id),
          decidedAt: now(),
          decisionNote: input.note?.trim() || null,
          allowedNegative: wentNegative,
        },
      },
    );
    if (set.modifiedCount !== 1) throw new TransitionError("Only pending leave can be approved");
    const note = r.halfDay ? `${HALF_DAY_LABELS[r.halfDay]} only` : null;
    await AttendanceDay.bulkWrite(
      r.days.map((d) => ({
        updateOne: {
          filter: { employeeId: r.employeeId, day: d.day },
          update: {
            $set: {
              status: "LEAVE" as const,
              source: "LEAVE" as const,
              note,
              leaveRequestId: r._id,
              markedById: new Types.ObjectId(actor.id),
            },
          },
          upsert: true,
        },
      })),
    );
    await audit({
      actor,
      action: "hr.leave.approve",
      entityType: "LeaveRequest",
      entityId: id,
      after: { centiDays: r.centiDays, allowedNegative: wentNegative },
    });
  });
  await tellEmployee(String(r.employeeId), { title: "Leave approved", body: `${r.typeName}: ${rangeText(r)}.`, path: "/leave" });
}

export async function rejectLeave(id: string, input: { note?: string }, actor: HrActor) {
  const r = await loadRequest(id);
  await assertNotSelf(actor, r.employeeId, "decide your leave");
  const note = input.note?.trim() || null;
  await withTx(async () => {
    const set = await LeaveRequest.updateOne(
      { _id: r._id, status: "PENDING" },
      { $set: { status: "REJECTED", decidedById: new Types.ObjectId(actor.id), decidedAt: now(), decisionNote: note } },
    );
    if (set.modifiedCount !== 1) throw new TransitionError("Only pending leave can be rejected");
    await audit({ actor, action: "hr.leave.reject", entityType: "LeaveRequest", entityId: id, after: { note } });
  });
  await tellEmployee(String(r.employeeId), {
    title: "Leave not approved",
    body: `${r.typeName}: ${rangeText(r)}.${note ? ` ${note}` : ""}`,
    path: "/leave",
  });
}

/** Inside withTx: give back `days` of an approved request. Days in closed months stay frozen; the rest return to the current leave year. */
async function returnDays(r: LeaveRequestDoc, days: { day: Date; centi: number }[], key: string, note: string, actor: HrActor) {
  const closed = new Set(await closedMonthsIn(monthsOfDays(days)));
  const open = days.filter((d) => !closed.has(monthOf(d.day)));
  for (const m of monthsOfDays(open)) await assertMonthOpen(m);
  if (open.length) await AttendanceDay.deleteMany({ leaveRequestId: r._id, day: { $in: open.map((d) => d.day) } });
  const centi = sumCenti(open);
  if (r.tracksBalance && centi)
    await LeaveLedger.create([
      {
        employeeId: r.employeeId,
        typeKey: r.typeKey,
        leaveYear: today().getUTCFullYear(),
        kind: "RETURNED",
        centiDays: centi,
        key,
        leaveRequestId: r._id,
        note,
        byId: new Types.ObjectId(actor.id),
      },
    ]);
  return { returned: centi, frozen: sumCenti(days) - centi };
}

/** HR cancels a request. Approved leave that has started gives back only the days not locked in a closed salary month. */
export async function cancelLeave(id: string, input: { note?: string }, actor: HrActor) {
  const r = await loadRequest(id);
  await assertNotSelf(actor, r.employeeId, "cancel your approved leave");
  if (r.status !== "PENDING" && r.status !== "APPROVED") throw new TransitionError("This leave is already closed");
  const note = input.note?.trim() || null;
  const out = await withTx(async () => {
    await lockForUpdate(Employee, { _id: r.employeeId });
    const set = await LeaveRequest.updateOne(
      { _id: r._id, status: r.status },
      { $set: { status: "CANCELLED", decidedById: new Types.ObjectId(actor.id), decidedAt: now(), decisionNote: note } },
    );
    if (set.modifiedCount !== 1) throw new TransitionError("This leave changed meanwhile; reload and try again");
    const result =
      r.status === "APPROVED" ? await returnDays(r, r.days, `returned:${r._id}`, "Leave cancelled", actor) : { returned: 0, frozen: 0 };
    await audit({ actor, action: "hr.leave.cancel", entityType: "LeaveRequest", entityId: id, after: { ...result, note } });
    return result;
  });
  await tellEmployee(String(r.employeeId), {
    title: "Leave cancelled",
    body: `${r.typeName}: ${rangeText(r)}.${note ? ` ${note}` : ""}`,
    path: "/leave",
  });
  return out;
}

/** Staff can withdraw their own request while it is still pending. */
export async function cancelMyLeave(id: string, userId: string, actor: HrActor) {
  const r = await loadRequest(id);
  if (String(r.employeeId) !== userId) throw new NotFoundError("Leave request");
  await withTx(async () => {
    const set = await LeaveRequest.updateOne(
      { _id: r._id, status: "PENDING" },
      { $set: { status: "CANCELLED", decidedById: new Types.ObjectId(actor.id), decidedAt: now() } },
    );
    if (set.modifiedCount !== 1) throw new TransitionError("Only pending leave can be withdrawn. Ask HR to cancel approved leave.");
    await audit({ actor, action: "hr.leave.withdraw", entityType: "LeaveRequest", entityId: id });
  });
}

/** A person is leaving: pending requests past the date go, and approved leave after it is cut back and its days returned. */
export async function cancelLeaveFrom(employeeId: string, leftOn: Date, actor: HrActor) {
  const _id = oid(employeeId, "Employee");
  const rows = (await LeaveRequest.find({
    employeeId: _id,
    status: { $in: OPEN_STATUSES },
    toDay: { $gt: leftOn },
  }).lean()) as LeaveRequestDoc[];
  for (const r of rows) {
    const after = r.days.filter((d) => d.day > leftOn);
    const kept = r.days.filter((d) => d.day <= leftOn);
    await withTx(async () => {
      await lockForUpdate(Employee, { _id });
      const set = kept.length
        ? { days: kept, toDay: kept[kept.length - 1]!.day, centiDays: sumCenti(kept) }
        : {
            status: "CANCELLED" as const,
            decidedById: new Types.ObjectId(actor.id),
            decidedAt: now(),
            decisionNote: "Leaving the company",
          };
      await LeaveRequest.updateOne({ _id: r._id, status: r.status }, { $set: set });
      if (r.status === "APPROVED" && after.length) await returnDays(r, after, `returned:${r._id}:leaving`, "Leaving the company", actor);
      await audit({
        actor,
        action: "hr.leave.trim",
        entityType: "LeaveRequest",
        entityId: String(r._id),
        after: { leftOn: dayText(leftOn), removed: sumCenti(after) },
      });
    });
  }
}

export async function adjustBalance(employeeId: string, input: BalanceAdjustInput, actor: HrActor) {
  await assertNotSelf(actor, employeeId, "adjust your leave balance");
  const e = await loadEmployee(employeeId);
  const type = (await getSetting("hr.leaveTypes")).find((t) => t.key === input.typeKey);
  if (!type || !tracksBalance(type)) throw new ValidationError({ typeKey: "Choose a leave type that keeps a balance" });
  const centiDays = toCentiDays(Number(input.days));
  await withTx(async () => {
    await lockForUpdate(Employee, { _id: e._id });
    await LeaveLedger.create([
      {
        employeeId: e._id,
        typeKey: type.key,
        leaveYear: today().getUTCFullYear(),
        kind: "ADJUSTMENT",
        centiDays,
        note: input.note.trim(),
        byId: new Types.ObjectId(actor.id),
      },
    ]);
    await audit({
      actor,
      action: "hr.leave.adjust",
      entityType: "Employee",
      entityId: employeeId,
      after: { typeKey: type.key, centiDays, note: input.note.trim() },
    });
  });
}

/** Rows a year of accrual should have for one person and type up to `through`. Each key is unique, so a rerun adds nothing. */
function accrualRows(e: EmployeeDoc, t: LeaveType, year: number, through: Month) {
  const days = e.leaveOverrides?.find((o) => o.typeKey === t.key)?.daysPerYear ?? t.daysPerYear;
  if (!t.active || days <= 0) return [];
  const leftMonth = e.leftOn ? monthOf(e.leftOn) : null;
  const last = leftMonth && leftMonth < through ? leftMonth : through;
  const base = { employeeId: e._id, typeKey: t.key, leaveYear: year, kind: "ACCRUAL" as const };
  if (t.accrual === "YEARLY") {
    const january = `${year}-01`;
    return january >= e.accrualFromMonth && january <= last
      ? [{ ...base, centiDays: toCentiDays(days), key: `grant:${e._id}:${t.key}:${year}` }]
      : [];
  }
  const first = `${year}-01` > e.accrualFromMonth ? `${year}-01` : e.accrualFromMonth;
  if (first > last) return [];
  return monthsBetween(first, last)
    .map((m) => ({ ...base, centiDays: monthlyAccrual(days, Number(m.slice(5))), key: `accrual:${e._id}:${t.key}:${m}` }))
    .filter((r) => r.centiDays > 0);
}

async function writeOnce(rows: { key: string }[]) {
  if (!rows.length) return 0;
  const r = await LeaveLedger.bulkWrite(
    rows.map((row) => ({ updateOne: { filter: { key: row.key }, update: { $setOnInsert: row }, upsert: true } })),
  );
  return r.upsertedCount;
}

/**
 * Daily, in a fixed order, and safe to rerun or to miss days: finish last year's accruals, carry its balances forward,
 * then post this year's accruals. Keeping this in one job means January's accrual can't run ahead of the year rollover.
 */
export async function runLeaveDaily(asOf: Date = now()) {
  const day = dubaiDateOnly(asOf);
  const year = day.getUTCFullYear();
  const lastYear = year - 1;
  const [employees, types] = await Promise.all([Employee.find({}).lean() as Promise<EmployeeDoc[]>, getSetting("hr.leaveTypes")]);
  const tracked = types.filter(tracksBalance);
  const each = (fn: (e: EmployeeDoc, t: LeaveType) => { key: string }[]) => employees.flatMap((e) => tracked.flatMap((t) => fn(e, t)));

  let written = await writeOnce(each((e, t) => accrualRows(e, t, lastYear, `${lastYear}-12`)));

  const closing = await LeaveLedger.aggregate<{ _id: { e: Types.ObjectId; t: string }; v: number }>([
    { $match: { leaveYear: lastYear } },
    { $group: { _id: { e: "$employeeId", t: "$typeKey" }, v: { $sum: "$centiDays" } } },
  ]);
  const closingOf = new Map(closing.map((c) => [`${c._id.e}:${c._id.t}`, c.v]));
  const yearStart = new Date(Date.UTC(year, 0, 1));
  written += await writeOnce(
    each((e, t) => {
      if (e.leftOn && e.leftOn < yearStart) return [];
      const balance = closingOf.get(`${e._id}:${t.key}`);
      const carried = balance === undefined ? 0 : carryForward(balance, t.carryForwardDays);
      if (!carried) return [];
      return [
        {
          employeeId: e._id,
          typeKey: t.key,
          leaveYear: year,
          kind: "CARRY_FORWARD" as const,
          centiDays: carried,
          key: `carry:${e._id}:${t.key}:${year}`,
          note: `From ${lastYear}`,
        },
      ];
    }),
  );

  written += await writeOnce(each((e, t) => accrualRows(e, t, year, monthOf(day))));
  return { employees: employees.length, written };
}
