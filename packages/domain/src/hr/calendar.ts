/** Months are "YYYY-MM" strings and days are UTC-midnight dates of the Dubai calendar, like deposit dates. */
export type Month = string;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isMonth = (m: string): m is Month => MONTH.test(m);

export function monthOf(day: Date): Month {
  return day.toISOString().slice(0, 7);
}

/** `[from, to)` of a month. */
export function monthRange(month: Month) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1;
  return { from: new Date(Date.UTC(y, m, 1)), to: new Date(Date.UTC(y, m + 1, 1)) };
}

export function addMonths(month: Month, n: number): Month {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + n;
  return monthOf(new Date(Date.UTC(y, m, 1)));
}

/** Every month from `from` to `to`, both included. */
export function monthsBetween(from: Month, to: Month): Month[] {
  const out: Month[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export function formatMonth(month: Month) {
  return monthRange(month).from.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Every day from `from` to `to`, both included. */
export function daysBetween(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += 86_400_000) out.push(new Date(t));
  return out;
}

export const dayKey = (day: Date) => day.toISOString().slice(0, 10);

export interface WorkCalendar {
  /** 0 = Sunday ... 6 = Saturday. */
  weeklyOffDays: number[];
  /** Holiday dates, YYYY-MM-DD. */
  holidays: string[];
}

export const isWeeklyOff = (day: Date, cal: WorkCalendar) => cal.weeklyOffDays.includes(day.getUTCDay());
export const isHoliday = (day: Date, cal: WorkCalendar) => cal.holidays.includes(dayKey(day));
export const isWorkingDay = (day: Date, cal: WorkCalendar) => !isWeeklyOff(day, cal) && !isHoliday(day, cal);
