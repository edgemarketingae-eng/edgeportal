import { daysBetween, isWorkingDay, type WorkCalendar } from "./calendar";

/** Leave is counted in hundredths of a day (a half day is 50), so accruals like 1.83 stay exact integers. */
export const FULL_DAY = 100;
export const HALF_DAY = 50;

export const toCentiDays = (days: number) => Math.round(days * 100);
export const fromCentiDays = (centi: number) => centi / 100;

export function formatDays(centi: number) {
  const days = fromCentiDays(centi);
  return `${days.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${Math.abs(days) === 1 ? "day" : "days"}`;
}

/**
 * What a request costs: its working days, skipping weekly offs and holidays. `half` is for a one-day request of half a
 * day. The result is stored on the request, so later calendar changes never alter leave that was already counted.
 */
export function leaveDays(from: Date, to: Date, cal: WorkCalendar, half = false): { day: Date; centi: number }[] {
  return daysBetween(from, to)
    .filter((day) => isWorkingDay(day, cal))
    .map((day) => ({ day, centi: half ? HALF_DAY : FULL_DAY }));
}

export const sumCenti = (days: { centi: number }[]) => days.reduce((sum, d) => sum + d.centi, 0);

/** Group counted days by calendar year: a December-January request debits each leave year separately. */
export function centiByYear(days: { day: Date; centi: number }[]) {
  const out = new Map<number, number>();
  for (const d of days) out.set(d.day.getUTCFullYear(), (out.get(d.day.getUTCFullYear()) ?? 0) + d.centi);
  return out;
}

/**
 * What month `m` (1-12) adds of a yearly allowance. Rounding the running total instead of each month means twelve
 * months always add up to exactly the allowance, even for allowances that don't divide evenly.
 */
export function monthlyAccrual(daysPerYear: number, m: number) {
  const year = toCentiDays(daysPerYear);
  return Math.round((year * m) / 12) - Math.round((year * (m - 1)) / 12);
}

/** What moves into the next leave year: everything up to the cap. A negative balance always follows the person. */
export function carryForward(closing: number, capDays: number) {
  return closing < 0 ? closing : Math.min(closing, toCentiDays(capDays));
}
