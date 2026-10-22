import { Batch, Enrollment, lockForUpdate, Payment, withTx, type EnrollmentDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import { onPaymentSucceeded, remainingMinor } from "@edge/domain/enrollment/machine";
import type { Actor } from "@edge/domain/enums";
import { formatMoney } from "@edge/domain/money";
import { enqueueInTx } from "@edge/jobs";
import { audit } from "../audit";
import { batchTerms, loadFull, recordEvent, toSnapshot } from "../enrollment/service";
import { env } from "../env";
import { NotFoundError } from "../errors";
import { oid } from "../ids";
import { queueEmail } from "../notifications/email";
import { notifyPermissionHolders } from "../notifications/in-app";
import { flushOutbox } from "../runtime";

/**
 * Marks a payment SUCCEEDED and advances its enrollment exactly once.
 * Safe to call concurrently from webhooks, return URLs, reconcile jobs and manual entry:
 * the conditional update on the payment is the exactly-once guard, and touching the enrollment
 * first (rev bump) serialises two different payments on the same enrollment. All side effects
 * are outbox rows written inside the transaction.
 */
export async function applyPaymentSuccess(paymentId: string, opts: { externalPaymentId?: string | null; actor: Actor }) {
  const _id = oid(paymentId, "Payment");
  const out = await withTx(async () => {
    const p = await Payment.findById(_id).lean();
    if (!p) throw new NotFoundError("Payment");
    if (p.status === "SUCCEEDED") return null;
    const at = now();
    const r = await Payment.updateOne(
      { _id, status: { $ne: "SUCCEEDED" } },
      { $set: { status: "SUCCEEDED", succeededAt: at, capturedAt: p.capturedAt ?? at, externalPaymentId: opts.externalPaymentId ?? p.externalPaymentId ?? null, failureReason: null } },
    );
    if (r.modifiedCount !== 1) return null;

    const e = await lockForUpdate<EnrollmentDoc>(Enrollment, { _id: p.enrollmentId });
    const batch = await Batch.findById(e.batchId).lean();
    if (!batch) throw new NotFoundError("Batch");
    const snapshot = toSnapshot(e, batch);
    const t = onPaymentSucceeded(snapshot, batchTerms(batch), { courseMinor: p.courseMinor, vatTreatment: p.vatTreatment, billingCountry: p.billingCountry }, at);
    const set: Record<string, unknown> = { ...t.patch, feeMinor: snapshot.feeMinor, status: t.to };
    if (t.to === "ACTIVE" && e.status === "LOCKED") Object.assign(set, { lockedAt: null, lockedById: null, lockNote: null });
    await Enrollment.updateOne({ _id: e._id }, { $set: set });
    await recordEvent(e, "PAYMENT_SUCCEEDED", opts.actor, {
      from: e.status,
      to: t.to,
      data: { paymentId, kind: p.kind, courseMinor: p.courseMinor, totalMinor: p.totalMinor, gateway: p.gateway },
    });
    await audit({ actor: opts.actor, action: "payment.succeeded", entityType: "Payment", entityId: paymentId, after: { totalMinor: p.totalMinor, gateway: p.gateway } });

    const full = await loadFull({ ...e, ...set } as EnrollmentDoc);
    const remaining = remainingMinor({ feeMinor: snapshot.feeMinor, paidCourseMinor: snapshot.paidCourseMinor + p.courseMinor });
    const dueOn = (t.patch.balanceDueOn ?? e.balanceDueOn) as Date | null;
    await queueEmail({
      to: full.user.email,
      userId: full.user.id,
      template: "enrollment.paymentReceived",
      data: {
        name: full.user.name,
        batchName: full.batch.name,
        amountMinor: p.totalMinor,
        currency: p.currency,
        kind: p.kind,
        balanceMinor: remaining,
        balanceDueOn: remaining > 0 && dueOn ? dueOn.toISOString() : null,
        pendingApproval: t.to === "PENDING_APPROVAL",
      },
      dedupeKey: `payment-received:${paymentId}`,
    });
    await enqueueInTx("odoo.sync", { paymentId }, { dedupeId: `odoo-${paymentId}` });
    if (t.effects.includes("PENDING_APPROVAL")) {
      await notifyPermissionHolders("enrollment.approve", {
        title: "New student awaiting approval",
        body: `${full.user.name} paid ${formatMoney(p.totalMinor, p.currency)} for ${full.batch.name}.`,
        href: `/admin/students/${full.user.id}`,
      });
    }
    if (t.effects.includes("PAYMENT_ON_CLOSED_ENROLLMENT")) {
      await notifyPermissionHolders("payment.read", {
        title: "Payment received on a closed enrollment",
        body: `${full.user.name} paid ${formatMoney(p.totalMinor, p.currency)} while their enrollment is ${e.status}. Please review.`,
        href: `/admin/students/${full.user.id}`,
      });
    }
    if (t.effects.includes("AUTO_UNLOCKED")) {
      await queueEmail({ to: full.user.email, userId: full.user.id, template: "enrollment.unlocked", data: { name: full.user.name, batchName: full.batch.name, dashboardUrl: `${env.STUDENT_APP_URL}/dashboard` } });
    }
    return { to: t.to };
  });
  await flushOutbox();
  return out ? { applied: true as const, to: out.to } : { applied: false as const };
}
