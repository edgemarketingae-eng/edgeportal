import { Payment } from "@edge/db";
import { buildMockWebhook, MOCK_SIGNATURE_HEADER } from "@edge/integrations/gateways/mock";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, createCurrentBatch, INTERNAL, resetDb, signedUpStudent, startApi, STUDENT } from "./helpers";

let app: Awaited<ReturnType<typeof startApi>>["app"];
beforeAll(async () => {
  ({ app } = await startApi());
});
afterAll(closeTestDb);
beforeEach(resetDb);

describe("payments over HTTP", () => {
  it("checkout -> mock hosted page -> return URL -> paid", async () => {
    await createCurrentBatch();
    const { agent } = await signedUpStudent(app);
    const opts = await agent.get("/api/v1/student/checkout/options").set(INTERNAL).expect(200);
    expect(opts.body.canCheckout).toBe(true);
    expect(opts.body.methods.map((m: { key: string }) => m.key)).toEqual(["STRIPE_CARD_AE", "NOMOD_CARD_AE", "TABBY_AE", "TAMARA_AE"]);

    const bad = await agent.post("/api/v1/student/checkout").set(INTERNAL).send({ kind: "ADVANCE", amountMinor: 100, feeRateKey: "TABBY_AE" }).expect(422);
    expect(bad.body.error.message).toMatch(/below the minimum/);
    const co = await agent.post("/api/v1/student/checkout").set(INTERNAL).send({ kind: "ADVANCE", amountMinor: 30000, feeRateKey: "TABBY_AE" }).expect(200);
    expect(co.body.redirectUrl).toBe(`${STUDENT}/dev/mock-checkout/${co.body.paymentId}`);

    const submit = await request(app).post(`/api/dev/mock-checkout/${co.body.paymentId}`).type("form").send({ outcome: "succeeded" }).expect(303);
    expect(submit.headers.location).toBe(`/api/checkout/return/${co.body.paymentId}`);
    const ret = await request(app).get(submit.headers.location).expect(302);
    expect(ret.headers.location).toBe(`/payments/${co.body.paymentId}`);

    const p = await agent.get(`/api/v1/student/payments/${co.body.paymentId}`).set(INTERNAL).expect(200);
    expect(p.body).toMatchObject({ status: "SUCCEEDED", enrollmentStatus: "PENDING_APPROVAL", gateway: "TABBY" });
    const portal = await agent.get("/api/v1/student/portal").set(INTERNAL).expect(200);
    expect(portal.body.entitlements.banner).toBe("PENDING_APPROVAL");
    expect(portal.body.entitlements.canPayBalance).toBe(true);
  });

  it("accepts signed webhooks on the public endpoint and rejects forged ones", async () => {
    await createCurrentBatch();
    const { agent } = await signedUpStudent(app);
    const co = await agent.post("/api/v1/student/checkout").set(INTERNAL).send({ kind: "FULL", feeRateKey: "STRIPE_CARD_AE" }).expect(200);
    const { body, signature } = buildMockWebhook("mock-gateway-secret", co.body.paymentId, "succeeded");
    await request(app).post("/api/webhooks/mock").set("content-type", "application/json").set(MOCK_SIGNATURE_HEADER, "forged").send(body).expect(400);
    const ok = await request(app).post("/api/webhooks/mock").set("content-type", "application/json").set(MOCK_SIGNATURE_HEADER, signature).send(body).expect(200);
    expect(ok.body.result).toBe("SUCCEEDED");
    const dup = await request(app).post("/api/webhooks/mock").set("content-type", "application/json").set(MOCK_SIGNATURE_HEADER, signature).send(body).expect(200);
    expect(dup.body.duplicate).toBe(true);
    expect((await Payment.findById(co.body.paymentId).lean())!.status).toBe("SUCCEEDED");
    await request(app).post("/api/webhooks/unknown").send("{}").expect(404);
  });
});
