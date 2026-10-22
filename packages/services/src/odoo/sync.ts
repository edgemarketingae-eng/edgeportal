import { OdooSyncLog, Payment, StudentProfile, AuthUser, Enrollment, Batch, Course } from "@edge/db";
import { dubaiDateString } from "@edge/domain/dates";
import { now } from "@edge/domain/clock";
import { OdooError, type OdooClient } from "@edge/integrations/odoo/client";
import { enqueueInTx } from "@edge/jobs";
import { withTx } from "@edge/db";
import { env } from "../env";
import { oid } from "../ids";
import { flushOutbox, runtime } from "../runtime";
import { getSetting } from "../settings";

/**
 * Pushes one successful payment to Odoo: customer -> invoice (course + processing-fee lines) ->
 * post -> register payment in the gateway's clearing journal -> portal PDF link.
 * The payment is CLAIMED first (no two workers sync it at once) and every Odoo step is idempotent
 * (the invoice is found by ref = our payment id), because each JSON-2 call is its own transaction.
 */
class MappingError extends Error {}

async function logStep(paymentId: string, step: string, attempt: number, started: number, ok: boolean, extra: { request?: unknown; response?: unknown; error?: string } = {}) {
  await OdooSyncLog.create({ paymentId: oid(paymentId), step, ok, attempt, durationMs: Date.now() - started, request: extra.request ?? null, response: extra.response ?? null, error: extra.error ?? null });
}

