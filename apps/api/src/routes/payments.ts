import { ApiError, paymentRoutes } from "@edge/contracts";
import { toMinor } from "@edge/domain/money";
import {
  createCheckout,
  devRoutesEnabled,
  env,
  getAdminPayment,
  getCheckoutContext,
  getStudentPayment,
  handleWebhook,
  listAdminPayments,
  listAdminStudentPayments,
  listStudentPayments,
  recordManualPayment,
  retryOdoo,
  syncPayment,
  toCheckoutOptionsDto,
} from "@edge/services";
import { buildMockWebhook, MOCK_SIGNATURE_HEADER, type MockOutcome } from "@edge/integrations/gateways/mock";
import { Payment } from "@edge/db";
import { fromNodeHeaders } from "better-auth/node";
import express, { Router } from "express";
import { actorOf, requirePermission, requireStudent } from "../http/guards";
import { register } from "../http/route";

/** Internal (Next.js server) payment routes. */
export function paymentsRouter() {
  const r = Router();
  register(r, paymentRoutes.checkoutOptions, async (req) => {
    const ctx = await getCheckoutContext(requireStudent(req).userId);
    if (!ctx) throw new ApiError(404, "NOT_FOUND", "You are not enrolled in a batch yet.");
    return toCheckoutOptionsDto(ctx);
  });
  register(r, paymentRoutes.checkout, async (req) => createCheckout({ studentId: requireStudent(req).userId, ...req.valid.body }));
  register(r, paymentRoutes.studentPayments, async (req) => listStudentPayments(requireStudent(req).userId));
  register(r, paymentRoutes.studentPayment, async (req) => getStudentPayment(requireStudent(req).userId, req.valid.params.id));

  register(r, paymentRoutes.adminPayments, async (req) => (requirePermission(req, "payment.read"), listAdminPayments(req.valid.query)));
  register(r, paymentRoutes.adminPayment, async (req) => (requirePermission(req, "payment.read"), getAdminPayment(req.valid.params.id)));
  register(r, paymentRoutes.adminStudentPayments, async (req) => (requirePermission(req, "payment.read"), listAdminStudentPayments(req.valid.params.id)));
  register(r, paymentRoutes.manual, async (req) => {
    const v = requirePermission(req, "payment.recordManual");
    const b = req.valid.body;
    let amountMinor: number | null = null;
    if (b.kind === "ADVANCE") {
      try {
        amountMinor = toMinor(b.amount ?? "");
      } catch {
        throw new ApiError(400, "VALIDATION", "Enter the advance amount.", { amount: "Enter an amount" });
      }
    }
    const paymentId = await recordManualPayment({ studentId: b.studentId, kind: b.kind, amountMinor, method: b.method, reference: b.reference, notes: b.notes, actor: actorOf(v) });
    return { ok: true as const, paymentId };
  });
  register(r, paymentRoutes.recheck, async (req) => {
    requirePermission(req, "payment.read");
    const result = await syncPayment(req.valid.params.id, "admin");
    return { ok: true as const, message: `Gateway says: ${result ?? "no change"}` };
  });
  register(r, paymentRoutes.odooRetry, async (req) => {
    requirePermission(req, "odoo.retry");
    await retryOdoo(req.valid.params.id);
    return { ok: true as const, message: "Odoo sync queued." };
  });
  return r;
}

/** Public webhook intake: raw body (signatures are computed over the exact bytes). */
export function webhookRouter() {
  const r = Router();
  r.post("/api/webhooks/:gateway", express.raw({ type: "*/*", limit: "1mb" }), async (req, res, next) => {
    try {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
      const out = await handleWebhook(String(req.params.gateway), raw, fromNodeHeaders(req.headers), new URL(req.originalUrl, `https://${req.headers.host ?? "api"}`));
      res.status(out.status).json(out.body);
    } catch (e) {
      next(e);
    }
  });
  return r;
}

/**
 * The browser lands here after the hosted checkout (via the student app's rewrite). We verify with the
 * gateway API, never trusting the URL, then redirect (relative) to the payment page in the same app.
 */
export function checkoutReturnRouter() {
  const r = Router();
  r.get("/api/checkout/return/:paymentId", async (req, res) => {
    const id = String(req.params.paymentId);
    const exists = /^[a-f0-9]{24}$/i.test(id) && (await Payment.exists({ _id: id }));
    if (!exists) return res.redirect(302, "/payments");
    try {
      const result = await syncPayment(id, "return");
      if (req.query.cancelled === "1" && result === "PENDING") await Payment.updateOne({ _id: id, status: { $in: ["CREATED", "PENDING"] } }, { $set: { status: "CANCELLED" } });
    } catch (e) {
      req.log?.error({ err: e }, "checkout return sync failed");
    }
    res.redirect(302, `/payments/${id}`);
  });

  // Mock hosted-checkout submit (development only): process a signed webhook, then do a full-page redirect.
  r.post("/api/dev/mock-checkout/:paymentId", express.urlencoded({ extended: false }), async (req, res, next) => {
    try {
      if (!devRoutesEnabled() || env.PAYMENTS_MODE !== "mock") throw new ApiError(404, "NOT_FOUND", "Not found");
      const id = String(req.params.paymentId);
      const outcome = String(req.body?.outcome ?? "abandon") as MockOutcome | "abandon";
      if (outcome !== "abandon") {
        const { body, signature } = buildMockWebhook(env.MOCK_GATEWAY_SECRET, id, outcome);
        await handleWebhook("mock", body, new Headers({ [MOCK_SIGNATURE_HEADER]: signature }), new URL("http://api/api/webhooks/mock"));
      }
      res.redirect(303, `/api/checkout/return/${id}${outcome === "abandon" ? "?cancelled=1" : ""}`);
    } catch (e) {
      next(e);
    }
  });
  return r;
}
