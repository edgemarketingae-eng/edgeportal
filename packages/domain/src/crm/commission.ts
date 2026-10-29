import Decimal from "decimal.js";
import type { DepositSequence } from "./enums";

/** A later deposit of at least `fromMinor` earns `pct` (a fraction, "0.02" = 2%). */
export interface CommissionSlab {
  fromMinor: number;
  pct: string;
}

/** First deposits earn `firstPct`; a later deposit earns the rate of the slab its amount falls in. Fractions. */
export interface CommissionRates {
  firstPct: string;
  /** One slab starts at 0 (the base rate for any amount). */
  slabs: CommissionSlab[];
}

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** The rate for a deposit: the first-deposit rate, or the highest slab the amount reaches (the whole deposit at that rate). */
export function rateFor(rates: CommissionRates, sequence: DepositSequence, amountMinor: number): string {
  if (sequence === "FIRST") return rates.firstPct;
  let best: CommissionSlab | null = null;
  for (const s of rates.slabs) if (s.fromMinor <= amountMinor && (!best || s.fromMinor > best.fromMinor)) best = s;
  return best?.pct ?? "0";
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
