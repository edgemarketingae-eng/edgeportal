import { randomUUID } from "node:crypto";
import { Payment } from "@edge/db";
import type { Actor } from "@edge/domain/enums";
import { quote } from "@edge/domain/payments/fees";
import { CheckoutError } from "../errors";
import { oid } from "../ids";
import { applyPaymentSuccess } from "./apply";
import { getCheckoutContext, resolveCourseAmount, type CheckoutKind } from "./options";

/** Finance records a bank transfer or cash payment: no processing fee, same VAT rules, synced to Odoo. */
export async function recordManualPayment(input: {
  studentId: string;
  kind: CheckoutKind;
  amountMinor?: number | null;
  method: "BANK_TRANSFER" | "CASH" | "OTHER";
  reference: string;
  notes?: string;
  actor: Actor & { type: "USER" | "SYSTEM" };
}) {
  const ctx = await getCheckoutContext(input.studentId);
  if (!ctx) throw new CheckoutError("The student has no current enrollment.");
  const courseMinor = resolveCourseAmount(ctx, input.kind, input.amountMinor);
  const q = quote({ courseMinor, vatTreatment: ctx.vatTreatment, courseVatRate: ctx.courseVatRate, rate: { pct: "0", fixedMinor: 0, feeVatRate: "0" } });
  const e = ctx.full.e;
  const payment = await Payment.create({
    enrollmentId: e._id,
    studentId: e.studentId,
    kind: input.kind,
    gateway: "MANUAL",
    feeRateKey: "MANUAL",
    status: "PENDING",
    currency: e.currency ?? "AED",
    billingCountry: ctx.country,
    vatTreatment: ctx.vatTreatment,
    courseMinor: q.courseMinor,
    courseVatMinor: q.courseVatMinor,
    netMinor: q.netMinor,
    processingFeeMinor: 0,
    processingFeeVatMinor: 0,
    totalMinor: q.totalMinor,
    rateSnapshot: { method: input.method },
    idempotencyKey: `manual:${randomUUID()}`,
    recordedById: input.actor.id ? oid(input.actor.id) : null,
    manualReference: input.reference,
    notes: input.notes ?? null,
    externalPaymentId: `manual:${input.reference}:${randomUUID().slice(0, 8)}`,
  });
  await applyPaymentSuccess(String(payment._id), { actor: input.actor });
  return String(payment._id);
}
