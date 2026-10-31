import { Lead, LeadActivity, Project, StaffProfile, Types } from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { freezeClock, setClock } from "@edge/domain/clock";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  captureFreeClassLead,
  captureGrowthHubLead,
  captureSupportLead,
  createLead,
  createStaff,
  getDefaultProject,
  getPublicFreeClass,
  listCrmUsers,
  listStaff,
  normalizeTelegram,
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

describe("staff Telegram", () => {
  it("normalises the username, needs one for the Telegram channel and keeps both when a form omits them", async () => {
    expect(normalizeTelegram("@Edge_Sara")).toBe("Edge_Sara");
    expect(normalizeTelegram("https://t.me/edge_sara/")).toBe("edge_sara");
    expect(normalizeTelegram("  ")).toBeNull();
    expect(() => normalizeTelegram("ab")).toThrow(ValidationError);
    expect(() => normalizeTelegram("9lives_x")).toThrow(ValidationError);

    await expect(
      createStaff(
        {
          name: "No Handle",
          email: `nh-${Date.now()}@edge.test`,
          roleKeys: ["sales_executive"],
          contactChannel: "TELEGRAM",
          password: "StaffPass!2026",
        },
        { type: "SYSTEM" },
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const { id } = await createStaff(
      {
        name: "Tele Gram",
        email: `tg-${Date.now()}@edge.test`,
        roleKeys: ["sales_executive"],
        telegramUsername: "@tele_gram",
        contactChannel: "TELEGRAM",
        password: "StaffPass!2026",
      },
      { type: "SYSTEM" },
    );
    expect((await listStaff()).find((s) => s.id === id)).toMatchObject({ telegramUsername: "tele_gram", contactChannel: "TELEGRAM" });
    const actor = { type: "USER" as const, id: await exec("Admin", undefined, "super_admin") };
    await updateStaff(id, { name: "Tele Gram", roleKeys: ["sales_executive"] }, actor); // console form: no Telegram fields
    expect((await StaffProfile.findById(id).lean())!).toMatchObject({ telegramUsername: "tele_gram", contactChannel: "TELEGRAM" });
    await expect(updateStaff(id, { name: "Tele Gram", roleKeys: ["sales_executive"], telegramUsername: "" }, actor)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await updateStaff(id, { name: "Tele Gram", roleKeys: ["sales_executive"], telegramUsername: "", contactChannel: "WHATSAPP" }, actor);
    expect((await StaffProfile.findById(id).lean())!).toMatchObject({ telegramUsername: null, contactChannel: "WHATSAPP" });
  });
});

describe("free class landing", () => {
  it("gives leads in General to the sales executives with a phone in turn, whatever they hold and whatever the round-robin setting", async () => {
    const busy = await exec("Busy Bee", "+971500000001");
    const free = await exec("Free Fatima", "+971500000002");
    await exec("Nophone Nadia"); // no phone: never picked
    const g = await getDefaultProject();
    await createLead(
      { projectId: String(g._id), name: "Existing", phone: "+971509990000", source: "WEBSITE", ownerId: busy },
      { type: "SYSTEM" },
    );

    // First in line, and holding a lead already doesn't lose them the turn.
    const r = await captureFreeClassLead({ name: "Ali Hassan", phone: "+971551112233", utm: { source: "meta", campaign: "free-class" } });
    expect(await ownerOf("+971551112233")).toBe(busy);
    expect(r.contactName).toBe("Busy Bee");
    expect(r.contactUrl).toMatch(/^https:\/\/wa\.me\/971500000001\?text=/);
    expect(textOf(r.contactUrl!)).toBe("Hi Busy, I'm Ali Hassan. I need help with something. Can you assist me, please?");

    const lead = (await Lead.findOne({ phone: "+971551112233" }).lean())!;
    expect(String(lead.projectId)).toBe(String(g._id));
    expect(lead.source).toBe("WEBSITE");
    expect(lead.sourceDetail).toBe("Free live class landing page");
    expect(lead.tags).toContain("free-live-class");
    expect(lead.utm?.campaign).toBe("free-class");
    expect(lead.consent?.whatsapp).toBe(true);
    expect(await LeadActivity.countDocuments({ leadId: lead._id, type: "SYSTEM", "data.landing": "free-class" })).toBe(1);

    // The turns go on, past the person with no phone and back round.
    await captureFreeClassLead({ name: "Second", phone: "+971551112244" });
    expect(await ownerOf("+971551112244")).toBe(free);
    await captureFreeClassLead({ name: "Third", phone: "+971551112255" });
    expect(await ownerOf("+971551112255")).toBe(busy);
  });

  it("keeps an existing owner, assigns an unowned duplicate, and asks for help whatever class is switched on", async () => {
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
    expect(textOf(r.contactUrl!)).toBe("Hi Amal, I'm Old Lead. I need help with something. Can you assist me, please?");

    const b = await exec("Aaron", "+971500000012"); // fewer leads now, but the lead keeps its owner
    const again = await captureFreeClassLead({ name: "Old Lead", phone: "+971552223344" });
    expect(await ownerOf("+971552223344")).toBe(a);
    expect(again.contactName).toBe("Amal");
    expect(b).toBeTruthy();
  });

  it("falls back to the academy support WhatsApp, or to no link, when no sales executive has a phone", async () => {
    await exec("Silent Sam");
    const none = await captureFreeClassLead({ name: "Nobody Home", phone: "+971553334455" });
    expect(none).toEqual({ contactUrl: null, channel: null, contactName: null });
    expect(await ownerOf("+971553334455")).toBeNull();

    await setSetting("academy.profile", {
      name: "Edge Trading Academy",
      supportEmail: "support@edgeacademy.ae",
      supportWhatsapp: "050 765 4321",
      website: "https://edgeacademy.ae",
    });
    const support = await captureFreeClassLead({ name: "Later Lead", phone: "+971553334466" });
    expect(support.contactName).toBe("Edge Trading Academy");
    expect(support.contactUrl).toMatch(/^https:\/\/wa\.me\/971507654321\?/);
    expect(textOf(support.contactUrl!)).toMatch(/^Hi Edge Trading Academy, I'm Later Lead\./);
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
      page: "https://growthhub.edgeverse.ae/",
      utm: { source: "ig", medium: "social" },
    });
    expect(r.contactName).toBe("Hana Hub");
    expect(r.contactUrl).toMatch(/^https:\/\/wa\.me\/971500000051\?text=/);
    expect(textOf(r.contactUrl!)).toBe(
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
    expect(byCall.contactUrl).toMatch(/^https:\/\/wa\.me\/971500000061\?/);
    expect(await Lead.countDocuments({ phone: { $in: ["+971551110010", "+971551110099"] } })).toBe(1);
    expect(await ownerOf("+971551110010")).toBe(owner);
    const inbound = await LeadActivity.find({ leadId: new Types.ObjectId(known), type: "INBOUND" })
      .sort({ createdAt: 1 })
      .lean();
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
    expect(support.contactUrl).toMatch(/^https:\/\/wa\.me\/971507654321\?/);
    expect(await ownerOf("+971551110020")).toBe(away);

    const on = await exec("On Duty", "+971500000072");
    const r = await captureGrowthHubLead({ name: "Back Again", whatsapp: "+971551110020" });
    expect(r.contactName).toBe("On Duty");
    expect(await ownerOf("+971551110020")).toBe(on);
  });

  it("rejects an invalid WhatsApp number", async () => {
    await expect(captureGrowthHubLead({ name: "Bad Number", whatsapp: "12345" })).rejects.toMatchObject({ status: 422 });
  });

  it("puts new leads in the Free Course support project, round-robined among its team; known leads stay where they are", async () => {
    const team = await exec("Team Tara", "+971500000081");
    const outsider = await exec("Aaron Outside", "+971500000082"); // in General only: never picked for this project
    const noPhone = await exec("Team Nophone");
    const fcs = await Project.create({
      name: "Free Course support",
      code: "FREE-COURSE-SUPPORT",
      memberIds: [team, noPhone].map((id) => new Types.ObjectId(id)),
    });

    const r = await captureGrowthHubLead({ name: "New Viewer", whatsapp: "+971551110030" });
    const lead = (await Lead.findOne({ phone: "+971551110030" }).lean())!;
    expect(String(lead.projectId)).toBe(String(fcs._id));
    expect(String(lead.ownerId)).toBe(team);
    expect(r.contactName).toBe("Team Tara");

    // Already a lead in General with its owner: same project, same owner.
    const g = await getDefaultProject();
    await createLead(
      { projectId: String(g._id), name: "Known", phone: "+971551110031", source: "WEBSITE", ownerId: outsider },
      { type: "SYSTEM" },
    );
    const known = await captureGrowthHubLead({ name: "Known", whatsapp: "+971551110031" });
    expect(known.contactName).toBe("Aaron Outside");
    expect(String((await Lead.findOne({ phone: "+971551110031" }).lean())!.projectId)).toBe(String(g._id));
  });

  it("sends visitors to an exec's Telegram when that is their channel, for new and known leads", async () => {
    const tg = async (name: string, username: string) =>
      (
        await createStaff(
          {
            name,
            email: `tg-${username}-${Date.now()}@edge.test`,
            roleKeys: ["sales_executive"],
            phone: "+971500000099", // has WhatsApp too, but chats on Telegram
            telegramUsername: username,
            contactChannel: "TELEGRAM",
            password: "StaffPass!2026",
          },
          { type: "SYSTEM" },
        )
      ).id;
    const tara = await tg("Tara Tele", "tara_edge");
    const r = await captureGrowthHubLead({ name: "Tele Visitor", whatsapp: "+971551110050" });
    expect(r).toMatchObject({ channel: "TELEGRAM", contactName: "Tara Tele" });
    expect(r.contactUrl).toMatch(/^https:\/\/t\.me\/tara_edge\?text=/);
    expect(textOf(r.contactUrl!)).toMatch(/^Hi Tara, I'm Tele Visitor\. I watched the free trading classes/);
    const lead = (await Lead.findOne({ phone: "+971551110050" }).lean())!;
    expect(String(lead.ownerId)).toBe(tara);
    expect(
      await LeadActivity.countDocuments({ leadId: lead._id, type: "SYSTEM", "data.channel": "TELEGRAM", "data.telegram": "tara_edge" }),
    ).toBe(1);

    // The owner moves to WhatsApp: the same visitor now goes to their WhatsApp.
    const actor = { type: "USER" as const, id: await exec("Admin", undefined, "super_admin") };
    await updateStaff(tara, { name: "Tara Tele", roleKeys: ["sales_executive"], contactChannel: "WHATSAPP" }, actor);
    const again = await captureFreeClassLead({ name: "Tele Visitor", phone: "+971551110050" });
    expect(again.channel).toBe("WHATSAPP");
    expect(again.contactUrl).toMatch(/^https:\/\/wa\.me\/971500000099\?/);
  });

  it("logs an Inner Circle request with the JetaFX client id and sends the visitor to ask to be added", async () => {
    const team = await exec("Ira Inner", "+971500000101");
    const fcs = await Project.create({ name: "Free Course support", code: "FREE-COURSE-SUPPORT", memberIds: [new Types.ObjectId(team)] });
    const r = await captureGrowthHubLead({
      intent: "inner-circle",
      name: "Jamal Trader",
      whatsapp: "+971551110060",
      email: "Jamal@Example.com",
      jetaFxClientId: "JX-77881",
    });
    expect(textOf(r.contactUrl!)).toBe(
      "Hi Ira, I'm Jamal Trader. I have created my JetaFX account (Client ID: JX-77881). Please add me to the Inner Circle.",
    );
    const lead = (await Lead.findOne({ phone: "+971551110060" }).lean())!;
    expect(String(lead.projectId)).toBe(String(fcs._id));
    expect(lead).toMatchObject({ email: "jamal@example.com", jetaFxClientId: "JX-77881", sourceDetail: "Forex Growth Hub · Inner Circle" });
    expect(lead.tags).toEqual(expect.arrayContaining(["growth-hub", "inner-circle"]));
    expect(lead.notes).toContain("Inner Circle request");
    expect(await LeadActivity.countDocuments({ leadId: lead._id, type: "SYSTEM", "data.landing": "growth-hub-inner-circle" })).toBe(1);
  });

  it("uses support WhatsApp when nobody on the project team can take it, and General when the project is not active", async () => {
    await exec("General Gina", "+971500000091");
    const fcs = await Project.create({ name: "Free Course support", code: "FREE-COURSE-SUPPORT", memberIds: [] });
    const none = await captureGrowthHubLead({ name: "Empty Team", whatsapp: "+971551110040" });
    expect(none).toEqual({ contactUrl: null, channel: null, contactName: null });
    const lead = (await Lead.findOne({ phone: "+971551110040" }).lean())!;
    expect(String(lead.projectId)).toBe(String(fcs._id));
    expect(lead.ownerId).toBeNull();

    await Project.updateOne({ _id: fcs._id }, { $set: { status: "PAUSED" } });
    const r = await captureGrowthHubLead({ name: "Paused Project", whatsapp: "+971551110041" });
    expect(r.contactName).toBe("General Gina");
    expect(String((await Lead.findOne({ phone: "+971551110041" }).lean())!.projectId)).toBe(String((await getDefaultProject())._id));
  });
});

describe("contact page", () => {
  it("puts new leads in the Free Course support project, round-robined among its team, with the topic and note", async () => {
    await exec("General Gina", "+971500000111"); // in General only: never picked for this project
    const team = await exec("Sana Support", "+971500000112");
    const sup = await Project.create({ name: "Free Course support", code: "FREE-COURSE-SUPPORT", memberIds: [new Types.ObjectId(team)] });

    const r = await captureSupportLead({
      name: "Broker Bilal",
      phone: "+971551110070",
      topic: "BROKER_ACCOUNT",
      message: "I'm in Sharjah, can we do it today?",
      utm: { source: "instagram" },
    });
    expect(r.contactName).toBe("Sana Support");
    expect(textOf(r.contactUrl!)).toBe(
      "Hi Sana, I'm Broker Bilal. I'd like to open a JetaFX broker account. Can you help me with it, please?\n\nI'm in Sharjah, can we do it today?",
    );
    const lead = (await Lead.findOne({ phone: "+971551110070" }).lean())!;
    expect(String(lead.projectId)).toBe(String(sup._id));
    expect(String(lead.ownerId)).toBe(team);
    expect(lead).toMatchObject({ source: "WEBSITE", sourceDetail: "Contact page · Broker account opening" });
    expect(lead.tags).toEqual(expect.arrayContaining(["support", "support-broker-account"]));
    expect(lead.notes).toBe("Contact page: Broker account opening\nI'm in Sharjah, can we do it today?");
    expect(lead.utm?.source).toBe("instagram");
    expect(await LeadActivity.countDocuments({ leadId: lead._id, type: "SYSTEM", "data.landing": "support" })).toBe(1);

    // Inner Circle: the JetaFX client ID goes on the lead and in the message.
    const ic = await captureSupportLead({
      name: "Inner Iqbal",
      phone: "+971551110071",
      topic: "INNER_CIRCLE",
      jetaFxClientId: " JX-5510 ",
    });
    expect(textOf(ic.contactUrl!)).toBe(
      "Hi Sana, I'm Inner Iqbal. I'd like to get Inner Circle access (JetaFX Client ID: JX-5510). Can you help me, please?",
    );
    expect((await Lead.findOne({ phone: "+971551110071" }).lean())!.jetaFxClientId).toBe("JX-5510");
  });

  it("keeps a known lead where it is, logs the enquiry on its timeline, and uses support WhatsApp when the team is empty", async () => {
    const fcs = await Project.create({ name: "Free Course support", code: "FREE-COURSE-SUPPORT", memberIds: [] });
    await setSetting("academy.profile", {
      name: "Edge Trading Academy",
      supportEmail: "support@edgeacademy.ae",
      supportWhatsapp: "050 765 4321",
      website: "https://edgeacademy.ae",
    });
    const owner = await exec("Gina General", "+971500000121");
    const g = await getDefaultProject();
    await createLead(
      { projectId: String(g._id), name: "Known Kareem", phone: "+971551110080", source: "WEBSITE", ownerId: owner },
      { type: "SYSTEM" },
    );
    const known = await captureSupportLead({ name: "Known Kareem", phone: "+971551110080", topic: "COURSE" });
    expect(known.contactName).toBe("Gina General");
    const lead = (await Lead.findOne({ phone: "+971551110080" }).lean())!;
    expect(String(lead.projectId)).toBe(String(g._id));
    expect(await LeadActivity.countDocuments({ leadId: lead._id, type: "INBOUND", body: "Contact page: Course joining" })).toBe(1);

    // Nobody on the project team: the lead waits there unassigned and the visitor goes to the academy's WhatsApp.
    const r = await captureSupportLead({ name: "New Nadia", phone: "+971551110081", topic: "SUPPORT" });
    expect(r).toMatchObject({ contactName: "Edge Trading Academy", channel: "WHATSAPP" });
    expect(r.contactUrl).toMatch(/^https:\/\/wa\.me\/971507654321\?/);
    expect(textOf(r.contactUrl!)).toBe("Hi Edge Trading Academy, I'm New Nadia. I need help with something. Can you assist me, please?");
    const nadia = (await Lead.findOne({ phone: "+971551110081" }).lean())!;
    expect(String(nadia.projectId)).toBe(String(fcs._id));
    expect(nadia.ownerId).toBeNull();
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
    expect(await captureFreeClassLead({ name: "Returning", phone: "+971554440010" })).toEqual({
      contactUrl: null,
      channel: null,
      contactName: null,
    });
    expect(await ownerOf("+971554440010")).toBe(first);

    const second = await exec("Sana Second", "+971500000032");
    const r = await captureFreeClassLead({ name: "Returning", phone: "+971554440010" });
    expect(await ownerOf("+971554440010")).toBe(second);
    expect(r.contactUrl).toMatch(/^https:\/\/wa\.me\/971500000032\?/);
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
