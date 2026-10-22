import Decimal from "decimal.js";

/**
 * Fee engine. Mirrors the client's calculator (payments.edgeverse.ae):
 * the gateway charge (pct * total + fixed, plus VAT on that charge) is grossed up
 * so that Edge receives the full net amount (course + course VAT).
 *
 *   net   = course + courseVat               (courseVat only for UAE students)
 *   raw   = (net + k*fixed) / (1 - k*pct)    where k = 1 + gateway fee VAT rate
 *   total = ceil(raw)
 *
 * The surcharge (total - net) is invoiced as a "payment processing fee" line:
 *  - STANDARD (UAE): split into fee + 5% output VAT, rounded per line like Odoo,
 *    never under-recovering (fee is bumped by 1 fils if rounding falls short).
 *  - ZERO_RATED (outside UAE): whole surcharge is the fee line with 0% VAT.
 */

export type VatTreatment = "STANDARD" | "ZERO_RATED";

export interface FeeRateInput {
  pct: Decimal.Value; // 0.0675 = 6.75%
  fixedMinor: number; // 100 = AED 1.00
  feeVatRate?: Decimal.Value; // VAT the gateway charges on its fee, default 5%
}

export interface QuoteInput {
  courseMinor: number;
  vatTreatment: VatTreatment;
  courseVatRate?: Decimal.Value; // UAE VAT on the course, default 5%
  rate: FeeRateInput;
}

export interface Quote {
  courseMinor: number;
  courseVatMinor: number;
  netMinor: number;
  processingFeeMinor: number;
  processingFeeVatMinor: number;
  surchargeMinor: number;
  totalMinor: number;
}

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

function roundHalfUp(v: Decimal): number {
  return v.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function quote(input: QuoteInput): Quote {
  const { courseMinor, vatTreatment } = input;
  if (!Number.isInteger(courseMinor) || courseMinor <= 0) throw new Error("courseMinor must be a positive integer");
  const courseVatRate = new D(input.courseVatRate ?? "0.05");
  const pct = new D(input.rate.pct);
  const fixed = input.rate.fixedMinor;
  const k = new D(1).plus(input.rate.feeVatRate ?? "0.05");

  if (pct.isNegative() || fixed < 0) throw new Error("Fee rate must not be negative");
  const denominator = new D(1).minus(k.times(pct));
  if (denominator.lte(0)) throw new Error("Fee rate too high to gross up");

  const courseVatMinor = vatTreatment === "STANDARD" ? roundHalfUp(new D(courseMinor).times(courseVatRate)) : 0;
  const netMinor = courseMinor + courseVatMinor;

  const raw = new D(netMinor).plus(k.times(fixed)).div(denominator);
  const grossMinor = raw.ceil().toNumber();
  const surchargeMinor = grossMinor - netMinor;

  let processingFeeMinor: number;
  let processingFeeVatMinor: number;
  if (vatTreatment === "STANDARD") {
    processingFeeMinor = roundHalfUp(new D(surchargeMinor).div(new D(1).plus(courseVatRate)));
    processingFeeVatMinor = roundHalfUp(new D(processingFeeMinor).times(courseVatRate));
    while (processingFeeMinor + processingFeeVatMinor < surchargeMinor) {
      processingFeeMinor += 1;
      processingFeeVatMinor = roundHalfUp(new D(processingFeeMinor).times(courseVatRate));
    }
  } else {
    processingFeeMinor = surchargeMinor;
    processingFeeVatMinor = 0;
  }

  const totalMinor = netMinor + processingFeeMinor + processingFeeVatMinor;
  return {
    courseMinor,
    courseVatMinor,
    netMinor,
    processingFeeMinor,
    processingFeeVatMinor,
    surchargeMinor: processingFeeMinor + processingFeeVatMinor,
    totalMinor,
  };
}

/** What the gateway keeps from a charge (fee + VAT on fee), for reconciliation checks. */
export function gatewayCharge(totalMinor: number, rate: FeeRateInput): Decimal {
  const k = new D(1).plus(rate.feeVatRate ?? "0.05");
  return new D(totalMinor).times(rate.pct).plus(rate.fixedMinor).times(k);
}

/** VAT treatment: UAE billing country pays 5% VAT on the course; everyone else is zero-rated. */
export function vatTreatmentFor(country: string, vatCountries: string[] = ["AE"]): VatTreatment {
  return vatCountries.includes(country.toUpperCase()) ? "STANDARD" : "ZERO_RATED";
}
