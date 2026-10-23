import { TZDate } from "@date-fns/tz";
import { addDays, format } from "date-fns";

export const ACADEMY_TZ = "Asia/Dubai";

export function formatDateTime(d: Date | string, tz = ACADEMY_TZ) {
  return format(new TZDate(new Date(d), tz), "EEE d MMM yyyy, h:mm a");
}

export function formatDate(d: Date | string, tz = ACADEMY_TZ) {
  return format(new TZDate(new Date(d), tz), "d MMM yyyy");
}

export function formatTime(d: Date | string, tz = ACADEMY_TZ) {
  return format(new TZDate(new Date(d), tz), "h:mm a");
}

/** Calendar date (YYYY-MM-DD) of an instant in the academy time zone. */
export function dubaiDateString(d: Date) {
  return format(new TZDate(d, ACADEMY_TZ), "yyyy-MM-dd");
}

/** A @db.Date value (stored as UTC midnight) for the Dubai calendar day of `d`, plus `days`. */
export function dubaiDateOnly(d: Date, days = 0): Date {
  const base = new Date(`${dubaiDateString(d)}T00:00:00.000Z`);
  return addDays(base, days);
}

/** The instant at the end of a calendar day (YYYY-MM-DD as UTC-midnight Date) in Dubai, plus grace days. */
export function endOfDubaiDay(dateOnly: Date, graceDays = 0): Date {
  const ymd = dateOnly.toISOString().slice(0, 10);
  // Dubai is UTC+4 with no DST: 23:59:59.999 Dubai = 19:59:59.999 UTC
  const end = new Date(`${ymd}T19:59:59.999Z`);
  return addDays(end, graceDays);
}

/** Whole days from `from` until the calendar date `dateOnly` (Dubai). Negative when overdue. */
export function daysUntil(dateOnly: Date, from: Date) {
  const today = new Date(`${dubaiDateString(from)}T00:00:00.000Z`);
  return Math.round((dateOnly.getTime() - today.getTime()) / 86_400_000);
}

/** Dubai midnight (start of the calendar day of `d`, plus `days`) as an instant. UTC+4, no DST. */
export function startOfDubaiDay(d: Date, days = 0): Date {
  return new Date(dubaiDateOnly(d, days).getTime() - 4 * 3600_000);
}

/** "YYYY-MM-DDTHH:mm" from a datetime-local input, read as Dubai wall-clock time. Null when malformed. */
export function fromDubaiLocal(s: string): Date | null {
  const v = s.trim().slice(0, 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+04:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** An instant as Dubai wall-clock "YYYY-MM-DDTHH:mm" for datetime-local inputs. */
export function toDubaiLocal(d: Date | string): string {
  return format(new TZDate(new Date(d), ACADEMY_TZ), "yyyy-MM-dd'T'HH:mm");
}
