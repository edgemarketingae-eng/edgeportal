import { Enrollment, InAppNotification, JobOutbox, NotificationLog, Payment, PaymentEvent } from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { freezeClock, setClock } from "@edge/domain/clock";
import { buildMockWebhook, MOCK_SIGNATURE_HEADER } from "@edge/integrations/gateways/mock";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyPaymentSuccess, approveEnrollment, CheckoutError, createCheckout, createStaff, ensureCurrentEnrollment, handleWebhook, recordManualPayment, runAutolock, runtime, sweepWebhookInbox } from "../src";
import { createBatch, createStudent, producer } from "./helpers";

const SECRET = "mock-gateway-secret";
const url = new URL("http://api/api/webhooks/mock");

async function mockPay(paymentId: string, outcome: "succeeded" | "failed" | "authorized" = "succeeded") {
  const { body, signature } = buildMockWebhook(SECRET, paymentId, outcome);
  return handleWebhook("mock", body, new Headers({ [MOCK_SIGNATURE_HEADER]: signature }), url);
}

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  producer.take();
  freezeClock("2026-10-06T10:00:00Z");
});
afterEach(() => {
  setClock(null);
  vi.restoreAllMocks();
});

describe("payment flow", () => {
  it("advance -> approval -> auto-lock -> balance -> auto-unlock", async () => {
    await createBatch();
    const sid = await createStudent("AE");
    const { id: adminId } = await createStaff({ name: "Admissions", email: "adm@edge.test", roleKeys: ["admissions"], password: "AdminPass!2026" }, { type: "SYSTEM" });
    const e0 = await ensureCurrentEnrollment(sid, { type: "SYSTEM" });

    const { paymentId, redirectUrl } = await createCheckout({ studentId: sid, kind: "ADVANCE", amountMinor: 30000, feeRateKey: "TABBY_AE" });
    expect(redirectUrl).toMatch(/\/dev\/mock-checkout\//);
    const pending = await Payment.findById(paymentId).lean();
    expect(pending).toMatchObject({ status: "PENDING", courseMinor: 30000, courseVatMinor: 1500 });
    expect(pending!.totalMinor).toBeGreaterThan(31500);

    expect((await mockPay(paymentId)).status).toBe(200);
    const replay = await mockPay(paymentId); // a different event id for the same payment: applies nothing new
    expect(replay.status).toBe(200);
    let e = await Enrollment.findById(e0!._id).lean();
    expect(e).toMatchObject({ status: "PENDING_APPROVAL", paymentState: "PARTIALLY_PAID", paidCourseMinor: 30000, vatTreatment: "STANDARD" });
    expect(e!.balanceDueOn?.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(await NotificationLog.countDocuments({ template: "enrollment.paymentReceived" })).toBe(1);
    expect(await InAppNotification.countDocuments({ userId: adminId })).toBe(1);
    expect(await JobOutbox.countDocuments({ queue: "odoo.sync" })).toBe(1);

    const bad = await handleWebhook("mock", buildMockWebhook(SECRET, paymentId, "succeeded").body, new Headers({ [MOCK_SIGNATURE_HEADER]: "deadbeef" }), url);
    expect(bad.status).toBe(400);

    await approveEnrollment(String(e0!._id), { type: "USER", id: adminId });
    expect((await runAutolock(new Date("2026-11-05T20:00:01Z"))).locked).toBe(1);

    freezeClock("2026-11-07T10:00:00Z");
    const bal = await createCheckout({ studentId: sid, kind: "BALANCE", feeRateKey: "STRIPE_CARD_AE" });
    const balPayment = await Payment.findById(bal.paymentId).lean();
    expect(balPayment).toMatchObject({ courseMinor: 470000, vatTreatment: "STANDARD" });
    await mockPay(bal.paymentId);
    e = await Enrollment.findById(e0!._id).lean();
    expect(e).toMatchObject({ status: "ACTIVE", paymentState: "PAID", lockAt: null });
    expect(e!.fullyPaidAt).not.toBeNull();
  });

  it("applies a payment exactly once under concurrency, and counts two payments on one enrollment", async () => {
    await createBatch();
    const sid = await createStudent();
    await ensureCurrentEnrollment(sid, { type: "SYSTEM" });
    const p1 = await createCheckout({ studentId: sid, kind: "ADVANCE", amountMinor: 30000, feeRateKey: "STRIPE_CARD_AE" });
    const results = await Promise.all(Array.from({ length: 10 }, () => applyPaymentSuccess(p1.paymentId, { actor: { type: "SYSTEM" } })));
    expect(results.filter((r) => r.applied)).toHaveLength(1);
    let e = await Enrollment.findOne({ studentId: sid }).lean();
    expect(e!.paidCourseMinor).toBe(30000);

    // Two different payments landing at the same time on the same enrollment are both counted.
    const extra = await Payment.create({ ...(await Payment.findById(p1.paymentId).lean())!, _id: undefined, kind: "BALANCE", status: "PENDING", courseMinor: 100000, idempotencyKey: "extra-1", externalPaymentId: null });
    const extra2 = await Payment.create({ ...(await Payment.findById(p1.paymentId).lean())!, _id: undefined, kind: "BALANCE", status: "PENDING", courseMinor: 50000, idempotencyKey: "extra-2", externalPaymentId: null });
    await Promise.all([applyPaymentSuccess(String(extra._id), { actor: { type: "SYSTEM" } }), applyPaymentSuccess(String(extra2._id), { actor: { type: "SYSTEM" } })]);
    e = await Enrollment.findOne({ studentId: sid }).lean();
    expect(e!.paidCourseMinor).toBe(180000);
  });

  it("reprocesses a webhook whose first processing failed", async () => {
    await createBatch();
    const sid = await createStudent();
    await ensureCurrentEnrollment(sid, { type: "SYSTEM" });
    const { paymentId } = await createCheckout({ studentId: sid, kind: "FULL", feeRateKey: "STRIPE_CARD_AE" });
    const { body, signature } = buildMockWebhook(SECRET, paymentId, "succeeded");
    const adapter = runtime().gateways.getAdapter("STRIPE");
    const spy = vi.spyOn(adapter, "fetchStatus").mockRejectedValueOnce(new Error("gateway timeout"));
    const first = await handleWebhook("mock", body, new Headers({ [MOCK_SIGNATURE_HEADER]: signature }), url);
    expect(first.status).toBe(500);
    expect((await Payment.findById(paymentId).lean())!.status).toBe("PENDING");
    // The gateway retries the same event: it must be processed now, not answered as a duplicate.
    const retry = await handleWebhook("mock", body, new Headers({ [MOCK_SIGNATURE_HEADER]: signature }), url);
    expect(retry.status).toBe(200);
    expect((await Payment.findById(paymentId).lean())!.status).toBe("SUCCEEDED");
    expect(spy).toHaveBeenCalledTimes(2);
    const ev = await PaymentEvent.findOne({}).lean();
    expect(ev?.attempts).toBe(2);
    expect((await sweepWebhookInbox()).checked).toBe(0);
  });

  it("captures BNPL authorisations once", async () => {
    await createBatch();
    const sid = await createStudent();
    await ensureCurrentEnrollment(sid, { type: "SYSTEM" });
    const { paymentId } = await createCheckout({ studentId: sid, kind: "FULL", feeRateKey: "TABBY_AE" });
    const adapter = runtime().gateways.getAdapter("TABBY");
    const capture = vi.spyOn(adapter, "capture");
    await Promise.all([mockPay(paymentId, "authorized"), mockPay(paymentId, "authorized")]);
    expect(capture).toHaveBeenCalledTimes(1);
    expect((await Payment.findById(paymentId).lean())!.status).toBe("SUCCEEDED");
  });

  it("enforces advance rules and blocks a second first payment", async () => {
    await createBatch({ presets: [30000, 50000], allowCustom: false });
    const sid = await createStudent("SA");
    await ensureCurrentEnrollment(sid, { type: "SYSTEM" });
    await expect(createCheckout({ studentId: sid, kind: "ADVANCE", amountMinor: 40000, feeRateKey: "STRIPE_CARD_INTL" })).rejects.toBeInstanceOf(CheckoutError);
    await expect(createCheckout({ studentId: sid, kind: "ADVANCE", amountMinor: 30000, feeRateKey: "TABBY_AE" })).rejects.toThrow(/not available for your country/);
    await expect(createCheckout({ studentId: sid, kind: "BALANCE", feeRateKey: "STRIPE_CARD_INTL" })).rejects.toThrow(/no balance/);
    const ok = await createCheckout({ studentId: sid, kind: "ADVANCE", amountMinor: 30000, feeRateKey: "STRIPE_CARD_INTL" });
    expect((await Payment.findById(ok.paymentId).lean())).toMatchObject({ vatTreatment: "ZERO_RATED", courseVatMinor: 0 });
    await mockPay(ok.paymentId);
    await expect(createCheckout({ studentId: sid, kind: "FULL", feeRateKey: "STRIPE_CARD_INTL" })).rejects.toThrow(/not waiting for a first payment/);
  });

  it("records a manual bank transfer without a processing fee", async () => {
    await createBatch();
    const sid = await createStudent();
    await ensureCurrentEnrollment(sid, { type: "SYSTEM" });
    const { id } = await createStaff({ name: "Finance", email: "fin@edge.test", roleKeys: ["finance"], password: "FinPass!2026" }, { type: "SYSTEM" });
    const pid = await recordManualPayment({ studentId: sid, kind: "FULL", method: "BANK_TRANSFER", reference: "TRX-1", actor: { type: "USER", id } });
    expect(await Payment.findById(pid).lean()).toMatchObject({ gateway: "MANUAL", status: "SUCCEEDED", totalMinor: 525000 });
  });
});
