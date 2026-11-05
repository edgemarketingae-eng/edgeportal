import { AuditLog, InAppNotification, Lead, LeadActivity, LeadInboundEvent, Project } from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { freezeClock, setClock } from "@edge/domain/clock";
import { ApiError } from "@edge/contracts";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  allowedFormOrigins,
  getCrmSettings,
  getDefaultProject,
  parseFormOrigins,
  saveFormOrigins,
  submitWebsiteForm,
  sweepLeadInbox,
  ValidationError,
} from "../src";
import { producer } from "./helpers";

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  producer.take();
  freezeClock("2026-10-06T06:00:00Z"); // 10:00 Dubai
});
afterEach(() => setClock(null));

const meta = { ip: "203.0.113.5", origin: "https://offers.example", userAgent: "test" };
const admin = { type: "USER" as const, id: "65f000000000000000000001" };

describe("allowed websites", () => {
  it("reduces page addresses to their website, drops repeats and refuses anything that isn't an https website", () => {
    expect(parseFormOrigins("https://edgeacademy.ae/free-class/\nhttps://edgeacademy.ae, offers.edgeacademy.ae\n\n")).toEqual([
      "https://edgeacademy.ae",
      "https://offers.edgeacademy.ae",
    ]);
    // Outside production, a local test page may use plain http.
    expect(parseFormOrigins("http://localhost:8080/form.html")).toEqual(["http://localhost:8080"]);
    expect(() => parseFormOrigins("http://edgeacademy.ae")).toThrow(ValidationError);
    expect(() => parseFormOrigins("ftp://files.example")).toThrow(ValidationError);
    expect(() => parseFormOrigins("https://user:pass@edgeacademy.ae")).toThrow(ValidationError);
    expect(() => parseFormOrigins(Array.from({ length: 21 }, (_, i) => `https://s${i}.example`).join("\n"))).toThrow(ValidationError);
    expect(parseFormOrigins("")).toEqual([]);
  });

  it("saves the list, audits it and allows the websites at once", async () => {
    expect((await allowedFormOrigins()).has("https://offers.example")).toBe(false);
    await saveFormOrigins("https://offers.example/landing", admin);
    expect((await allowedFormOrigins()).has("https://offers.example")).toBe(true);
    const s = await getCrmSettings();
    expect(s.formOrigins).toEqual(["https://offers.example"]);
    expect(s.publicFormUrl).toMatch(/\/api\/public\/leads$/);
    expect(await AuditLog.exists({ action: "crm.formOrigins.update", entityId: "crm.formOrigins" })).toBeTruthy();
    await saveFormOrigins("", admin);
    expect((await allowedFormOrigins()).has("https://offers.example")).toBe(false);
  });
});

describe("website form leads", () => {
  it("saves the lead through the inbox and counts a same-day repeat once", async () => {
    const lead = { name: "Form Visitor", phone: "+971 55 300 0001", message: "Call me", page: "https://offers.example/a" };
    expect(await submitWebsiteForm(lead, meta)).toEqual({ queued: false });
    expect(await submitWebsiteForm(lead, meta)).toEqual({ queued: false });
    const leads = await Lead.find({ phone: "+971553000001" }).lean();
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ source: "WEBSITE", sourceDetail: "https://offers.example/a" });
    expect(String(leads[0]!.projectId)).toBe(String((await getDefaultProject())._id));
    const events = await LeadInboundEvent.find({ source: "website" }).lean();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      signatureOk: false,
      payload: { _via: "form", _origin: "https://offers.example", _ip: "203.0.113.5" },
    });
    expect(events[0]!.externalEventId).toMatch(/^form:2026-10-06:[a-f0-9]{64}$/);

    // The next day the same enquiry is a new event: it goes on the existing lead's timeline.
    freezeClock("2026-10-07T06:00:00Z");
    await submitWebsiteForm(lead, meta);
    expect(await Lead.countDocuments({ phone: "+971553000001" })).toBe(1);
    expect(await LeadActivity.countDocuments({ leadId: leads[0]!._id, type: "INBOUND" })).toBe(1);
    expect(await LeadInboundEvent.countDocuments({ source: "website" })).toBe(2);
  });

  it("refuses a lead with no usable contact, every time it is sent", async () => {
    const bad = { name: "No Contact", phone: "call me maybe" };
    const first = await submitWebsiteForm(bad, meta).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(ApiError);
    expect((first as ApiError).status).toBe(422);
    const again = await submitWebsiteForm(bad, meta).catch((e: unknown) => e);
    expect((again as ApiError).status).toBe(422);
    expect(await Lead.countDocuments({ name: "No Contact" })).toBe(0);
  });

  it("puts new leads in the project named by its code; an unknown code goes to General without alerting anyone", async () => {
    const offers = await Project.create({ name: "Offers", code: "OFFERS-NOV" });
    await submitWebsiteForm({ name: "In Project", phone: "+971553000002", project: "OFFERS-NOV" }, meta);
    expect(String((await Lead.findOne({ phone: "+971553000002" }).lean())!.projectId)).toBe(String(offers._id));

    await submitWebsiteForm({ name: "Typo Code", phone: "+971553000003", project: "NO-SUCH-CODE" }, meta);
    expect(String((await Lead.findOne({ phone: "+971553000003" }).lean())!.projectId)).toBe(String((await getDefaultProject())._id));
    expect(await InAppNotification.exists({ title: /NO-SUCH-CODE/ })).toBeNull();

    // An archived project still tells the admins, as the website pages' projects do.
    await Project.create({ name: "Old", code: "OLD-OFFER", status: "ARCHIVED" });
    await submitWebsiteForm({ name: "Old Offer", phone: "+971553000004", project: "OLD-OFFER" }, meta);
    expect(String((await Lead.findOne({ phone: "+971553000004" }).lean())!.projectId)).toBe(String((await getDefaultProject())._id));
  });

  it("keeps the project when the sweeper finishes an event that failed", async () => {
    const offers = await Project.create({ name: "Offers", code: "OFFERS-NOV" });
    await LeadInboundEvent.create({
      source: "website",
      externalEventId: "form:2026-10-06:stuck",
      signatureOk: false,
      payload: { name: "Stuck Visitor", phone: "+971553000005", project: "OFFERS-NOV", _via: "form" },
      receivedAt: new Date("2026-10-06T05:00:00Z"),
    });
    expect(await sweepLeadInbox()).toMatchObject({ checked: 1, processed: 1 });
    expect(String((await Lead.findOne({ phone: "+971553000005" }).lean())!.projectId)).toBe(String(offers._id));
  });
});
