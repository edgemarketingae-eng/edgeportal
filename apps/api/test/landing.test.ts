import { Lead, Project } from "@edge/db";
import { createStaff, setSetting } from "@edge/services";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CONSOLE, closeTestDb, INTERNAL, producer, resetDb, startApi } from "./helpers";

let app: Awaited<ReturnType<typeof startApi>>["app"];
beforeAll(async () => {
  ({ app } = await startApi());
});
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  producer.take();
});

const LEADS = "/api/v1/public/free-class/leads";
/** Each test gets its own visitor IP, so the rate limit of one never leaks into another. */
const visitor = (ip: string) => ({ ...INTERNAL, "x-forwarded-for": ip });

describe("free class landing API", () => {
  it("creates the lead, assigns a sales executive with a phone and returns their WhatsApp link", async () => {
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
    await request(app).post(LEADS).send({ name: "Visitor", phone: "+971551231234" }).expect(404); // only the student app (internal token) can call it
    const res = await request(app)
      .post(LEADS)
      .set(visitor("203.0.113.1"))
      .send({ name: "Visitor One", phone: "+971551231234", utm: { source: "meta" } })
      .expect(200);
    expect(res.body).toMatchObject({ ok: true, contactName: "Sara Sales" });
    expect(res.body.contactUrl).toMatch(/^https:\/\/wa\.me\/971500001111\?text=Hi%20Sara/);
    const lead = (await Lead.findOne({ phone: "+971551231234" }).lean())!;
    expect(String(lead.ownerId)).toBe(id);
    expect(lead.utm?.source).toBe("meta");
  });

  it("validates input, ignores bots and rate limits by visitor", async () => {
    const bad = await request(app).post(LEADS).set(visitor("203.0.113.2")).send({ name: "A", phone: "" });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.body.error.code).toBe("VALIDATION");

    const bot = await request(app)
      .post(LEADS)
      .set(visitor("203.0.113.2"))
      .send({ name: "Bot Name", phone: "+971551231299", website: "spam.example" })
      .expect(200);
    expect(bot.body).toEqual({ ok: true, contactUrl: null, channel: null, contactName: null });
    expect(await Lead.countDocuments({ phone: "+971551231299" })).toBe(0);

    let last = 200;
    for (let i = 0; i < 15 && last !== 429; i++)
      last = (await request(app).post(LEADS).set(visitor("203.0.113.3")).send({ name: "Spammer", phone: "+971551231300" })).status;
    expect(last).toBe(429);
    // Another visitor is unaffected.
    await request(app).post(LEADS).set(visitor("203.0.113.4")).send({ name: "Real Person", phone: "+971551231301" }).expect(200);
  });

  it("serves the free class, saved from console settings", async () => {
    expect((await request(app).get("/api/v1/public/free-class").set(INTERNAL).expect(200)).body).toEqual({ freeClass: null });
    await setSetting("marketing.freeClass", {
      enabled: true,
      title: "Live Gold",
      startsAt: "2099-01-01T15:00:00.000Z",
      durationMinutes: 60,
      platform: "Zoom",
    });
    expect((await request(app).get("/api/v1/public/free-class").set(INTERNAL).expect(200)).body.freeClass).toEqual({
      title: "Live Gold",
      startsAt: "2099-01-01T15:00:00.000Z",
      durationMinutes: 60,
      platform: "Zoom",
    });

    const email = `admin-${Date.now()}@edge.test`;
    await createStaff({ name: "Admin", email, roleKeys: ["super_admin"], password: "StaffPass!2026" }, { type: "SYSTEM" });
    const agent = request.agent(app);
    await agent
      .post("/api/v1/auth/sign-in")
      .set("Origin", CONSOLE)
      .send({ identifier: email, password: "StaffPass!2026", app: "console" })
      .expect(200);
    await agent
      .post("/api/v1/admin/settings/free-class")
      .set(INTERNAL)
      .send({ enabled: true, title: "Forex Live", startsAt: "2099-02-01T19:30", durationMinutes: "90", platform: "Google Meet" })
      .expect(200);
    const s = (await agent.get("/api/v1/admin/settings").set(INTERNAL).expect(200)).body.freeClass;
    expect(s).toEqual({
      enabled: true,
      title: "Forex Live",
      startsAt: "2099-02-01T15:30:00.000Z",
      durationMinutes: 90,
      platform: "Google Meet",
    });
    const invalid = await agent
      .post("/api/v1/admin/settings/free-class")
      .set(INTERNAL)
      .send({ enabled: true, title: "Forex Live", startsAt: "soon", durationMinutes: 90, platform: "" });
    expect(invalid.body.error.fieldErrors.startsAt).toBeTruthy();
  });
});

describe("contact page API", () => {
  const SUPPORT = "/api/v1/public/support/leads";

  it("creates the lead in the Free Course support project with the topic, validates input and ignores bots", async () => {
    const fcs = await Project.create({ name: "Free Course support", code: "FREE-COURSE-SUPPORT" });
    await request(app).post(SUPPORT).send({ name: "Visitor", phone: "+971551231400", topic: "COURSE" }).expect(404); // internal token only
    const res = await request(app)
      .post(SUPPORT)
      .set(visitor("203.0.113.20"))
      .send({ name: "Course Visitor", phone: "+971551231400", topic: "COURSE", message: "Weekend batch?" })
      .expect(200);
    expect(res.body).toMatchObject({ ok: true });
    const lead = (await Lead.findOne({ phone: "+971551231400" }).lean())!;
    expect(String(lead.projectId)).toBe(String(fcs._id));
    expect(lead).toMatchObject({ sourceDetail: "Contact page · Course joining", notes: "Contact page: Course joining\nWeekend batch?" });

    const bad = await request(app)
      .post(SUPPORT)
      .set(visitor("203.0.113.21"))
      .send({ name: "Topicless", phone: "+971551231401", topic: "PIZZA" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION");

    const bot = await request(app)
      .post(SUPPORT)
      .set(visitor("203.0.113.21"))
      .send({ name: "Bot Name", phone: "+971551231402", topic: "SUPPORT", website: "spam.example" })
      .expect(200);
    expect(bot.body).toEqual({ ok: true, contactUrl: null, channel: null, contactName: null });
    expect(await Lead.countDocuments({ phone: "+971551231402" })).toBe(0);
  });
});
