import type {
  AttendanceMark,
  AttendanceMonth,
  AttendanceSheet,
  AttendanceSummary,
  MarkAttendanceInput,
  MyAttendance,
} from "@edge/contracts";
import { AttendanceDay, Employee, LeaveRequest, PayrollMonth, Types, withTx, type EmployeeDoc } from "@edge/db";
import { dayKey, daysBetween, monthOf, monthRange, type Month } from "@edge/domain/hr/calendar";
import { audit } from "../audit";
import { ValidationError } from "../errors";
import { day as dayText } from "../mappers";
import { userNames } from "../crm/common";
import { assertMonthOpen, calendarFor, employeesBetween, monthNow, offReason, today, toDay, workCalendar, type HrActor } from "./common";

const byName = <T extends { name: string }>(rows: T[]) => rows.sort((a, b) => a.name.localeCompare(b.name));
const holidayName = (cal: { holidays: { day: string; name: string }[] }, day: Date) =>
  cal.holidays.find((h) => h.day === dayKey(day))?.name ?? null;

export async function attendanceSheet(dayIso: string | undefined): Promise<AttendanceSheet> {
  const day = dayIso ? toDay(dayIso) : today();
  const next = new Date(day.getTime() + 86_400_000);
  const [people, marks, cal, closed] = await Promise.all([
    employeesBetween(day, next),
    AttendanceDay.find({ day }).lean(),
    workCalendar(),
    PayrollMonth.exists({ month: monthOf(day), status: "CLOSED" }),
  ]);
  const names = await userNames(people.map((p) => p._id));
  const byPerson = new Map(marks.map((m) => [String(m.employeeId), m]));
  return {
    day: dayText(day)!,
    locked: !!closed,
    future: day > today(),
    rows: byName(
      people.map((p) => {
        const m = byPerson.get(String(p._id));
        return {
          employeeId: String(p._id),
          name: names.get(String(p._id)) ?? "Unknown",
          status: m?.status ?? null,
          source: m?.source ?? null,
          note: m?.note ?? null,
          off: offReason(day, calendarFor(cal, p)),
          holidayName: holidayName(cal, day),
        };
      }),
    ),
  };
}

function markFor(
  p: Pick<EmployeeDoc, "weeklyOffOverride">,
  day: Date,
  row: { status: AttendanceMark["status"]; note?: string | null } | undefined,
  cal: Awaited<ReturnType<typeof workCalendar>>,
): AttendanceMark {
  return {
    status: row?.status ?? null,
    note: row?.note ?? null,
    off: offReason(day, calendarFor(cal, p)),
    holidayName: holidayName(cal, day),
  };
}

export async function attendanceMonth(month: Month = monthNow()): Promise<AttendanceMonth> {
  const { from, to } = monthRange(month);
  const days = daysBetween(from, new Date(to.getTime() - 86_400_000));
  const [people, rows, cal] = await Promise.all([
    employeesBetween(from, to),
    AttendanceDay.find({ day: { $gte: from, $lt: to } }).lean(),
    workCalendar(),
  ]);
  const names = await userNames(people.map((p) => p._id));
  const byKey = new Map(rows.map((r) => [`${r.employeeId}:${dayKey(r.day)}`, r]));
  return {
    month,
    days: days.map(dayKey),
    people: byName(
      people.map((p) => ({
        employeeId: String(p._id),
        name: names.get(String(p._id)) ?? "Unknown",
        marks: Object.fromEntries(days.map((d) => [dayKey(d), markFor(p, d, byKey.get(`${p._id}:${dayKey(d)}`), cal)])),
      })),
    ),
  };
}

