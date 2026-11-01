import { AuthUser, Employee, lockForUpdate, PayrollMonth, Types, type EmployeeDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import { dubaiDateOnly } from "@edge/domain/dates";
import type { Actor } from "@edge/domain/enums";
import { formatMonth, isHoliday, isWeeklyOff, monthOf, type Month, type WorkCalendar } from "@edge/domain/hr/calendar";
import { env } from "../env";
import { BusinessError, ForbiddenError, NotFoundError, TransitionError } from "../errors";
import { oid } from "../ids";
import { queueEmail } from "../notifications/email";
import { notifyUser } from "../notifications/in-app";
import { flushOutbox } from "../runtime";
import { getSetting } from "../settings";
import { isSuperAdmin } from "../staff/service";

export type HrActor = Actor & { type: "USER" };

/** Absolute links into the staff portal (notifications and emails may be read from any app). */
export const hrHref = (path = "") => `${env.CONSOLE_APP_URL}/staff${path}`;

export const today = () => dubaiDateOnly(now());
export const toDay = (s: string) => new Date(`${s}T00:00:00.000Z`);

export const NOT_SET_UP = "HR hasn't set up your record yet.";

export async function loadEmployee(id: string | Types.ObjectId): Promise<EmployeeDoc> {
  const e = await Employee.findById(oid(id, "Employee")).lean();
  if (!e) throw new NotFoundError("Employee");
  return e as EmployeeDoc;
}

/** The person's own record, for self-service actions. */
export async function loadOwnRecord(userId: string): Promise<EmployeeDoc> {
  const e = await Employee.findById(oid(userId, "Employee")).lean();
  if (!e) throw new BusinessError(NOT_SET_UP);
  return e as EmployeeDoc;
}

/** Nobody signs off their own pay or time off. A super admin is exempt: nobody sits above them. */
export async function assertNotSelf(actor: HrActor, employeeId: string | Types.ObjectId, what: string) {
  if (actor.id === String(employeeId) && !(await isSuperAdmin(actor.id))) throw new ForbiddenError(`Someone else has to ${what}.`);
}

export async function draftMonth() {
  return PayrollMonth.findOne({ status: "DRAFT" }).lean();
}

export async function lastClosedMonth(): Promise<Month | null> {
  return (await PayrollMonth.findOne({ status: "CLOSED" }, { month: 1 }).sort({ month: -1 }).lean())?.month ?? null;
}

/**
 * Inside withTx, before changing data that belongs to a month: closed months refuse, and an open draft is locked.
 * Transactions only conflict on the same document, so without this lock an edit could commit while the month closes.
 */
export async function assertMonthOpen(month: Month) {
  const m = await PayrollMonth.findOne({ month }, { status: 1 }).lean();
  if (!m) return;
  if (m.status === "CLOSED") throw new TransitionError(`${formatMonth(month)} is closed, so this can't change`);
  await lockForUpdate(PayrollMonth, { _id: m._id, status: "DRAFT" });
}

/** Inside withTx, before changing what a salary run reads (pay, advances): the open draft, if any, waits for this. */
export async function lockDraftMonth() {
  const m = await draftMonth();
  if (m) await lockForUpdate(PayrollMonth, { _id: m._id, status: "DRAFT" });
}

export async function closedMonthsIn(months: Month[]) {
  const rows = await PayrollMonth.find({ month: { $in: months }, status: "CLOSED" }, { month: 1 }).lean();
  return rows.map((r) => r.month);
}

/** Everyone employed at some point in `[from, to)`. */
export async function employeesBetween(from: Date, to: Date) {
  return (await Employee.find({ joinedOn: { $lt: to }, $or: [{ leftOn: null }, { leftOn: { $gte: from } }] }).lean()) as EmployeeDoc[];
}

export async function workCalendar() {
  return getSetting("hr.calendar");
}

/** The company calendar with this person's weekly off, if their contract differs. */
export function calendarFor(
  cal: { weeklyOffDays: number[]; holidays: { day: string; name: string }[] },
  e: Pick<EmployeeDoc, "weeklyOffOverride">,
): WorkCalendar {
  return { weeklyOffDays: e.weeklyOffOverride ?? cal.weeklyOffDays, holidays: cal.holidays.map((h) => h.day) };
}

export function offReason(day: Date, cal: WorkCalendar) {
  return isHoliday(day, cal) ? ("HOLIDAY" as const) : isWeeklyOff(day, cal) ? ("WEEKLY_OFF" as const) : null;
}

/** In-app note plus an email, after the change has committed. Keep figures out of `body`: it stays in the notification log. */
export async function tellEmployee(employeeId: string, n: { title: string; body: string; path: string }) {
  const href = hrHref(n.path);
  await notifyUser(employeeId, { title: n.title, body: n.body, href });
  const user = await AuthUser.findById(employeeId, { name: 1, email: 1, disabledAt: 1 }).lean();
  if (!user || user.disabledAt) return;
  await queueEmail({
    to: user.email,
    userId: employeeId,
    template: "hr.notice",
    data: { name: user.name, title: n.title, body: n.body, url: href },
  });
  await flushOutbox();
}

export const monthNow = () => monthOf(today());
