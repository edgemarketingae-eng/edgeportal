import { Payment, StudentProfile, AuthUser } from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { freezeClock, setClock } from "@edge/domain/clock";
import { MockMailerLite } from "@edge/integrations/mailerlite/client";
import { MockOdooClient, OdooError, type OdooClient } from "@edge/integrations/odoo/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { approveEnrollment, createCheckout, createStaff, ensureCurrentEnrollment, GROUP_PREFIX, handleWebhook, recordManualPayment, retryOdoo, setSetting, syncPaymentToOdoo, syncStudentToMailerLite } from "../src";
import { buildMockWebhook, MOCK_SIGNATURE_HEADER } from "@edge/integrations/gateways/mock";
import { createBatch, createStudent, producer } from "./helpers";

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  MockOdooClient.reset();
  producer.take();
  freezeClock("2026-10-06T10:00:00Z");
  await setSetting("odoo.mapping", { courseProductId: 1, feeProductId: 2, taxStandardId: 5, taxZeroRatedId: 6, journalIds: { TABBY: 11, STRIPE: 12, MANUAL: 13 } });
});
afterEach(() => setClock(null));

async function paidTabbyAdvance() {
  await createBatch();
  const sid = await createStudent("AE");
  await ensureCurrentEnrollment(sid, { type: "SYSTEM" });
  const { paymentId } = await createCheckout({ studentId: sid, kind: "ADVANCE", amountMinor: 30000, feeRateKey: "TABBY_AE" });
  const { body, signature } = buildMockWebhook("mock-gateway-secret", paymentId, "succeeded");
  await handleWebhook("mock", body, new Headers({ [MOCK_SIGNATURE_HEADER]: signature }), new URL("http://x"));
  return { sid, paymentId };
}

