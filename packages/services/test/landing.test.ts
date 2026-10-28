import { Lead, LeadActivity, StaffProfile, Types } from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { freezeClock, setClock } from "@edge/domain/clock";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  captureFreeClassLead,
  captureGrowthHubLead,
  createLead,
  createStaff,
  getDefaultProject,
  getPublicFreeClass,
  listCrmUsers,
  listStaff,
  NotFoundError,
  salesExecutivesFor,
  setCrmStaffAvailable,
  setSetting,
  setStaffAvailable,
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

describe("Forex Growth Hub form", () => {
  it("creates the lead under the WhatsApp number, keeps a different call number and links to the exec's WhatsApp", async () => {
    const e = await exec("Hana Hub", "+971500000051");
    const r = await captureGrowthHubLead({
      name: "Ravi Kumar",
      whatsapp: "+971 551110001",
      phone: "+91 9876543210",
      page: "https://growthhub.edgeacademy.ae/",
      utm: { source: "ig", medium: "social" },
    });
    expect(r.contactName).toBe("Hana Hub");
    expect(r.whatsappUrl).toMatch(/^https:\/\/wa\.me\/971500000051\?text=/);
    expect(textOf(r.whatsappUrl!)).toBe(
      "Hi Hana, I'm Ravi Kumar. I watched the free trading classes on Forex Growth Hub and I'd like to know about your courses. Please send me the details.",
    );

    const lead = (await Lead.findOne({ phone: "+971551110001" }).lean())!;
    expect(String(lead.ownerId)).toBe(e);
    expect(lead.source).toBe("WEBSITE");
    expect(lead.sourceDetail).toBe("Forex Growth Hub");
    expect(lead.tags).toContain("growth-hub");
    expect(lead.notes).toBe("WhatsApp: +971551110001\nPhone (calls): +919876543210");
    expect(lead.utm).toMatchObject({ source: "ig", medium: "social" });
    expect(lead.consent?.whatsapp).toBe(true);
    expect(await LeadActivity.countDocuments({ leadId: lead._id, type: "SYSTEM", "data.landing": "growth-hub" })).toBe(1);

    // The same number for both: nothing extra in the notes.
    await captureGrowthHubLead({ name: "Same Number", whatsapp: "+971551110002", phone: "+971 55 111 0002" });
    expect((await Lead.findOne({ phone: "+971551110002" }).lean())!.notes).toBeNull();
  });

  it("sends a known lead to its own owner, found under the WhatsApp number or the call number", async () => {
    const owner = await exec("Zara Owner", "+971500000061");
    await exec("Adam Idle", "+971500000062"); // fewer leads, but never takes a known lead from its owner
    const g = String((await getDefaultProject())._id);
    const known = await createLead(
      { projectId: g, name: "Walk In", phone: "+971551110010", source: "WALK_IN", ownerId: owner },
      { type: "SYSTEM" },
    );

    const byWa = await captureGrowthHubLead({ name: "Walk In", whatsapp: "+971551110010" });
    expect(byWa.contactName).toBe("Zara Owner");

    // Their WhatsApp is a new number; the call number is the one the CRM knows.
    const byCall = await captureGrowthHubLead({ name: "Walk In", whatsapp: "+971551110099", phone: "+971551110010" });
    expect(byCall.whatsappUrl).toMatch(/^https:\/\/wa\.me\/971500000061\?/);
    expect(await Lead.countDocuments({ phone: { $in: ["+971551110010", "+971551110099"] } })).toBe(1);
    expect(await ownerOf("+971551110010")).toBe(owner);
    const inbound = await LeadActivity.find({ leadId: new Types.ObjectId(known), type: "INBOUND" }).sort({ createdAt: 1 }).lean();
    expect(inbound).toHaveLength(2);
    expect(inbound[1]!.body).toContain("WhatsApp: +971551110099");
    expect((await Lead.findById(known).lean())!.tags).toContain("growth-hub");
  });

  it("hands a known lead from an Off owner to an available exec, and uses support WhatsApp when there is none", async () => {
    const actor = { type: "USER" as const, id: await exec("Boss", undefined, "crm_admin") };
    const away = await exec("Away Owner", "+971500000071");
    const g = String((await getDefaultProject())._id);
    await createLead({ projectId: g, name: "Back Again", phone: "+971551110020", source: "WEBSITE", ownerId: away }, { type: "SYSTEM" });
    await setStaffAvailable(away, false, actor);
    await setSetting("academy.profile", {
      name: "Edge Trading Academy",
      supportEmail: "support@edgeacademy.ae",
      supportWhatsapp: "050 765 4321",
      website: "https://edgeacademy.ae",
    });

    const support = await captureGrowthHubLead({ name: "Back Again", whatsapp: "+971551110020" });
    expect(support.contactName).toBe("Edge Trading Academy");
    expect(support.whatsappUrl).toMatch(/^https:\/\/wa\.me\/971507654321\?/);
    expect(await ownerOf("+971551110020")).toBe(away);

    const on = await exec("On Duty", "+971500000072");
    const r = await captureGrowthHubLead({ name: "Back Again", whatsapp: "+971551110020" });
    expect(r.contactName).toBe("On Duty");
    expect(await ownerOf("+971551110020")).toBe(on);
  });

  it("rejects an invalid WhatsApp number", async () => {
    await expect(captureGrowthHubLead({ name: "Bad Number", whatsapp: "12345" })).rejects.toMatchObject({ status: 422 });
  });
});

