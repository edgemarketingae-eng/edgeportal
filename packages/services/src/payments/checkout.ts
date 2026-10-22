import { randomUUID } from "node:crypto";
import { Enrollment, Payment } from "@edge/db";
import { formatMoney } from "@edge/domain/money";
import { GatewayError } from "@edge/integrations/gateways/types";
import { env } from "../env";
import { CheckoutError } from "../errors";
import { runtime } from "../runtime";
import { getSetting } from "../settings";
import { toGatewayPayment } from "./gateway-payment";
import { getCheckoutContext, quoteFor, resolveCourseAmount, withinLimits, type CheckoutKind } from "./options";

const KIND_LABEL: Record<CheckoutKind, string> = { FULL: "full payment", ADVANCE: "advance payment", BALANCE: "balance payment" };

/** Creates the payment record and the hosted checkout session; returns where to send the browser. */
export async function createCheckout(input: { studentId: string; kind: CheckoutKind; amountMinor?: number | null; feeRateKey: string }) {
  const ctx = await getCheckoutContext(input.studentId);
  if (!ctx) throw new CheckoutError("You are not enrolled in a batch yet.");
  const courseMinor = resolveCourseAmount(ctx, input.kind, input.amountMinor);
  const rate = ctx.methods.find((m) => m.key === input.feeRateKey);
  if (!rate) throw new CheckoutError("That payment method is not available for your country.");
  const q = quoteFor(ctx, courseMinor, rate);
  if (!withinLimits(rate, q.totalMinor)) throw new CheckoutError(`${rate.label} is not available for this amount.`);

  const { e, batch, course, user } = ctx.full;
  if (!e.firstPaidAt && e.feeMinor !== ctx.feeMinor) await Enrollment.updateOne({ _id: e._id, firstPaidAt: null }, { $set: { feeMinor: ctx.feeMinor } });

  const payment = await Payment.create({
    enrollmentId: e._id,
    studentId: e.studentId,
    kind: input.kind,
    gateway: rate.gateway,
    feeRateKey: rate.key,
    currency: e.currency ?? "AED",
    billingCountry: ctx.country,
    vatTreatment: ctx.vatTreatment,
    courseMinor: q.courseMinor,
    courseVatMinor: q.courseVatMinor,
    netMinor: q.netMinor,
    processingFeeMinor: q.processingFeeMinor,
    processingFeeVatMinor: q.processingFeeVatMinor,
    totalMinor: q.totalMinor,
    rateSnapshot: { pct: rate.pct, fixedMinor: rate.fixedMinor, feeVatRate: rate.feeVatRate, courseVatRate: ctx.courseVatRate, rateUpdatedAt: rate.updatedAt?.toISOString() },
    idempotencyKey: `${e._id}:${input.kind}:${randomUUID()}`,
  });
  const currency = e.currency ?? "AED";
  const title = `${course.title} - ${batch.name} (${KIND_LABEL[input.kind]})`;
  const description = [
    `Course: ${formatMoney(q.courseMinor, currency)}`,
    q.courseVatMinor ? `VAT 5%: ${formatMoney(q.courseVatMinor, currency)}` : null,
    `Payment processing fee: ${formatMoney(q.processingFeeMinor + q.processingFeeVatMinor, currency)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  try {
    const session = await runtime().gateways.getAdapter(rate.gateway).createCheckout({
      payment: toGatewayPayment(payment.toObject()),
      customer: { id: String(e.studentId), name: user.name, email: user.email, phone: user.phoneNumber, country: ctx.country },
      title,
      description,
      // The browser returns to the student app, which proxies /api/checkout/return to the API.
      successUrl: `${env.STUDENT_APP_URL}/api/checkout/return/${payment._id}`,
      cancelUrl: `${env.STUDENT_APP_URL}/api/checkout/return/${payment._id}?cancelled=1`,
      expiresInMinutes: await getSetting("payments.checkoutExpiryMinutes"),
    });
    await Payment.updateOne(
      { _id: payment._id },
      { $set: { status: "PENDING", externalSessionId: session.externalSessionId, externalOrderId: session.externalOrderId ?? null, checkoutUrl: session.redirectUrl, expiresAt: session.expiresAt ?? null } },
    );
    return { paymentId: String(payment._id), redirectUrl: session.redirectUrl };
  } catch (err) {
    await Payment.updateOne({ _id: payment._id }, { $set: { status: "FAILED", failedAt: new Date(), failureReason: String(err).slice(0, 1000) } });
    if (err instanceof GatewayError) throw new CheckoutError(err.userMessage);
    throw err;
  }
}