describe("odoo sync", () => {
  it("creates partner, invoice with two lines, posts and pays it, idempotently and once under concurrency", async () => {
    const { paymentId, sid } = await paidTabbyAdvance();
    const odoo = new MockOdooClient();
    const results = await Promise.all([syncPaymentToOdoo(paymentId, odoo), syncPaymentToOdoo(paymentId, odoo)]);
    expect(results.filter((r) => "synced" in r)).toHaveLength(1);
    const p = await Payment.findById(paymentId).lean();
    expect(p?.odoo?.status).toBe("SYNCED");
    expect(p?.odoo?.invoiceName).toMatch(/^INV\//);
    const moves = MockOdooClient.table("account.move");
    expect(moves).toHaveLength(1);
    expect(moves[0]!.payment_state).toBe("paid");
    expect((moves[0]!.invoice_line_ids as unknown[]).length).toBe(2);
    expect(Math.round((moves[0]!.amount_total as number) * 100)).toBe(p!.totalMinor);
    expect((await StudentProfile.findById(sid).lean())?.odooPartnerId).toBeGreaterThan(0);

    // A forced retry must not create a second invoice, payment or partner.
    await Payment.updateOne({ _id: paymentId }, { $set: { "odoo.status": "PENDING" } });
    await syncPaymentToOdoo(paymentId, odoo);
    expect(MockOdooClient.table("account.move")).toHaveLength(1);
    expect(MockOdooClient.table("account.payment")).toHaveLength(1);
    expect(MockOdooClient.table("res.partner")).toHaveLength(1);
  });

  it("manual zero-fee payment has a single zero-rated course line", async () => {
    await createBatch();
    const sid = await createStudent("SA");
    await ensureCurrentEnrollment(sid, { type: "SYSTEM" });
    const { id } = await createStaff({ name: "F", email: "f@edge.test", roleKeys: ["finance"], password: "FinPass!2026" }, { type: "SYSTEM" });
    const pid = await recordManualPayment({ studentId: sid, kind: "FULL", method: "BANK_TRANSFER", reference: "T1", actor: { type: "USER", id } });
    await syncPaymentToOdoo(pid, new MockOdooClient());
    const move = MockOdooClient.table("account.move")[0]!;
    expect((move.invoice_line_ids as unknown[]).length).toBe(1);
    expect(move.amount_total).toBe(5000);
  });

  it("retryable errors stay pending and rethrow; validation errors fail; admin retry re-queues", async () => {
    const { paymentId } = await paidTabbyAdvance();
    const down: OdooClient = { isMock: false, call: async () => Promise.reject(new OdooError("Odoo unreachable", 0)) };
    await expect(syncPaymentToOdoo(paymentId, down)).rejects.toThrow(/unreachable/);
    expect((await Payment.findById(paymentId).lean())?.odoo?.status).toBe("PENDING");
    const invalid: OdooClient = { isMock: false, call: async () => Promise.reject(new OdooError("Invalid field", 422)) };
    expect(await syncPaymentToOdoo(paymentId, invalid)).toMatchObject({ failed: expect.stringContaining("Invalid field") });
    const p = await Payment.findById(paymentId).lean();
    expect(p?.odoo).toMatchObject({ status: "FAILED", attempts: 2 });
    producer.take();
    await retryOdoo(paymentId);
    expect((await Payment.findById(paymentId).lean())?.odoo?.status).toBe("PENDING");
    expect(producer.take().some((j) => j.queue === "odoo.sync")).toBe(true);
  });
});

describe("mailerlite sync", () => {
  it("syncs consenting students into portal groups and follows status changes", async () => {
    const batch = await createBatch();
    const sid = await createStudent();
    await StudentProfile.updateOne({ _id: sid }, { $set: { marketingConsent: true } });
    const e = await ensureCurrentEnrollment(sid, { type: "SYSTEM" });
    const ml = new MockMailerLite();
    const outside = await ml.findOrCreateGroup("Webinar leads (marketing)");
    await syncStudentToMailerLite(sid, ml);
    const email = (await AuthUser.findById(sid).lean())!.email;
    const sub = ml.subscribers.get(email)!;
    await ml.addToGroup(sub.id, outside);
    const names = () => [...sub.groups].map((id) => [...ml.groups].find(([, g]) => g === id)![0]).sort();
    expect(names()).toEqual([`${GROUP_PREFIX}All students`, `${GROUP_PREFIX}Batch ${batch.code}`, `${GROUP_PREFIX}Payment: Unpaid`, `${GROUP_PREFIX}Status: Awaiting payment`, "Webinar leads (marketing)"].sort());
    const { id } = await createStaff({ name: "A", email: "a@edge.test", roleKeys: ["admin"], password: "AdminPass!2026" }, { type: "SYSTEM" });
    await recordManualPayment({ studentId: sid, kind: "FULL", method: "CASH", reference: "x", actor: { type: "USER", id } });
    await approveEnrollment(String(e!._id), { type: "USER", id });
    await syncStudentToMailerLite(sid, ml);
    expect(names()).toContain(`${GROUP_PREFIX}Status: Active`);
    expect(names()).toContain(`${GROUP_PREFIX}Payment: Fully paid`);
    expect(names()).not.toContain(`${GROUP_PREFIX}Status: Awaiting payment`);
    expect(names()).toContain("Webinar leads (marketing)");
  });

  it("does not sync without consent and unsubscribes when consent is withdrawn", async () => {
    await createBatch();
    const sid = await createStudent();
    const ml = new MockMailerLite();
    expect(await syncStudentToMailerLite(sid, ml)).toEqual({ skipped: "no consent" });
    await StudentProfile.updateOne({ _id: sid }, { $set: { marketingConsent: true } });
    await syncStudentToMailerLite(sid, ml);
    await StudentProfile.updateOne({ _id: sid }, { $set: { marketingConsent: false } });
    await syncStudentToMailerLite(sid, ml);
    const email = (await AuthUser.findById(sid).lean())!.email;
    expect(ml.subscribers.get(email)!.status).toBe("unsubscribed");
  });
});
