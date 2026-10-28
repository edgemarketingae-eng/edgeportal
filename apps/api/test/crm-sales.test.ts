import { CrmProduct, Lead, LeadDeposit } from "@edge/db";
import { createStaff, ensureDefaultProducts } from "@edge/services";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, CRM, INTERNAL, producer, resetDb, startApi } from "./helpers";

// A file of its own: the auth rate limit is per app instance and these tests sign in a lot.
let app: Awaited<ReturnType<typeof startApi>>["app"];
beforeAll(async () => {
  ({ app } = await startApi());
});
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  await ensureDefaultProducts();
  producer.take();
});

let seq = 0;
async function staffAgent(role: string) {
  seq += 1;
  const email = `${role}-${seq}-${Date.now()}@edge.test`;
  const { id } = await createStaff({ name: `${role} ${seq}`, email, roleKeys: [role], password: "StaffPass!2026" }, { type: "SYSTEM" });
  const agent = request.agent(app);
  await agent
    .post("/api/v1/auth/sign-in")
    .set("Origin", CRM)
    .send({ identifier: email, password: "StaffPass!2026", app: "crm" })
    .expect(200);
  return { agent, id, email };
}

const generalId = async (agent: ReturnType<typeof request.agent>) =>
  (await agent.get("/api/v1/crm/options").set(INTERNAL).expect(200)).body.projects.find((p: { isDefault: boolean }) => p.isDefault)
    .id as string;

describe("products, deposits and commission over the API", () => {
  it("lets sales mark conversions and log deposits; only commission managers verify and see everyone's commission", async () => {
    const exec = await staffAgent("sales_executive");
    const mgr = await staffAgent("crm_manager");
    const admin = await staffAgent("crm_admin");
    const g = await generalId(exec.agent);
    const lead = (
      await exec.agent
        .post("/api/v1/crm/leads")
        .set(INTERNAL)
        .send({ projectId: g, name: "Api Lead", phone: "+971501230777", source: "INSTAGRAM", language: "TAMIL", jetaFxClientId: "JX-API" })
        .expect(200)
    ).body.id as string;
    await exec.agent
      .post("/api/v1/crm/leads")
      .set(INTERNAL)
      .send({ projectId: g, name: "Bad Language", phone: "+971501230778", source: "INSTAGRAM", language: "Klingon" })
      .expect(400);

    // Products: listed in the options for everyone, managed with crm.manage only.
    const options = (await exec.agent.get("/api/v1/crm/options").set(INTERNAL).expect(200)).body;
    const inner = options.products.find((p: { name: string }) => p.name === "Inner Circle").id as string;
    await exec.agent.get("/api/v1/crm/products").set(INTERNAL).expect(403);
    await exec.agent.post("/api/v1/crm/products").set(INTERNAL).send({ name: "Sneaky Club" }).expect(403);
    await mgr.agent.post("/api/v1/crm/products").set(INTERNAL).send({ name: "Gold Club" }).expect(200);
    expect(await CrmProduct.countDocuments({ name: "Gold Club" })).toBe(1);

    await exec.agent
      .post(`/api/v1/crm/leads/${lead}/conversions`)
      .set(INTERNAL)
      .send({ productIds: [inner] })
      .expect(200);
    const detail = (await exec.agent.get(`/api/v1/crm/leads/${lead}`).set(INTERNAL).expect(200)).body;
    expect(detail.lead).toMatchObject({ stage: "CONVERTED", language: "TAMIL", jetaFxClientId: "JX-API" });
    const conversionId = detail.conversions[0].id as string;
    await exec.agent.post(`/api/v1/crm/conversions/${conversionId}/delete`).set(INTERNAL).expect(403);

    const dep = (
      await exec.agent
        .post(`/api/v1/crm/leads/${lead}/deposits`)
        .set(INTERNAL)
        .send({ sequence: "FIRST", amount: "1500", depositedAt: "2026-01-15" })
        .expect(200)
    ).body.id as string;
    await exec.agent
      .post(`/api/v1/crm/leads/${lead}/deposits`)
      .set(INTERNAL)
      .send({ sequence: "FIRST", amount: "-5", depositedAt: "2026-01-15" })
      .expect(400);

    // Rates and verification: CRM admin only (not the executive, not a CRM manager).
    for (const a of [exec.agent, mgr.agent]) {
      await a.get("/api/v1/crm/commission").set(INTERNAL).expect(403);
      await a.post("/api/v1/crm/commission").set(INTERNAL).send({ firstPct: 50, secondPct: 50, laterPct: 50 }).expect(403);
      await a.post(`/api/v1/crm/deposits/${dep}/verify`).set(INTERNAL).expect(403);
      await a.get(`/api/v1/crm/team/${exec.id}/commission`).set(INTERNAL).expect(403);
    }
    await admin.agent.post("/api/v1/crm/commission").set(INTERNAL).send({ firstPct: 10, secondPct: 5, laterPct: 2 }).expect(200);
    expect((await admin.agent.get("/api/v1/crm/commission").set(INTERNAL).expect(200)).body).toEqual({
      firstPct: 10,
      secondPct: 5,
      laterPct: 2,
    });
    await admin.agent.post(`/api/v1/crm/deposits/${dep}/verify`).set(INTERNAL).expect(200);
    expect((await LeadDeposit.findById(dep).lean())!.commissionMinor).toBe(15000);

    const mine = (await exec.agent.get("/api/v1/crm/deposits").set(INTERNAL).expect(200)).body;
    expect(mine).toMatchObject({ manage: false, total: 1, summary: { commissionMinor: 15000 } });
    expect((await mgr.agent.get("/api/v1/crm/deposits").set(INTERNAL).expect(200)).body.total).toBe(0);
    expect((await admin.agent.get(`/api/v1/crm/team/${exec.id}/commission`).set(INTERNAL).expect(200)).body.commission.all).toBe(15000);

    const board = (await exec.agent.get("/api/v1/crm/leaderboard?period=all").set(INTERNAL).expect(200)).body;
    expect(board.showCommission).toBe(false);
    expect(board.rows[0]).toMatchObject({ id: exec.id, conversions: 1, commissionMinor: null });
    expect(board.me.commissionMinor).toBe(15000);
    expect((await admin.agent.get("/api/v1/crm/leaderboard?period=all").set(INTERNAL).expect(200)).body.rows[0].commissionMinor).toBe(
      15000,
    );

    await mgr.agent.post(`/api/v1/crm/conversions/${conversionId}/delete`).set(INTERNAL).expect(200);
    expect((await Lead.findById(lead).lean())!.productIds).toHaveLength(0);
  });
});
