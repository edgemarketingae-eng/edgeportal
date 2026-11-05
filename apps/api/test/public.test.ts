import { Lead, LeadInboundEvent, Project } from "@edge/db";
import { createStaff, getDefaultProject, saveFormOrigins } from "@edge/services";
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

const FORM = "/api/public/leads";
const BROWSER = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
/** A browser submitting a plain HTML form on SITE. */
const formPost = (ip: string, origin = SITE) => ({ ...visitor(ip, origin), accept: BROWSER });

describe("website forms API", () => {
  it("takes a plain HTML form post and sends the visitor to the thank-you page", async () => {
    const res = await request(app)
      .post(FORM)
      .set(formPost("203.0.113.20"))
      .type("form")
      .send({
        name: "Form Person",
        phone: "+971 55 400 0001",
        email: "",
        message: "Interested",
        tags: "offer, ramadan",
        whatsappConsent: "on",
        utm_source: "instagram",
        page: `${SITE}/offer`,
        redirect: `${SITE}/thanks?x=1`,
        website: "",
      })
      .expect(303);
    expect(res.headers.location).toBe(`${SITE}/thanks?x=1`);
    const lead = (await Lead.findOne({ phone: "+971554000001" }).lean())!;
    expect(lead).toMatchObject({ source: "WEBSITE", sourceDetail: `${SITE}/offer`, notes: "Interested" });
    expect(lead.tags).toEqual(expect.arrayContaining(["offer", "ramadan"]));
    expect(lead.utm?.source).toBe("instagram");
    expect(lead.consent?.whatsapp).toBe(true);
  });

  it("never redirects off the allowed websites, and shows a page without a redirect", async () => {
    const off = await request(app)
      .post(FORM)
      .set(formPost("203.0.113.21"))
      .type("form")
      .send({ name: "Off Site", phone: "+971554000002", redirect: "https://evil.example/phish" })
      .expect(200);
    expect(off.headers["content-type"]).toMatch(/text\/html/);
    expect(off.text).toContain("Thank you");
    const bad = await request(app).post(FORM).set(formPost("203.0.113.21")).type("form").send({ name: "No Contact" }).expect(400);
    expect(bad.text).toContain("Enter a phone number or an email");
  });

  it("answers fetch() with JSON and never says whether the person was already a lead", async () => {
    const body = { name: "Json Person", phone: "+971554000003", tags: ["web"], consent: true, utm: { campaign: "nov" } };
    const first = await request(app).post(FORM).set(visitor("203.0.113.22")).send(body).expect(200);
    expect(first.body).toEqual({ ok: true });
    expect(first.headers["access-control-allow-origin"]).toBe(SITE);
    const again = await request(app)
      .post(FORM)
      .set(visitor("203.0.113.22"))
      .send({ ...body, message: "Again" })
      .expect(200);
    expect(again.body).toEqual({ ok: true });
    expect(await Lead.countDocuments({ phone: "+971554000003" })).toBe(1);
    // A fetch() of URLSearchParams is urlencoded but accepts anything: still JSON.
    const encoded = await request(app)
      .post(FORM)
      .set(visitor("203.0.113.22"))
      .type("form")
      .send({ name: "Encoded", email: "encoded@example.com", redirect: `${SITE}/thanks` })
      .expect(200);
    expect(encoded.body).toEqual({ ok: true });

    const invalid = await request(app).post(FORM).set(visitor("203.0.113.22")).send({ name: "Nobody" }).expect(400);
    expect(invalid.body.error).toMatchObject({ code: "VALIDATION", fieldErrors: { phone: "Enter a phone number or an email" } });
    const unreadable = await request(app).post(FORM).set(visitor("203.0.113.22")).send({ name: "Bad Phone", phone: "abc" }).expect(422);
    expect(unreadable.body.error.code).toBe("VALIDATION");
    await request(app).post(FORM).set(visitor("203.0.113.23")).field("name", "Multipart").field("phone", "+971554000009").expect(415);
  });

  it("sends a bad form back to its page with ?error=invalid and ignores bots", async () => {
    const bad = await request(app)
      .post(FORM)
      .set(formPost("203.0.113.24"))
      .type("form")
      .send({ name: "", phone: "+971554000004", redirect: `${SITE}/contact` })
      .expect(303);
    expect(bad.headers.location).toBe(`${SITE}/contact?error=invalid`);
    const bot = await request(app)
      .post(FORM)
      .set(formPost("203.0.113.24"))
      .type("form")
      .send({ name: "Bot", phone: "+971554000005", website: "spam", redirect: `${SITE}/thanks` })
      .expect(303);
    expect(bot.headers.location).toBe(`${SITE}/thanks`);
    expect(await Lead.countDocuments({ phone: "+971554000005" })).toBe(0);
    expect(await LeadInboundEvent.countDocuments({ "payload.name": "Bot" })).toBe(0);
  });

  it("allows a website saved in CRM Settings straight away and refuses others", async () => {
    const NEW = "https://offers.example";
    await request(app).options(FORM).set({ origin: NEW, "access-control-request-method": "POST" }).expect(403);
    await request(app).post(FORM).set(visitor("203.0.113.25", NEW)).send({ name: "Early", phone: "+971554000006" }).expect(403);
    await saveFormOrigins(`${NEW}/landing`, { type: "USER", id: "65f000000000000000000001" });
    const pre = await request(app)
      .options(FORM)
      .set({ origin: NEW, "access-control-request-method": "POST", "access-control-request-headers": "content-type" })
      .expect(204);
    expect(pre.headers["access-control-allow-origin"]).toBe(NEW);
    await request(app).post(FORM).set(visitor("203.0.113.25", NEW)).send({ name: "Allowed", phone: "+971554000006" }).expect(200);
    // The environment's websites stay allowed whatever the setting holds.
    await request(app).options(FORM).set({ origin: SITE }).expect(204);
    await saveFormOrigins("", { type: "USER", id: "65f000000000000000000001" });
  });

  it("rate limits a visitor and sends a form post back with ?error=rate_limited", async () => {
    let last: request.Response | null = null;
    for (let i = 0; i < 12; i++)
      last = await request(app)
        .post(FORM)
        .set(formPost("203.0.113.26"))
        .type("form")
        .send({ name: "Spammer", phone: "+971554000007", redirect: `${SITE}/thanks` });
    expect(last!.status).toBe(303);
    expect(last!.headers.location).toBe(`${SITE}/thanks?error=rate_limited`);
    const json = await request(app).post(FORM).set(visitor("203.0.113.26")).send({ name: "Spammer", phone: "+971554000007" });
    expect(json.status).toBe(429);
    expect(json.body.error.code).toBe("RATE_LIMITED");
  });

  it("lets the signed webhook name a project too", async () => {
    const offers = await Project.create({ name: "Offers", code: "OFFERS-NOV" });
    const send = (body: object) =>
      request(app)
        .post("/api/webhooks/leads/website")
        .set({ "content-type": "application/json", "x-edge-lead-token": "test-lead-webhook-secret-0123" })
        .send(JSON.stringify(body))
        .expect(200);
    await send({ id: "p-1", name: "Hook Project", phone: "+971554000008", project: "offers-nov" });
    expect(String((await Lead.findOne({ phone: "+971554000008" }).lean())!.projectId)).toBe(String(offers._id));
    await send({ id: "p-2", name: "Hook General", phone: "+971554000010", project: "MISSING" });
    expect(String((await Lead.findOne({ phone: "+971554000010" }).lean())!.projectId)).toBe(String((await getDefaultProject())._id));
  });
});
