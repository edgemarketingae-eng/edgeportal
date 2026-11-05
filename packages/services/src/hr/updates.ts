import {
  WORK_UPDATE_BACKFILL_DAYS,
  type MyWorkUpdates,
  type PersonWorkUpdates,
  type WorkUpdateDto,
  type WorkUpdateInput,
  type WorkUpdatesDay,
} from "@edge/contracts";
import { AttendanceDay, AuthUser, Employee, StaffProfile, Types, WorkUpdate, type WorkUpdateDoc } from "@edge/db";
import { dayKey } from "@edge/domain/hr/calendar";
import { NotFoundError, ValidationError } from "../errors";
import { oid } from "../ids";
import { iso } from "../mappers";
import { findPage, type PageInput } from "../paging";
import { calendarFor, offReason, today, toDay, workCalendar } from "./common";

const DAY_MS = 86_400_000;

/** The earliest day that can still be written: today minus the backfill window. */
const earliestDay = () => new Date(today().getTime() - WORK_UPDATE_BACKFILL_DAYS * DAY_MS);

const toDto = (u: Pick<WorkUpdateDoc, "_id" | "day" | "items" | "updatedAt">): WorkUpdateDto => ({
  id: String(u._id),
  day: dayKey(u.day),
  items: u.items,
  updatedAt: iso(u.updatedAt)!,
});

/** A day picked in a URL: today when absent or not a real date; future days come back as today. */
function pickDay(dayIso: string | undefined) {
  const t = today();
  if (!dayIso) return t;
  const d = toDay(dayIso);
  if (Number.isNaN(d.getTime())) return t;
  return d > t ? t : d;
}

/** The person's own update for one day (today by default) and their recent days. */
export async function myWorkUpdates(userId: string, dayIso?: string): Promise<MyWorkUpdates> {
  const _id = oid(userId);
  const day = pickDay(dayIso);
  const [entry, recent] = await Promise.all([
    WorkUpdate.findOne({ userId: _id, day }).lean(),
    WorkUpdate.find({ userId: _id }).sort({ day: -1 }).limit(14).lean(),
  ]);
  return {
    today: dayKey(today()),
    earliest: dayKey(earliestDay()),
    day: dayKey(day),
    items: entry?.items ?? [],
    updatedAt: iso(entry?.updatedAt),
    recent: recent.map(toDto),
  };
}

/**
 * Write the person's points for a day, replacing what was there. Blank points are dropped; an empty list clears the day.
 * Not audited: it's the person's own note, written often, with nothing sensitive in it.
 */
export async function saveWorkUpdate(userId: string, input: WorkUpdateInput) {
  const _id = oid(userId);
  const day = toDay(input.day);
  if (day > today()) throw new ValidationError({ day: "You can't write an update for a day that hasn't happened yet" });
  if (day < earliestDay()) throw new ValidationError({ day: `Updates can only be written for the last ${WORK_UPDATE_BACKFILL_DAYS} days` });
  const items = input.items.map((i) => i.trim()).filter(Boolean);
  if (!items.length) {
    await WorkUpdate.deleteOne({ userId: _id, day });
    return { cleared: true };
  }
  await WorkUpdate.updateOne({ userId: _id, day }, { $set: { items } }, { upsert: true });
  return { cleared: false };
}

const byName = <T extends { name: string }>(rows: T[]) => rows.sort((a, b) => a.name.localeCompare(b.name));

/** Everyone's updates for one day (today by default), plus the active staff who haven't logged one. */
export async function workUpdatesDay(dayIso?: string): Promise<WorkUpdatesDay> {
  const day = pickDay(dayIso);
  const [entries, profiles, cal] = await Promise.all([
    WorkUpdate.find({ day }).lean(),
    StaffProfile.find({}, { title: 1 }).lean(),
    workCalendar(),
  ]);
  const staffIds = profiles.map((p) => p._id);
  const [users, records, onLeave] = await Promise.all([
    AuthUser.find({ _id: { $in: [...staffIds, ...entries.map((e) => e.userId)] } }, { name: 1, disabledAt: 1 }).lean(),
    Employee.find({ _id: { $in: staffIds } }, { joinedOn: 1, leftOn: 1, weeklyOffOverride: 1 }).lean(),
    AttendanceDay.find({ day, status: "LEAVE" }, { employeeId: 1 }).lean(),
  ]);
  const user = new Map(users.map((u) => [String(u._id), u]));
  const title = new Map(profiles.map((p) => [String(p._id), p.title ?? null]));
  const record = new Map(records.map((r) => [String(r._id), r]));
  const leave = new Set(onLeave.map((a) => String(a.employeeId)));
  const logged = new Set(entries.map((e) => String(e.userId)));
  const person = (id: string) => ({ id, name: user.get(id)?.name ?? "Unknown", title: title.get(id) ?? null });

  const missing = staffIds
    .map(String)
    .filter((id) => {
      const u = user.get(id);
      if (!u || u.disabledAt || logged.has(id)) return false;
      const r = record.get(id);
      // Not yet joined, or already left, on that day.
      if (r && (r.joinedOn > day || (r.leftOn && r.leftOn < day))) return false;
      return true;
    })
    .map((id) => {
      const r = record.get(id);
      const off = leave.has(id) ? ("LEAVE" as const) : offReason(day, calendarFor(cal, r ?? { weeklyOffOverride: null }));
      return { ...person(id), off };
    });

  return {
    day: dayKey(day),
    today: dayKey(today()),
    rows: entries
      .map((e) => ({ id: String(e._id), person: person(String(e.userId)), items: e.items, updatedAt: iso(e.updatedAt)! }))
      .sort((a, b) => a.person.name.localeCompare(b.person.name)),
    missing: byName(missing),
  };
}

/** One person's updates, newest first. */
export async function personWorkUpdates(userId: string, q: PageInput): Promise<PersonWorkUpdates> {
  const _id = oid(userId, "Staff member");
  const [u, profile] = await Promise.all([AuthUser.findById(_id, { name: 1 }).lean(), StaffProfile.findById(_id, { title: 1 }).lean()]);
  if (!u || !profile) throw new NotFoundError("Staff member");
  const page = await findPage<WorkUpdateDoc>(WorkUpdate, { userId: _id }, { day: -1 }, q, { def: 25 });
  return {
    ...page,
    rows: page.rows.map(toDto),
    person: { id: String(_id), name: u.name, title: profile.title ?? null },
  };
}

/** For the staff dashboard: has this person logged today's update yet. */
export async function workUpdateToday(userId: string) {
  return !!(await WorkUpdate.exists({ userId: new Types.ObjectId(userId), day: today() }));
}
