import { Batch, Enrollment, lockForUpdate, OdooSyncLog, Payment, type EnrollmentDoc, type PaymentDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import { formatDateTime } from "@edge/domain/dates";
import { onPaymentRemoved } from "@edge/domain/enrollment/machine";
import type { VatTreatment } from "@edge/domain/payments/fees";
import { formatMoney } from "@edge/domain/money";
import { batchTerms, recordEvent, toSnapshot } from "../enrollment/service";
import { NotFoundError } from "../errors";
import { oid } from "../ids";
import { auditDelete, deleter, Plan, snapshot } from "../records/kit";

/**
 * A payment record. One that succeeded comes off the enrollment's paid total (the money itself stays with the gateway
 * or bank: refund it there). Anything Odoo has already invoiced stays: accounting records aren't deleted here.
 */
export const paymentDeleter = deleter<PaymentDoc>({
  load: async (id) => {
    const p = (await Payment.findById(oid(id, "Payment")).lean()) as PaymentDoc | null;
    if (!p) throw new NotFoundError("Payment");
    return p;
  },
  plan: async (p) => {
    const label = `the ${formatMoney(p.totalMinor, p.currency)} payment (${formatDateTime(p.succeededAt ?? p.createdAt)})`;
    const plan = new Plan(label);
    const odoo = p.odoo?.status ?? "PENDING";
    if (p.odoo?.invoiceId || odoo === "SYNCED" || odoo === "IN_PROGRESS")
      plan.block(
        `It's ${p.odoo?.invoiceName ? `invoice ${p.odoo.invoiceName}` : "invoiced"} in Odoo. Accounting records can't be deleted here`,
      );
    if (p.status === "AUTHORIZED") plan.block("It's authorized at the gateway and may still be captured");
    if ((p.status === "CREATED" || p.status === "PENDING") && (!p.expiresAt || p.expiresAt > now()))
      plan.block(`The checkout is still open${p.expiresAt ? ` until ${formatDateTime(p.expiresAt)}` : ""}`);
    if (p.status === "SUCCEEDED") {
      plan.warn(`${formatMoney(p.courseMinor, p.currency)} comes off what the student has paid for the course.`);
      plan.warn(
        p.gateway === "MANUAL" ? "Return the money by hand if needed." : "The money stays with the gateway. Refund it there if needed.",
      );
      plan.warn("The receipt email was already sent, and the enrollment's status doesn't change.");
    }
    return plan;
  },
  apply: async (p, actor) => {
    if (p.status !== "SUCCEEDED") {
      await OdooSyncLog.deleteMany({ paymentId: p._id });
      await Payment.deleteOne({ _id: p._id });
    } else {
      const e = await lockForUpdate<EnrollmentDoc>(Enrollment, { _id: p.enrollmentId });
      await OdooSyncLog.deleteMany({ paymentId: p._id });
      await Payment.deleteOne({ _id: p._id });
      const batch = await Batch.findById(e.batchId).lean();
      if (!batch) throw new NotFoundError("Batch");
      const remaining = await Payment.find({ enrollmentId: e._id, status: "SUCCEEDED" }).lean();
      const t = onPaymentRemoved(
        toSnapshot(e, batch),
        batchTerms(batch),
        remaining.map((r) => ({
          courseMinor: r.courseMinor,
          succeededAt: r.succeededAt ?? r.createdAt,
          vatTreatment: r.vatTreatment as VatTreatment,
          billingCountry: r.billingCountry,
        })),
      );
      await Enrollment.updateOne({ _id: e._id }, { $set: { ...t.patch, status: t.to } });
      await recordEvent(e, "PAYMENT_DELETED", actor, {
        from: e.status,
        to: t.to,
        data: { paymentId: String(p._id), courseMinor: p.courseMinor, totalMinor: p.totalMinor, gateway: p.gateway },
      });
    }
    await auditDelete({ actor, action: "payment.delete", entityType: "Payment", entityId: String(p._id), before: snapshot(p) });
  },
  done: () => "Payment deleted.",
});
