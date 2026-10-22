import { Payment, PaymentEvent, Types } from "@edge/db";
import { now } from "@edge/domain/clock";
import { WebhookSignatureError } from "@edge/integrations/gateways/types";
import { runtime } from "../runtime";
import { applyPaymentSuccess } from "./apply";
import { toGatewayPayment } from "./gateway-payment";

const OPEN = ["CREATED", "PENDING", "AUTHORIZED"] as ("CREATED" | "PENDING" | "AUTHORIZED")[];
const minutesAgo = (m: number) => new Date(now().getTime() - m * 60_000);

/**
 * Ask the gateway for the truth and apply it; captures BNPL authorisations (claimed first, so a
 * webhook and a return URL never capture twice). Money actually received always wins.
 */
export async function syncPayment(paymentId: string, source: "webhook" | "return" | "reconcile" | "admin") {
  const payment = await Payment.findById(paymentId).lean();
  if (!payment || payment.status === "SUCCEEDED" || payment.gateway === "MANUAL") return payment?.status ?? null;
  const adapter = runtime().gateways.getAdapter(payment.gateway);
  const gp = toGatewayPayment(payment);
  let st = await adapter.fetchStatus(gp);

  if (st.status === "AUTHORIZED") {
    await Payment.updateOne(
      { _id: payment._id, status: { $in: OPEN } },
      { $set: { status: "AUTHORIZED", authorizedAt: payment.authorizedAt ?? now(), externalPaymentId: st.externalPaymentId ?? payment.externalPaymentId ?? null } },
    );
    if (adapter.capture) {
      const claimed = await Payment.findOneAndUpdate(
        { _id: payment._id, status: "AUTHORIZED", $or: [{ captureClaimedAt: null }, { captureClaimedAt: { $lt: minutesAgo(5) } }] },
        { $set: { captureClaimedAt: now() } },
      ).lean();
      if (!claimed) return "PENDING"; // someone else is capturing right now
      st = await adapter.capture({ ...gp, externalPaymentId: st.externalPaymentId ?? gp.externalPaymentId });
    }
  }

  if (st.status === "SUCCEEDED") {
    if (st.amountMinor != null && st.amountMinor < payment.totalMinor) {
      await Payment.updateOne({ _id: payment._id }, { $set: { failureReason: `Amount mismatch: gateway ${st.amountMinor} vs expected ${payment.totalMinor}` } });
      return "MISMATCH";
    }
    await applyPaymentSuccess(String(payment._id), { externalPaymentId: st.externalPaymentId, actor: { type: source === "webhook" ? "WEBHOOK" : "SYSTEM", id: `${payment.gateway.toLowerCase()}:${source}` } });
    return "SUCCEEDED";
  }
  if (st.status === "FAILED" || st.status === "CANCELLED" || st.status === "EXPIRED") {
    await Payment.updateOne({ _id: payment._id, status: { $in: OPEN } }, { $set: { status: st.status, failedAt: st.status === "FAILED" ? now() : null, failureReason: st.failureReason ?? null } });
    return st.status;
  }
  if (payment.status === "CREATED") await Payment.updateOne({ _id: payment._id, status: "CREATED" }, { $set: { status: "PENDING" } });
  return "PENDING";
}

export type WebhookResult = { status: number; body: Record<string, unknown> };

async function processEvent(eventId: Types.ObjectId, paymentId: Types.ObjectId | null): Promise<WebhookResult> {
  // Claim the event so concurrent deliveries and the sweeper do not process it at the same time.
  const claimed = await PaymentEvent.findOneAndUpdate(
    { _id: eventId, processedAt: null, $or: [{ processingAt: null }, { processingAt: { $lt: minutesAgo(2) } }] },
    { $set: { processingAt: now() }, $inc: { attempts: 1 } },
  ).lean();
  if (!claimed) return { status: 200, body: { received: true, inProgress: true } };
  try {
    const result = paymentId ? await syncPayment(String(paymentId), "webhook") : "UNMATCHED";
    await PaymentEvent.updateOne({ _id: eventId }, { $set: { processedAt: now(), processingAt: null, error: null } });
    return { status: 200, body: { received: true, result } };
  } catch (e) {
    await PaymentEvent.updateOne({ _id: eventId }, { $set: { processingAt: null, error: String(e).slice(0, 2000) } });
    console.error("[webhook] processing failed", e);
    return { status: 500, body: { error: "processing failed" } }; // the gateway retries, and so does the sweeper
  }
}

