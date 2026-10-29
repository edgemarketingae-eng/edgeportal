import Decimal from "decimal.js";
import type { DepositSequence } from "./enums";

/** A month whose later-deposit total reaches `fromMinor` earns `pct` (a fraction, "0.02" = 2%). */
export interface CommissionSlab {
  fromMinor: number;
  pct: string;
}

/**
 * First deposits earn `firstPct`. Later deposits earn the rate of the slab that the credited person's verified
 * later-deposit total for the month falls in (first deposits never count). Fractions.
 */
export interface CommissionRates {
  firstPct: string;
  /** One slab starts at 0 (the base rate for any total). */
  slabs: CommissionSlab[];
}

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/**
 * The rate for a deposit: the first-deposit rate, or for a later deposit the highest slab its month's later-deposit
 * total (`monthTotalMinor`) reaches. Every later deposit of that person and month earns that rate on its whole amount.
 */
export function rateFor(rates: CommissionRates, sequence: DepositSequence, monthTotalMinor: number): string {
  if (sequence === "FIRST") return rates.firstPct;
  return slabFor(rates, monthTotalMinor)?.pct ?? "0";
}

/** The highest slab a later-deposit month total reaches (null when there is no base slab and the total is below all). */
export function slabFor(rates: CommissionRates, monthTotalMinor: number): CommissionSlab | null {
  let best: CommissionSlab | null = null;
  for (const s of rates.slabs) if (s.fromMinor <= monthTotalMinor && (!best || s.fromMinor > best.fromMinor)) best = s;
  return best;
}

/** The next slab above a month total, or null at the top. */
export function nextSlab(rates: CommissionRates, monthTotalMinor: number): CommissionSlab | null {
  let next: CommissionSlab | null = null;
  for (const s of rates.slabs) if (s.fromMinor > monthTotalMinor && (!next || s.fromMinor < next.fromMinor)) next = s;
  return next;
}

/**
 * The month a deposit counts toward: `[from, to)` around its date. Deposit dates are stored as UTC midnight of the
 * calendar day, so the UTC month is the deposit's month.
 */
export function depositMonthRange(depositedAt: Date) {
  const y = depositedAt.getUTCFullYear();
  const m = depositedAt.getUTCMonth();
  return { from: new Date(Date.UTC(y, m, 1)), to: new Date(Date.UTC(y, m + 1, 1)) };
}

/** Commission in minor units: amount * pct, rounded half up to a whole cent. */
export function commissionFor(amountMinor: number, pct: Decimal.Value): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error("amountMinor must be a non-negative integer");
  const p = new D(pct);
  if (p.isNegative() || p.gt(1)) throw new Error("Commission rate must be between 0 and 100%");
  return new D(amountMinor).times(p).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** "10" (percent typed by an admin) -> "0.100000" (stored fraction). */
export function percentToFraction(percent: number): string {
  return new D(percent).div(100).toFixed(6);
}

/** "0.100000" -> 10 (for the settings form). */
export function fractionToPercent(fraction: string): number {
  return new D(fraction).times(100).toDecimalPlaces(4).toNumber();
}