describe("staff Off", () => {
  const admin = async () => ({ type: "USER" as const, id: await exec("Boss", undefined, "crm_admin") });

  it("skips Off people in round-robin and on the landing page, but keeps them in pickers and manual assignment", async () => {
    const actor = await admin();
    const offExec = await exec("Aisha Away", "+971500000021");
    const onExec = await exec("Omar On", "+971500000022");
    await setStaffAvailable(offExec, false, actor);
    expect((await listStaff()).find((s) => s.id === offExec)!.available).toBe(false);
    expect((await salesExecutivesFor(await getDefaultProject())).map((e) => e.id)).toEqual([onExec]);

    const r = await captureFreeClassLead({ name: "New Visitor", phone: "+971554440001" });
    expect(await ownerOf("+971554440001")).toBe(onExec);
    expect(r.contactName).toBe("Omar On");

    // Still a normal team member: listed (marked Off) and assignable by hand.
    expect((await listCrmUsers()).find((u) => u.id === offExec)).toMatchObject({ available: false });
    const g = String((await getDefaultProject())._id);
    await createLead({ projectId: g, name: "Manual", phone: "+971554440002", source: "WALK_IN", ownerId: offExec }, { type: "SYSTEM" });
    expect(await ownerOf("+971554440002")).toBe(offExec);
  });

  it("hands a returning visitor's lead from an Off owner to an available one, or keeps it and uses support when nobody is on", async () => {
    const actor = await admin();
    const first = await exec("Faris First", "+971500000031");
    const g = String((await getDefaultProject())._id);
    const lead = await createLead(
      { projectId: g, name: "Returning", phone: "+971554440010", source: "WEBSITE", ownerId: first },
      { type: "SYSTEM" },
    );
    await setStaffAvailable(first, false, actor);

    // Nobody else is on: the owner stays, the visitor goes to support (none configured here).
    expect(await captureFreeClassLead({ name: "Returning", phone: "+971554440010" })).toEqual({ whatsappUrl: null, contactName: null });
    expect(await ownerOf("+971554440010")).toBe(first);

    const second = await exec("Sana Second", "+971500000032");
    const r = await captureFreeClassLead({ name: "Returning", phone: "+971554440010" });
    expect(await ownerOf("+971554440010")).toBe(second);
    expect(r.whatsappUrl).toMatch(/^https:\/\/wa\.me\/971500000032\?/);
    expect(await LeadActivity.countDocuments({ leadId: new Types.ObjectId(lead), type: "ASSIGNED", "data.to": second })).toBe(1);

    // Back on: new leads may go to them again.
    await setStaffAvailable(first, true, actor);
    expect((await salesExecutivesFor(await getDefaultProject())).map((e) => e.id).sort()).toEqual([first, second].sort());
  });

  it("is managed from the CRM for CRM-only staff", async () => {
    const actor = await admin();
    const finance = await exec("Fin Person", undefined, "finance");
    await expect(setCrmStaffAvailable(finance, false, actor)).rejects.toBeInstanceOf(NotFoundError);
    const e = await exec("Crm Exec", "+971500000041");
    await setCrmStaffAvailable(e, false, actor);
    expect((await StaffProfile.findById(e).lean())!.available).toBe(false);
  });
});
