import Decimal from "decimal.js";
import type { DepositSequence } from "./enums";

/** Commission rates per deposit sequence, as fractions ("0.1" = 10%). */
export interface CommissionRates {
  firstPct: string;
  secondPct: string;
  laterPct: string;
}

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function rateFor(rates: CommissionRates, sequence: DepositSequence): string {
  return sequence === "FIRST" ? rates.firstPct : sequence === "SECOND" ? rates.secondPct : rates.laterPct;
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