/** HR's marks for one day. Rows written by approved leave stay as they are: cancelling the leave is what changes them. */
export async function markAttendance(input: MarkAttendanceInput, actor: HrActor) {
  const day = toDay(input.day);
  if (day > today()) throw new ValidationError({ day: "You can't mark a day that hasn't happened yet" });
  const ids = input.rows.map((r) => new Types.ObjectId(r.employeeId));
  await withTx(async () => {
    await assertMonthOpen(monthOf(day));
    const onLeave = new Set(
      (await AttendanceDay.find({ day, employeeId: { $in: ids }, source: "LEAVE" }, { employeeId: 1 }).lean()).map((r) =>
        String(r.employeeId),
      ),
    );
    const by = new Types.ObjectId(actor.id);
    const ops = input.rows
      .filter((r) => !onLeave.has(r.employeeId))
      .map((r) => {
        const filter = { employeeId: new Types.ObjectId(r.employeeId), day };
        if (!r.status) return { deleteOne: { filter } };
        return {
          updateOne: {
            filter,
            update: { $set: { status: r.status, source: "HR" as const, note: r.note?.trim() || null, markedById: by } },
            upsert: true,
          },
        };
      });
    if (ops.length) await AttendanceDay.bulkWrite(ops);
    await audit({ actor, action: "hr.attendance.mark", entityType: "AttendanceDay", entityId: input.day, after: { people: ops.length } });
  });
}

const emptySummary = (): AttendanceSummary => ({ present: 0, absent: 0, halfDay: 0, late: 0, leave: 0, unpaidLeaveCenti: 0 });

/** Each person's month in numbers: shown on the payslip for HR's eye, never used to change pay. */
export async function attendanceSummaries(month: Month, ids: Types.ObjectId[]) {
  const { from, to } = monthRange(month);
  const [rows, unpaid] = await Promise.all([
    AttendanceDay.aggregate<{ _id: { e: Types.ObjectId; s: string }; n: number }>([
      { $match: { employeeId: { $in: ids }, day: { $gte: from, $lt: to } } },
      { $group: { _id: { e: "$employeeId", s: "$status" }, n: { $sum: 1 } } },
    ]),
    LeaveRequest.find(
      { employeeId: { $in: ids }, status: "APPROVED", paid: false, fromDay: { $lt: to }, toDay: { $gte: from } },
      { employeeId: 1, days: 1 },
    ).lean(),
  ]);
  const out = new Map<string, AttendanceSummary>();
  const of = (id: Types.ObjectId) => {
    const k = String(id);
    if (!out.has(k)) out.set(k, emptySummary());
    return out.get(k)!;
  };
  const field: Record<string, keyof AttendanceSummary> = {
    PRESENT: "present",
    ABSENT: "absent",
    HALF_DAY: "halfDay",
    LATE: "late",
    LEAVE: "leave",
  };
  for (const r of rows) of(r._id.e)[field[r._id.s]!] += r.n;
  for (const r of unpaid) for (const d of r.days) if (d.day >= from && d.day < to) of(r.employeeId).unpaidLeaveCenti += d.centi;
  return out;
}

export async function myAttendance(userId: string, month: Month = monthNow()): Promise<MyAttendance> {
  const e = (await Employee.findById(new Types.ObjectId(userId)).lean()) as EmployeeDoc | null;
  if (!e) return { setUp: false, month, days: [], summary: emptySummary() };
  const { from, to } = monthRange(month);
  const last = new Date(Math.min(to.getTime() - 86_400_000, today().getTime()));
  const days = from <= last ? daysBetween(from, last) : [];
  const [rows, cal, summaries] = await Promise.all([
    AttendanceDay.find({ employeeId: e._id, day: { $gte: from, $lt: to } }).lean(),
    workCalendar(),
    attendanceSummaries(month, [e._id]),
  ]);
  const byDay = new Map(rows.map((r) => [dayKey(r.day), r]));
  return {
    setUp: true,
    month,
    days: days.map((d) => ({ day: dayKey(d), ...markFor(e, d, byDay.get(dayKey(d)), cal) })).reverse(),
    summary: summaries.get(String(e._id)) ?? emptySummary(),
  };
}
