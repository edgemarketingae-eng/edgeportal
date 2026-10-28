import { Lead } from "@edge/db";
import { createStaff } from "@edge/services";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeTestDb, producer, resetDb, startApi } from "./helpers";

let app: Awaited<ReturnType<typeof startApi>>["app"];
beforeAll(async () => {
  ({ app } = await startApi());
});
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  producer.take();
});

const LEADS = "/api/public/growth-hub/leads";
const SITE = "https://growthhub.example";
/** Each test gets its own visitor IP, so the rate limit of one never leaks into another. */
const visitor = (ip: string, origin = SITE) => ({ origin, "x-forwarded-for": ip });

describe("Forex Growth Hub form API", () => {
  it("answers the CORS preflight for an allowed site and refuses any other origin", async () => {
    const pre = await request(app)
      .options(LEADS)
      .set({ origin: SITE, "access-control-request-method": "POST", "access-control-request-headers": "content-type" })
      .expect(204);
    expect(pre.headers["access-control-allow-origin"]).toBe(SITE);
    expect(pre.headers["access-control-allow-methods"]).toBe("POST");
    expect(pre.headers["access-control-allow-headers"]).toBe("content-type");
    expect(pre.headers.vary).toMatch(/Origin/);
    // A trailing slash in the setting is ignored.
    await request(app).options(LEADS).set({ origin: "http://localhost:8080" }).expect(204);

    const evil = await request(app).options(LEADS).set({ origin: "https://evil.example" }).expect(403);
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
    await request(app)
      .post(LEADS)
      .set(visitor("203.0.113.10", "https://evil.example"))
      .send({ name: "Visitor", whatsapp: "+971551230000" })
      .expect(403);
    expect(await Lead.countDocuments({ phone: "+971551230000" })).toBe(0);
  });

  it("creates the lead without the internal token and returns the owner's WhatsApp link", async () => {
    const { id } = await createStaff(
      {
        name: "Sara Sales",
        email: `sara-${Date.now()}@edge.test`,
        roleKeys: ["sales_executive"],
        phone: "+971500001111",
        password: "StaffPass!2026",
      },
      { type: "SYSTEM" },
    );
    const res = await request(app)
      .post(LEADS)
      .set(visitor("203.0.113.11"))
      .send({ name: "Visitor One", whatsapp: "+971 551231234", phone: "+971 551231234", page: `${SITE}/`, utm: { source: "ig" } })
      .expect(200);
    expect(res.headers["access-control-allow-origin"]).toBe(SITE);
    expect(res.body).toMatchObject({ ok: true, contactName: "Sara Sales" });
    expect(res.body.contactUrl).toMatch(/^https:\/\/wa\.me\/971500001111\?text=Hi%20Sara/);
    const lead = (await Lead.findOne({ phone: "+971551231234" }).lean())!;
    expect(String(lead.ownerId)).toBe(id);
    expect(lead.tags).toContain("growth-hub");
    expect(lead.utm?.source).toBe("ig");
  });

  it("sends an Inner Circle request to the owner's Telegram when that is their channel", async () => {
    await createStaff(
      {
        name: "Tariq Tele",
        email: `tariq-${Date.now()}@edge.test`,
        roleKeys: ["sales_executive"],
        telegramUsername: "@tariq_edge",
        contactChannel: "TELEGRAM",
        password: "StaffPass!2026",
      },
      { type: "SYSTEM" },
    );
    const res = await request(app)
      .post(LEADS)
      .set(visitor("203.0.113.15"))
      .send({ intent: "inner-circle", name: "Jamal Trader", whatsapp: "+971551239000", email: "jamal@example.com", jetaFxClientId: "JX-1" })
      .expect(200);
    expect(res.body).toMatchObject({ ok: true, channel: "TELEGRAM", contactName: "Tariq Tele" });
    expect(res.body.contactUrl).toMatch(/^https:\/\/t\.me\/tariq_edge\?text=.*Inner%20Circle/);
    expect((await Lead.findOne({ phone: "+971551239000" }).lean())!).toMatchObject({ jetaFxClientId: "JX-1", email: "jamal@example.com" });
  });

  it("validates input, ignores bots and rate limits by visitor", async () => {
    const bad = await request(app).post(LEADS).set(visitor("203.0.113.12")).send({ name: "A", whatsapp: "" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION");
    expect(bad.headers["access-control-allow-origin"]).toBe(SITE); // the page can read the error

    const bot = await request(app)
      .post(LEADS)
      .set(visitor("203.0.113.12"))
      .send({ name: "Bot Name", whatsapp: "+971551231299", website: "spam.example" })
      .expect(200);
    expect(bot.body).toEqual({ ok: true, contactUrl: null, channel: null, contactName: null });
    expect(await Lead.countDocuments({ phone: "+971551231299" })).toBe(0);

    let last = 200;
    for (let i = 0; i < 15 && last !== 429; i++)
      last = (await request(app).post(LEADS).set(visitor("203.0.113.13")).send({ name: "Spammer", whatsapp: "+971551231300" })).status;
    expect(last).toBe(429);
    // Another visitor is unaffected.
    await request(app).post(LEADS).set(visitor("203.0.113.14")).send({ name: "Real Person", whatsapp: "+971551231301" }).expect(200);
  });
});