export async function syncPaymentToOdoo(paymentId: string, client: OdooClient = runtime().odoo) {
  const _id = oid(paymentId, "Payment");
  const staleClaim = new Date(now().getTime() - 10 * 60_000);
  const claimed = await Payment.findOneAndUpdate(
    { _id, status: "SUCCEEDED", $or: [{ "odoo.status": "PENDING" }, { "odoo.status": "IN_PROGRESS", "odoo.claimedAt": { $lt: staleClaim } }] },
    { $set: { "odoo.status": "IN_PROGRESS", "odoo.claimedAt": now() }, $inc: { "odoo.attempts": 1 } },
    { returnDocument: "after" },
  ).lean();
  if (!claimed) return { skipped: "not pending or already being synced" };
  const payment = claimed;
  const attempt = payment.odoo?.attempts ?? 1;
  let step = "MAPPING";
  let started = Date.now();
  try {
    const stored = await getSetting("odoo.mapping");
    // The in-memory mock Odoo knows tax 5 = 5% VAT and 6 = zero-rated.
    const mapping = client.isMock ? { ...stored, taxStandardId: 5, taxZeroRatedId: 6 } : stored;
    const journalId = mapping.journalIds[payment.gateway];
    if (!client.isMock) {
      if (!mapping.taxStandardId || !mapping.taxZeroRatedId) throw new MappingError("Set the Odoo tax IDs in Settings > Odoo invoicing");
      if (!journalId) throw new MappingError(`Set the Odoo journal for ${payment.gateway} payments in Settings > Odoo invoicing`);
    }
    const [user, profile, enrollment] = await Promise.all([AuthUser.findById(payment.studentId).lean(), StudentProfile.findById(payment.studentId).lean(), Enrollment.findById(payment.enrollmentId).lean()]);
    const batch = enrollment ? await Batch.findById(enrollment.batchId).lean() : null;
    const course = batch ? await Course.findById(batch.courseId).lean() : null;
    if (!user || !batch || !course) throw new MappingError("Student, batch or course missing");

    // 1. Customer
    step = "PARTNER";
    started = Date.now();
    const ref = `EA-STU-${payment.studentId}`;
    let partnerId = profile?.odooPartnerId ?? null;
    if (!partnerId) {
      const found =
        (await client.call<{ id: number }[]>("res.partner", "search_read", { domain: [["ref", "=", ref]], fields: ["id"], limit: 1 }))[0] ??
        (await client.call<{ id: number }[]>("res.partner", "search_read", { domain: [["email", "=", user.email]], fields: ["id"], limit: 1 }))[0];
      partnerId =
        found?.id ??
        (
          await client.call<number[]>("res.partner", "create", {
            vals_list: [{ name: user.name, email: user.email, phone: user.phoneNumber ?? undefined, ref, customer_rank: 1, comment: profile?.jetaFxClientId ? `Jeta FX client ID: ${profile.jetaFxClientId}` : undefined }],
          })
        )[0]!;
      await StudentProfile.updateOne({ _id: payment.studentId }, { $set: { odooPartnerId: partnerId } });
    }
    await logStep(paymentId, step, attempt, started, true, { response: { partnerId } });

    // 2. Invoice (found by ref first, so retries never duplicate it)
    step = "INVOICE";
    started = Date.now();
    type Move = { id: number; name: string; state: string; payment_state: string; amount_total: number };
    const fields = ["id", "name", "state", "payment_state", "amount_total"];
    let move = (await client.call<Move[]>("account.move", "search_read", { domain: [["ref", "=", paymentId], ["move_type", "=", "out_invoice"]], fields, limit: 1 }))[0];
    if (!move) {
      const kind = payment.kind === "ADVANCE" ? "advance" : payment.kind === "BALANCE" ? "balance" : "full payment";
      const taxId = payment.vatTreatment === "STANDARD" ? mapping.taxStandardId : mapping.taxZeroRatedId;
      const tax = taxId ? { tax_ids: [[6, 0, [taxId]]] } : {};
      const lines: unknown[] = [[0, 0, { ...(mapping.courseProductId ? { product_id: mapping.courseProductId } : {}), name: `${course.title} - ${batch.name} (${kind})`, quantity: 1, price_unit: payment.courseMinor / 100, ...tax }]];
      if (payment.processingFeeMinor > 0) {
        lines.push([0, 0, { ...(mapping.feeProductId ? { product_id: mapping.feeProductId } : {}), name: "Payment processing fee", quantity: 1, price_unit: payment.processingFeeMinor / 100, ...tax }]);
      }
      const vals = {
        move_type: "out_invoice",
        partner_id: partnerId,
        ref: paymentId,
        invoice_date: dubaiDateString(payment.succeededAt ?? now()),
        narration: `Edge Academy portal payment ${paymentId} via ${payment.gateway}${payment.externalPaymentId ? ` (${payment.externalPaymentId})` : ""}`,
        invoice_line_ids: lines,
      };
      const [id] = await client.call<number[]>("account.move", "create", { vals_list: [vals] });
      move = (await client.call<Move[]>("account.move", "search_read", { domain: [["id", "=", id]], fields, limit: 1 }))[0]!;
      await logStep(paymentId, step, attempt, started, true, { request: vals, response: move });
    }
    if (Math.round(move.amount_total * 100) !== payment.totalMinor) {
      throw new MappingError(`Invoice total in Odoo (${move.amount_total}) differs from the amount paid (${payment.totalMinor / 100}). Check tax settings; the draft invoice was not posted.`);
    }

    // 3. Post
    step = "POST";
    started = Date.now();
    if (move.state === "draft") {
      await client.call("account.move", "action_post", { ids: [move.id] });
      move = (await client.call<Move[]>("account.move", "search_read", { domain: [["id", "=", move.id]], fields, limit: 1 }))[0]!;
      await logStep(paymentId, step, attempt, started, true, { response: { name: move.name } });
    }

    // 4. Register payment
    step = "PAYMENT";
    started = Date.now();
    let odooPaymentId = payment.odoo?.paymentId ?? null;
    if (!["paid", "in_payment"].includes(move.payment_state)) {
      const context = { active_model: "account.move", active_ids: [move.id] };
      const [wizardId] = await client.call<number[]>("account.payment.register", "create", {
        context,
        vals_list: [{ ...(journalId ? { journal_id: journalId } : {}), amount: payment.totalMinor / 100, payment_date: dubaiDateString(payment.succeededAt ?? now()), communication: `${move.name} ${payment.externalPaymentId ?? paymentId}` }],
      });
      const res = await client.call<{ res_id?: number } | boolean>("account.payment.register", "action_create_payments", { ids: [wizardId], context });
      odooPaymentId = typeof res === "object" && res?.res_id ? res.res_id : null;
      await logStep(paymentId, step, attempt, started, true, { response: res });
    }

    // 5. Customer-facing PDF link
    step = "PORTAL_URL";
    started = Date.now();
    let invoiceUrl: string | null = null;
    try {
      const rel = await client.call<string>("account.move", "get_portal_url", { ids: [move.id], report_type: "pdf", download: true });
      invoiceUrl = client.isMock ? null : `${(env.ODOO_URL ?? "").replace(/\/$/, "")}${rel}`;
    } catch (e) {
      await logStep(paymentId, step, attempt, started, false, { error: String(e) });
    }
    await Payment.updateOne({ _id }, { $set: { "odoo.status": "SYNCED", "odoo.invoiceId": move.id, "odoo.invoiceName": move.name, "odoo.paymentId": odooPaymentId, "odoo.invoiceUrl": invoiceUrl, "odoo.lastError": null, "odoo.claimedAt": null } });
    return { synced: true, invoice: move.name };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logStep(paymentId, step, attempt, started, false, { error: message });
    const retryable = e instanceof OdooError ? e.retryable : !(e instanceof MappingError);
    await Payment.updateOne({ _id }, { $set: { "odoo.status": retryable ? "PENDING" : "FAILED", "odoo.lastError": `${step}: ${message}`.slice(0, 2000), "odoo.claimedAt": null } });
    if (retryable) throw e; // BullMQ retries with backoff
    return { failed: message };
  }
}

/** Admin: put a failed payment back in the queue. */
export async function retryOdoo(paymentId: string) {
  const _id = oid(paymentId, "Payment");
  await withTx(async () => {
    await Payment.updateOne({ _id, status: "SUCCEEDED", "odoo.status": { $ne: "SYNCED" } }, { $set: { "odoo.status": "PENDING", "odoo.lastError": null } });
    await enqueueInTx("odoo.sync", { paymentId }, { dedupeId: `odoo-${paymentId}-retry-${Date.now()}` });
  });
  await flushOutbox();
}

/** Job: re-queue succeeded payments still waiting for Odoo (e.g. after an outage). */
export async function sweepOdooPending() {
  const cutoff = new Date(now().getTime() - 10 * 60_000);
  const stuck = await Payment.find({ status: "SUCCEEDED", "odoo.status": { $in: ["PENDING", "IN_PROGRESS"] }, updatedAt: { $lt: cutoff } }, { _id: 1 }).limit(100).lean();
  for (const p of stuck) await runtime().producer.send("odoo.sync", { paymentId: String(p._id) }, { dedupeId: `odoo-${p._id}` }).catch(() => undefined);
  return { requeued: stuck.length };
}
