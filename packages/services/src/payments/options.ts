import type { CheckoutOptionsDto, PublicFeeRate } from "@edge/contracts";
import { FeeRate, type FeeRateDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import { entitlements } from "@edge/domain/enrollment/entitlements";
import { remainingMinor } from "@edge/domain/enrollment/machine";
import { quote, vatTreatmentFor, type Quote, type VatTreatment } from "@edge/domain/payments/fees";
import { getCurrentEnrollment, type EnrollmentFull } from "../enrollment/service";
import { CheckoutError } from "../errors";
import { getSetting } from "../settings";

export type CheckoutKind = "FULL" | "ADVANCE" | "BALANCE";

export function toPublicRate(r: FeeRateDoc): PublicFeeRate {
  return { key: r.key, gateway: r.gateway, label: r.label, description: r.description ?? null, pct: r.pct, fixedMinor: r.fixedMinor, feeVatRate: r.feeVatRate ?? "0.05", minTotalMinor: r.minTotalMinor ?? null, maxTotalMinor: r.maxTotalMinor ?? null };
}

/** Online methods a student in `country` may use (manual/mock are staff-only). */
export async function availableMethods(country: string) {
  const rates = await FeeRate.find({ enabled: true, gateway: { $nin: ["MANUAL", "MOCK"] } }).sort({ sortOrder: 1 }).lean();
  const c = country.toUpperCase();
  return rates.filter((r) => ((r.countries ?? []).length === 0 || r.countries!.includes(c)) && !(r.excludeCountries ?? []).includes(c));
}

export interface CheckoutContext {
  full: EnrollmentFull;
  country: string;
  vatTreatment: VatTreatment;
  courseVatRate: string;
  feeMinor: number;
  remainingMinor: number;
  canCheckout: boolean;
  canPayBalance: boolean;
  advance: { enabled: boolean; presetsMinor: number[]; minMinor: number | null; allowCustom: boolean };
  methods: FeeRateDoc[];
}

export async function getCheckoutContext(studentId: string): Promise<CheckoutContext | null> {
  const full = await getCurrentEnrollment(studentId);
  if (!full) return null;
  const { e, batch } = full;
  const ent = entitlements({ id: String(e._id), status: e.status, paymentState: e.paymentState, lockAt: e.lockAt ?? null, lockReason: e.lockReason ?? null, batchId: String(e.batchId), batch: { id: String(batch._id), startDate: batch.startDate, whatsappGroupUrl: batch.whatsappGroupUrl ?? null } }, now());
  const country = e.taxCountry ?? full.profile.country;
  const [vatCountries, courseVatRate] = await Promise.all([getSetting("vat.countries"), getSetting("vat.courseRate")]);
  const feeMinor = e.firstPaidAt ? e.feeMinor : batch.feeMinor; // fee frozen after the first payment
  const presets = [...(batch.advancePresetsMinor ?? [])].filter((p) => p > 0 && p < feeMinor).sort((a, b) => a - b);
  return {
    full,
    country,
    vatTreatment: (e.vatTreatment as VatTreatment | null) ?? vatTreatmentFor(country, vatCountries),
    courseVatRate,
    feeMinor,
    remainingMinor: remainingMinor({ feeMinor, paidCourseMinor: e.paidCourseMinor ?? 0 }),
    canCheckout: ent.canCheckout,
    canPayBalance: ent.canPayBalance,
    advance: { enabled: (batch.advanceEnabled ?? true) && presets.length > 0, presetsMinor: presets, minMinor: presets[0] ?? null, allowCustom: batch.allowCustomAdvance ?? true },
    methods: await availableMethods(country),
  };
}

export function toCheckoutOptionsDto(ctx: CheckoutContext): CheckoutOptionsDto {
  return {
    enrollmentId: String(ctx.full.e._id),
    batchName: ctx.full.batch.name,
    courseTitle: ctx.full.course.title,
    currency: ctx.full.e.currency ?? "AED",
    feeMinor: ctx.feeMinor,
    remainingMinor: ctx.remainingMinor,
    vatTreatment: ctx.vatTreatment,
    courseVatRate: ctx.courseVatRate,
    canCheckout: ctx.canCheckout,
    canPayBalance: ctx.canPayBalance,
    balanceDueOn: ctx.full.e.balanceDueOn ? ctx.full.e.balanceDueOn.toISOString().slice(0, 10) : null,
    advance: ctx.advance,
    methods: ctx.methods.map(toPublicRate),
  };
}

/** Course amount (ex VAT) for a checkout request, enforcing the business rules. */
export function resolveCourseAmount(ctx: CheckoutContext, kind: CheckoutKind, amountMinor?: number | null): number {
  if (kind === "FULL") {
    if (!ctx.canCheckout) throw new CheckoutError("This enrollment is not waiting for a first payment.");
    return ctx.feeMinor;
  }
  if (kind === "ADVANCE") {
    if (!ctx.canCheckout) throw new CheckoutError("This enrollment is not waiting for a first payment.");
    if (!ctx.advance.enabled || ctx.advance.minMinor === null) throw new CheckoutError("Advance payment is not available for this batch.");
    if (!amountMinor || !Number.isInteger(amountMinor)) throw new CheckoutError("Choose an advance amount.");
    if (!ctx.advance.presetsMinor.includes(amountMinor)) {
      if (!ctx.advance.allowCustom) throw new CheckoutError("Choose one of the advance amounts.");
      if (amountMinor < ctx.advance.minMinor) throw new CheckoutError("The advance is below the minimum amount.");
    }
    if (amountMinor >= ctx.feeMinor) throw new CheckoutError("For the full amount, choose full payment.");
    return amountMinor;
  }
  if (!ctx.canPayBalance || ctx.remainingMinor <= 0) throw new CheckoutError("There is no balance to pay.");
  return ctx.remainingMinor;
}

export function quoteFor(ctx: Pick<CheckoutContext, "vatTreatment" | "courseVatRate">, courseMinor: number, rate: Pick<FeeRateDoc, "pct" | "fixedMinor" | "feeVatRate">): Quote {
  return quote({ courseMinor, vatTreatment: ctx.vatTreatment, courseVatRate: ctx.courseVatRate, rate: { pct: rate.pct, fixedMinor: rate.fixedMinor, feeVatRate: rate.feeVatRate ?? "0.05" } });
}

export function withinLimits(rate: Pick<FeeRateDoc, "minTotalMinor" | "maxTotalMinor">, totalMinor: number) {
  return (rate.minTotalMinor == null || totalMinor >= rate.minTotalMinor) && (rate.maxTotalMinor == null || totalMinor <= rate.maxTotalMinor);
}
