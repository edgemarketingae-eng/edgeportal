import { Lead, LeadActivity, StaffProfile, Types } from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { freezeClock, setClock } from "@edge/domain/clock";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  captureFreeClassLead,
  createLead,
  createStaff,
  getDefaultProject,
  getPublicFreeClass,
  listStaff,
  setSetting,
  updateStaff,
  ValidationError,
} from "../src";
import { producer, sent } from "./helpers";

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  producer.take();
  sent.length = 0;
  freezeClock("2026-10-06T06:00:00Z"); // 10:00 Dubai
});
afterEach(() => setClock(null));

let n = 0;
async function exec(name: string, phone?: string, role = "sales_executive") {
  n += 1;
  const { id } = await createStaff(
    { name, email: `exec-${n}-${Date.now()}@edge.test`, roleKeys: [role], phone, password: "StaffPass!2026" },
    { type: "SYSTEM" },
  );
  return id;
}
const ownerOf = async (phone: string) => (await Lead.findOne({ phone }).lean())?.ownerId?.toString() ?? null;
const textOf = (url: string) => new URL(url).searchParams.get("text");

describe("staff phone", () => {
  it("is optional, normalised to E.164, kept when omitted on update, cleared when empty and rejected when invalid", async () => {
    const id = await exec("Phone Person", "+971 50 123 4567");
    expect((await StaffProfile.findById(id).lean())!.phone).toBe("+971501234567");
    expect((await listStaff()).find((s) => s.id === id)!.phone).toBe("+971501234567");
    const actor = { type: "USER" as const, id: await exec("Admin", undefined, "super_admin") };
    await updateStaff(id, { name: "Phone Person", roleKeys: ["sales_executive"] }, actor);
    expect((await StaffProfile.findById(id).lean())!.phone).toBe("+971501234567");
    await updateStaff(id, { name: "Phone Person", roleKeys: ["sales_executive"], phone: "" }, actor);
    expect((await StaffProfile.findById(id).lean())!.phone).toBeNull();
    await expect(updateStaff(id, { name: "Phone Person", roleKeys: ["sales_executive"], phone: "12" }, actor)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect((await StaffProfile.findById(await exec("No Phone")).lean())!.phone).toBeNull();
  });
});

describe("free class landing", () => {
  it("assigns the lead in General to the sales executive with a phone and the fewest open leads, whatever the round-robin setting", async () => {
    const busy = await exec("Busy Bee", "+971500000001");
    const free = await exec("Free Fatima", "+971500000002");
    await exec("Nophone Nadia"); // no phone: never picked
    const g = await getDefaultProject();
    await createLead(
      { projectId: String(g._id), name: "Existing", phone: "+971509990000", source: "WEBSITE", ownerId: busy },
      { type: "SYSTEM" },
    );

    const r = await captureFreeClassLead({ name: "Ali Hassan", phone: "+971551112233", utm: { source: "meta", campaign: "free-class" } });
    expect(await ownerOf("+971551112233")).toBe(free);
    expect(r.contactName).toBe("Free Fatima");
    expect(r.whatsappUrl).toMatch(/^https:\/\/wa\.me\/971500000002\?text=/);
    expect(textOf(r.whatsappUrl!)).toBe(
      "Hi Free, I'm Ali Hassan. I'd like to join the free live trading class. Please send me the details.",
    );

    const lead = (await Lead.findOne({ phone: "+971551112233" }).lean())!;
    expect(String(lead.projectId)).toBe(String(g._id));
    expect(lead.source).toBe("WEBSITE");
    expect(lead.sourceDetail).toBe("Free live class landing page");
    expect(lead.tags).toContain("free-live-class");
    expect(lead.utm?.campaign).toBe("free-class");
    expect(lead.consent?.whatsapp).toBe(true);
    expect(await LeadActivity.countDocuments({ leadId: lead._id, type: "SYSTEM", "data.landing": "free-class" })).toBe(1);

    // Both now hold one open lead: the tie goes to the first by name.
    await captureFreeClassLead({ name: "Second", phone: "+971551112244" });
    expect(await ownerOf("+971551112244")).toBe(busy);
  });

  it("keeps an existing owner, assigns an unowned duplicate, and mentions the class title when it is switched on", async () => {
    const a = await exec("Amal", "+971500000011");
    await setSetting("marketing.freeClass", {
      enabled: true,
      title: "Gold Basics Live",
      startsAt: "2026-10-10T15:00:00.000Z",
      durationMinutes: 90,
      platform: "Zoom",
    });
    const g = await getDefaultProject();
    const unowned = await createLead(
      { projectId: String(g._id), name: "Old Lead", phone: "+971552223344", source: "IMPORT" },
      { type: "SYSTEM" },
    );

    const r = await captureFreeClassLead({ name: "Old Lead", phone: "+971552223344" });
    expect(await ownerOf("+971552223344")).toBe(a);
    expect(await Lead.countDocuments({ phone: "+971552223344" })).toBe(1);
    expect(await LeadActivity.countDocuments({ leadId: new Types.ObjectId(unowned), type: "ASSIGNED" })).toBe(1);
    expect(textOf(r.whatsappUrl!)).toContain("free live trading class (Gold Basics Live)");

    const b = await exec("Aaron", "+971500000012"); // fewer leads now, but the lead keeps its owner
    const again = await captureFreeClassLead({ name: "Old Lead", phone: "+971552223344" });
    expect(await ownerOf("+971552223344")).toBe(a);
    expect(again.contactName).toBe("Amal");
    expect(b).toBeTruthy();
  });

  it("falls back to the academy support WhatsApp, or to no link, when no sales executive has a phone", async () => {
    await exec("Silent Sam");
    const none = await captureFreeClassLead({ name: "Nobody Home", phone: "+971553334455" });
    expect(none).toEqual({ whatsappUrl: null, contactName: null });
    expect(await ownerOf("+971553334455")).toBeNull();

    await setSetting("academy.profile", {
      name: "Edge Trading Academy",
      supportEmail: "support@edgeacademy.ae",
      supportWhatsapp: "050 765 4321",
      website: "https://edgeacademy.ae",
    });
    const support = await captureFreeClassLead({ name: "Later Lead", phone: "+971553334466" });
    expect(support.contactName).toBe("Edge Trading Academy");
    expect(support.whatsappUrl).toMatch(/^https:\/\/wa\.me\/971507654321\?/);
    expect(textOf(support.whatsappUrl!)).toMatch(/^Hi Edge Trading Academy, I'm Later Lead\./);
  });

  it("rejects an invalid phone", async () => {
    await expect(captureFreeClassLead({ name: "Bad Phone", phone: "12345" })).rejects.toMatchObject({ status: 422 });
  });

  it("shows the class only when switched on, and drops a date that has ended", async () => {
    expect(await getPublicFreeClass()).toBeNull();
    const fc = { enabled: true, title: "Live Class", startsAt: "2026-10-06T05:00:00.000Z", durationMinutes: 90, platform: "Zoom" };
    await setSetting("marketing.freeClass", fc);
    expect((await getPublicFreeClass())!.startsAt).toBe(fc.startsAt); // started an hour ago, still running
    await setSetting("marketing.freeClass", { ...fc, startsAt: "2026-10-06T03:00:00.000Z" });
    expect(await getPublicFreeClass()).toMatchObject({ title: "Live Class", startsAt: null });
  });
});