/** Webhook intake: verify, store in the inbox (dedupe), then sync from the gateway API. */
export async function handleWebhook(segment: string, rawBody: string, headers: Headers, url: URL): Promise<WebhookResult> {
  const adapter = runtime().gateways.getWebhookAdapter(segment);
  if (!adapter) return { status: 404, body: { error: "unknown gateway" } };
  let parsed;
  try {
    parsed = await adapter.parseWebhook(rawBody, headers, url);
  } catch (e) {
    if (e instanceof WebhookSignatureError) return { status: 400, body: { error: "invalid signature" } };
    throw e;
  }

  const or: Record<string, unknown>[] = [];
  if (parsed.paymentId && Types.ObjectId.isValid(parsed.paymentId)) or.push({ _id: new Types.ObjectId(parsed.paymentId) });
  if (parsed.externalSessionId) or.push({ externalSessionId: parsed.externalSessionId });
  if (parsed.externalOrderId) or.push({ externalOrderId: parsed.externalOrderId });
  if (parsed.externalPaymentId) or.push({ externalPaymentId: parsed.externalPaymentId });
  const payment = or.length ? await Payment.findOne({ $or: or }, { _id: 1 }).lean() : null;

  let ev;
  try {
    ev = await PaymentEvent.findOneAndUpdate(
      { gateway: adapter.gateway, externalEventId: parsed.externalEventId },
      { $setOnInsert: { type: parsed.type, paymentId: payment?._id ?? null, signatureOk: true, payload: parsed.payload, receivedAt: now(), attempts: 0 } },
      { upsert: true, returnDocument: "after" },
    ).lean();
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e; // two deliveries raced the upsert
    ev = await PaymentEvent.findOne({ gateway: adapter.gateway, externalEventId: parsed.externalEventId }).lean();
  }
  if (!ev) return { status: 500, body: { error: "inbox write failed" } };
  if (ev.processedAt) return { status: 200, body: { received: true, duplicate: true } };
  return processEvent(ev._id, ev.paymentId ?? null);
}

/** Job: reprocess inbox events whose processing failed or never finished. */
export async function sweepWebhookInbox() {
  const stuck = await PaymentEvent.find({ processedAt: null, receivedAt: { $gt: minutesAgo(7 * 24 * 60) }, $or: [{ processingAt: null }, { processingAt: { $lt: minutesAgo(2) } }] }, { _id: 1, paymentId: 1 })
    .limit(100)
    .lean();
  let ok = 0;
  for (const e of stuck) if ((await processEvent(e._id, e.paymentId ?? null)).status === 200) ok++;
  return { checked: stuck.length, processed: ok };
}

/** Job: catch payments whose webhook never arrived. */
export async function reconcileOpenPayments() {
  const open = await Payment.find({ status: { $in: ["PENDING", "AUTHORIZED"] }, createdAt: { $gte: minutesAgo(3 * 24 * 60) } }, { _id: 1 }).limit(200).lean();
  const results: Record<string, number> = {};
  for (const p of open) {
    try {
      const r = (await syncPayment(String(p._id), "reconcile")) ?? "NONE";
      results[r] = (results[r] ?? 0) + 1;
    } catch (e) {
      console.error("[reconcile]", String(p._id), (e as Error).message);
      results.ERROR = (results.ERROR ?? 0) + 1;
    }
  }
  return { checked: open.length, results };
}

/** Job: expire abandoned checkouts an hour after their expiry (after one last sync). */
export async function expireStalePayments() {
  const stale = await Payment.find({ status: { $in: ["CREATED", "PENDING"] }, expiresAt: { $lt: minutesAgo(60) } }, { _id: 1 }).lean();
  let expired = 0;
  for (const p of stale) {
    const r = await syncPayment(String(p._id), "reconcile").catch(() => null);
    if (r === "PENDING" || r === null) expired += (await Payment.updateOne({ _id: p._id, status: { $in: ["CREATED", "PENDING"] } }, { $set: { status: "EXPIRED" } })).modifiedCount;
  }
  return { checked: stale.length, expired };
}
