import {
  AuditLog,
  AuthUser,
  CrmProduct,
  InAppNotification,
  Lead,
  LeadActivity,
  LeadConversion,
  LeadDeposit,
  seedBaseData,
  Setting,
  StudentProfile,
  Types,
} from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { freezeClock, setClock } from "@edge/domain/clock";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  BusinessError,
  convertLeadToStudent,
  createLead,
  createProduct,
  createStaff,
  deleteDeposit,
  deleteLead,
  ensureDefaultProducts,
  getCommissionSettings,
  getCrmDashboard,
  getDefaultProject,
  getLeadDetail,
  getLeaderboard,
  getStaffCommission,
  handleLeadWebhook,
  importLeads,
  linkLeadForStudent,
  listDeposits,
  listLeads,
  listProducts,
  loadCrmScope,
  loadViewer,
  logDeposit,
  markConversions,
  mergeLeads,
  NotFoundError,
  rejectDeposit,
  rerateLaterCommission,
  removeConversion,
  resetEnvForTests,
  saveCommissionSettings,
  setStage,
  signLeadPayload,
  TransitionError,
  updateLead,
  updateProduct,
  ValidationError,
  verifyDeposit,
  type CrmScope,
} from "../src";
import { createStudent, producer } from "./helpers";

const SECRET = "test-lead-webhook-secret-0123";
process.env.LEAD_WEBHOOK_SECRET = SECRET;
resetEnvForTests();

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  await ensureDefaultProducts();
  producer.take();
  freezeClock("2026-10-06T06:00:00Z"); // 10:00 Dubai
});
afterEach(() => setClock(null));

type RoleKey = "crm_admin" | "crm_manager" | "project_manager" | "sales_executive";
let n = 0;
async function staff(role: RoleKey) {
  n += 1;
  const { id } = await createStaff(
    { name: `${role} ${n}`, email: `${role}-${n}-${Date.now()}@edge.test`, roleKeys: [role], password: "StaffPass!2026" },
    { type: "SYSTEM" },
  );
  const viewer = (await loadViewer(id))!;
  const actor = { type: "USER" as const, id };
  const scope = (): Promise<CrmScope> => loadCrmScope(viewer);
  return { id, actor, viewer, scope };
}
const general = async () => String((await getDefaultProject())._id);
const product = async (code: string) => String((await CrmProduct.findOne({ code }).lean())!._id);
let phoneSeq = 0;
const phone = () => `+9715012${String(++phoneSeq).padStart(5, "0")}`;

describe("lead fields", () => {
  it("stores language as a dropdown value, mapping free text from the website, CSV and old data", async () => {
    const exec = await staff("sales_executive");
    const g = await general();
    const id = await createLead(
      { projectId: g, name: "Mal Lead", phone: phone(), source: "INSTAGRAM", language: "MALAYALAM" },
      exec.actor,
      await exec.scope(),
    );
    expect((await getLeadDetail(id, await exec.scope())).lead.language).toBe("MALAYALAM");

    const body = JSON.stringify({ id: "evt-lang", name: "Web Lead", phone: phone(), language: "english" });
    const r = await handleLeadWebhook("website", body, new Headers({ "x-edge-signature": signLeadPayload(SECRET, body) }), null);
    expect((await Lead.findById(String(r.body.leadId)).lean())!.language).toBe("ENGLISH");

    const admin = await staff("crm_admin");
    await importLeads(
      `Name,Mobile,Language,JetaFX ID\nCsv Lead,${phone()},Arabic,JX-77`,
      { projectId: g, source: "IMPORT" },
      admin.actor,
      await admin.scope(),
    );
    const csvLead = (await Lead.findOne({ name: "Csv Lead" }).lean())!;
    expect(csvLead.language).toBe("OTHER");
    expect(csvLead.jetaFxClientId).toBe("JX-77");

    // Leads saved before the dropdown keep working: migrate maps their free text.
    await Lead.collection.updateOne({ _id: csvLead._id }, { $set: { language: "Tamil " } });
    await Lead.collection.updateOne({ _id: new Types.ObjectId(String(r.body.leadId)) }, { $set: { language: "Urdu" } });
    await seedBaseData();
    expect((await Lead.findById(csvLead._id).lean())!.language).toBe("TAMIL");
    expect((await Lead.findById(String(r.body.leadId)).lean())!.language).toBe("OTHER");
  });

  it("keeps the JetaFX client ID (searchable, copied to the student) and the qualification answers", async () => {
    const exec = await staff("sales_executive");
    const g = await general();
    const scope = await exec.scope();
    const id = await createLead(
      {
        projectId: g,
        name: "Jet Lead",
        phone: phone(),
        email: "jet@example.com",
        source: "INSTAGRAM",
        jetaFxClientId: " JX-1001 ",
        qualification: { experience: "1 year demo, $2k capital" },
      },
      exec.actor,
      scope,
    );
    expect((await listLeads({ q: "jx-1001" }, scope)).rows.map((l) => l.id)).toEqual([id]);
    await updateLead(id, { qualification: { occupation: "Salaried, AED 9k, car loan", purpose: "Second income" } }, exec.actor, scope);
    const d = await getLeadDetail(id, scope);
    expect(d.lead.jetaFxClientId).toBe("JX-1001");
    expect(d.lead.qualification).toEqual({
      experience: "1 year demo, $2k capital",
      occupation: "Salaried, AED 9k, car loan",
      purpose: "Second income",
    });
    await updateLead(id, { qualification: { experience: "" } }, exec.actor, scope);
    expect((await getLeadDetail(id, scope)).lead.qualification.experience).toBeNull();

    const r = await convertLeadToStudent(id, { sendSetPassword: false, actor: exec.actor, scope });
    expect((await StudentProfile.findById(r.studentId).lean())!.jetaFxClientId).toBe("JX-1001");
  });
});

describe("products and conversions", () => {
  it("seeds the default products once, with Premium course as the student course", async () => {
    const admin = await staff("crm_admin");
    await ensureDefaultProducts();
    const list = await listProducts(await admin.scope());
    expect(list.map((p) => p.name)).toEqual(["Inner Circle", "Premium course", "Wealth Circle", "F1 Club"]);
    expect(list.filter((p) => p.isStudentCourse).map((p) => p.name)).toEqual(["Premium course"]);
    const exec = await staff("sales_executive");
    await expect(listProducts(await exec.scope())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("marks one or more conversions, credits the owner, keeps the first conversion date and reopens on removal", async () => {
    const exec = await staff("sales_executive");
    const mgr = await staff("crm_manager");
    const g = await general();
    const id = await createLead({ projectId: g, name: "Conv Lead", phone: phone(), source: "INSTAGRAM" }, exec.actor, await exec.scope());
    await setStage(id, { stage: "NEGOTIATION" }, exec.actor, await exec.scope());
    const inner = await product("INNER-CIRCLE");
    const wealth = await product("WEALTH-CIRCLE");

    // A manager marks it: the conversion still counts for the owner, who is told.
    await markConversions(id, { productIds: [inner] }, mgr.actor, await mgr.scope());
    let lead = (await Lead.findById(id).lean())!;
    expect(lead.stage).toBe("CONVERTED");
    expect(lead.productIds.map(String)).toEqual([inner]);
    const first = lead.convertedAt!;
    const c1 = (await LeadConversion.findOne({ leadId: id }).lean())!;
    expect(String(c1.creditedToId)).toBe(exec.id);
    expect(c1.stageBefore).toBe("NEGOTIATION");
    expect(await InAppNotification.countDocuments({ userId: exec.id, title: "Conv Lead converted" })).toBe(1);

    freezeClock("2026-10-10T06:00:00Z");
    await expect(markConversions(id, { productIds: [inner] }, exec.actor, await exec.scope())).rejects.toBeInstanceOf(BusinessError);
    await markConversions(id, { productIds: [wealth, inner] }, exec.actor, await exec.scope());
    lead = (await Lead.findById(id).lean())!;
    expect(lead.convertedAt).toEqual(first);
    expect(lead.productIds).toHaveLength(2);
    expect(await LeadActivity.countDocuments({ leadId: id, type: "PRODUCT_CONVERTED" })).toBe(2);

    const detail = await getLeadDetail(id, await exec.scope());
    expect(detail.conversions.map((c) => c.product.name)).toEqual(["Inner Circle", "Wealth Circle"]);
    expect(detail.can.removeConversion).toBe(false);
    expect((await listLeads({ product: inner }, await exec.scope())).total).toBe(1); // converted, still listed under the product filter

    // Only crm.manage removes; the last removal reopens the lead at its old stage.
    const conversions = await LeadConversion.find({ leadId: id }).sort({ convertedAt: 1 }).lean();
    await expect(removeConversion(String(conversions[0]!._id), exec.actor, await exec.scope())).rejects.toBeInstanceOf(NotFoundError);
    await removeConversion(String(conversions[0]!._id), mgr.actor, await mgr.scope());
    expect((await Lead.findById(id).lean())!.stage).toBe("CONVERTED");
    await removeConversion(String(conversions[1]!._id), mgr.actor, await mgr.scope());
    lead = (await Lead.findById(id).lean())!;
    expect(lead.stage).toBe("NEGOTIATION");
    expect(lead.convertedAt).toBeNull();
    expect(lead.productIds).toEqual([]);
  });

  it("refuses archived products", async () => {
    const exec = await staff("sales_executive");
    const admin = await staff("crm_admin");
    const club = await createProduct({ name: "Gold Club" }, admin.actor, await admin.scope());
    await updateProduct(club, { status: "ARCHIVED" }, admin.actor, await admin.scope());
    const id = await createLead(
      { projectId: await general(), name: "Arch", phone: phone(), source: "INSTAGRAM" },
      exec.actor,
      await exec.scope(),
    );
    await expect(markConversions(id, { productIds: [club] }, exec.actor, await exec.scope())).rejects.toBeInstanceOf(ValidationError);
    expect((await getLeadDetail(id, await exec.scope())).options.products.map((p) => p.name)).not.toContain("Gold Club");
  });

  it("records the student course whenever a lead becomes a student, also after an earlier product conversion", async () => {
    const exec = await staff("sales_executive");
    const g = await general();
    const premium = await product("PREMIUM-COURSE");
    const id = await createLead(
      { projectId: g, name: "Student Lead", phone: phone(), email: "stud1@example.com", source: "WEBSITE" },
      exec.actor,
      await exec.scope(),
    );
    await markConversions(id, { productIds: [await product("INNER-CIRCLE")] }, exec.actor, await exec.scope());
    const convertedAt = (await Lead.findById(id).lean())!.convertedAt;

    freezeClock("2026-10-12T06:00:00Z");
    await convertLeadToStudent(id, { sendSetPassword: false, actor: exec.actor, scope: await exec.scope() });
    const lead = (await Lead.findById(id).lean())!;
    expect(lead.studentId).not.toBeNull();
    expect(lead.convertedAt).toEqual(convertedAt);
    expect(lead.productIds.map(String)).toContain(premium);
    expect((await LeadConversion.findOne({ leadId: id, productId: premium }).lean())!.source).toBe("STUDENT");

    // Signing up on the portal (auto-link) also counts, credited to the owner.
    const other = await createLead(
      { projectId: g, name: "Auto", phone: "+971501112299", source: "INSTAGRAM" },
      exec.actor,
      await exec.scope(),
    );
    const sid = await createStudent();
    await AuthUser.updateOne({ _id: sid }, { $set: { phoneNumber: "+971501112299" } });
    expect((await linkLeadForStudent(sid, { reason: "signup" })).linked).toBe(true);
    const c = (await LeadConversion.findOne({ leadId: other, productId: premium }).lean())!;
    expect(String(c.creditedToId)).toBe(exec.id);
  });

  it("backfills existing students when a product becomes the student course", async () => {
    const admin = await staff("crm_admin");
    const g = await general();
    await CrmProduct.updateMany({}, { $set: { isStudentCourse: false } });
    const id = await createLead(
      { projectId: g, name: "Old Student", phone: phone(), email: "old@example.com", source: "WEBSITE" },
      admin.actor,
      await admin.scope(),
    );
    await convertLeadToStudent(id, { sendSetPassword: false, actor: admin.actor, scope: await admin.scope() });
    expect(await LeadConversion.countDocuments({ leadId: id })).toBe(0);
    const course = await createProduct({ name: "Pro Course", isStudentCourse: true }, admin.actor, await admin.scope());
    expect((await LeadConversion.findOne({ leadId: id }).lean())!.productId.toString()).toBe(course);
    expect(await CrmProduct.countDocuments({ isStudentCourse: true })).toBe(1);
  });

  it("moves conversions and deposits to the survivor of a merge", async () => {
    const admin = await staff("crm_admin");
    const scope = await admin.scope();
    const g = await general();
    const a = await createLead({ projectId: g, name: "Keep", phone: phone(), source: "INSTAGRAM" }, admin.actor, scope);
    const b = await createLead(
      { projectId: g, name: "Dup", email: "dup2@example.com", source: "WEBSITE", jetaFxClientId: "JX-9" },
      admin.actor,
      scope,
    );
    await markConversions(b, { productIds: [await product("F1-CLUB")] }, admin.actor, scope);
    await logDeposit(b, { sequence: "FIRST", amount: "250", depositedAt: "2026-10-05" }, admin.actor, scope);
    await mergeLeads(a, b, admin.actor, scope);
    const keep = (await Lead.findById(a).lean())!;
    expect(keep.stage).toBe("CONVERTED");
    expect(keep.jetaFxClientId).toBe("JX-9");
    expect(keep.productIds).toHaveLength(1);
    expect(await LeadConversion.countDocuments({ leadId: a })).toBe(1);
    expect(await LeadDeposit.countDocuments({ leadId: a })).toBe(1);
  });
});

describe("lead search", () => {
  it("finds a lead whatever its stage, by words in any order, its mobile however typed and numbers or text in its notes", async () => {
    const exec = await staff("sales_executive");
    const g = await general();
    const scope = await exec.scope();
    const id = await createLead(
      {
        projectId: g,
        name: "Ali Hassan",
        phone: "+971501234567",
        email: "ali.h@example.com",
        source: "WEBSITE",
        jetaFxClientId: "88123456",
        notes: "Wants a broker account.\nPhone (calls): +971559876543",
      },
      exec.actor,
      scope,
    );
    await createLead({ projectId: g, name: "Hassan Omar", phone: phone(), source: "INSTAGRAM" }, exec.actor, scope);
    await markConversions(id, { productIds: [await product("INNER-CIRCLE")] }, exec.actor, scope);
    const find = async (q: string) => (await listLeads({ q }, scope)).rows.map((l) => l.name).sort();

    expect(await find("88123456")).toEqual(["Ali Hassan"]); // converted, and still found from the default view
    expect(await find("hassan ali")).toEqual(["Ali Hassan"]);
    expect(await find("hassan")).toEqual(["Ali Hassan", "Hassan Omar"]);
    expect(await find("050 123 4567")).toEqual(["Ali Hassan"]);
    expect(await find("+971 50 123 4567")).toEqual(["Ali Hassan"]);
    expect(await find("0559876543")).toEqual(["Ali Hassan"]); // the second number, kept in the notes
    expect(await find("broker account")).toEqual(["Ali Hassan"]);
    expect(await find("ali omar")).toEqual([]);
    // Without a search the default view still lists open leads only.
    expect((await listLeads({}, scope)).rows.map((l) => l.name)).toEqual(["Hassan Omar"]);
  });
});

describe("deposits and commission", () => {
  async function setup() {
    const exec = await staff("sales_executive");
    const other = await staff("sales_executive");
    const admin = await staff("crm_admin");
    const mgr = await staff("crm_manager");
    await saveCommissionSettings(
      {
        firstPct: 10,
        slabs: [
          { from: 0, pct: 1 },
          { from: 25000, pct: 2.5 },
          { from: 10000, pct: 2 },
        ],
      },
      admin.actor,
    );
    const id = await createLead(
      { projectId: await general(), name: "Depositor", phone: phone(), source: "INSTAGRAM" },
      exec.actor,
      await exec.scope(),
    );
    return { exec, other, admin, mgr, id };
  }

  it("logs deposits as pending, asks for the JetaFX ID once and refuses a second 1st deposit", async () => {
    const { exec, admin, id } = await setup();
    const scope = await exec.scope();
    await expect(
      logDeposit(id, { sequence: "FIRST", amount: "1000", depositedAt: "2026-10-05" }, exec.actor, scope),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      logDeposit(id, { sequence: "FIRST", amount: "1000", depositedAt: "2026-10-07", jetaFxClientId: "JX-1" }, exec.actor, scope),
    ).rejects.toMatchObject({ fieldErrors: { depositedAt: expect.stringMatching(/future/) } });
    const dep = await logDeposit(
      id,
      { sequence: "FIRST", amount: "1,000.50", depositedAt: "2026-10-05", jetaFxClientId: "JX-1" },
      exec.actor,
      scope,
    );
    const d = (await LeadDeposit.findById(dep).lean())!;
    expect(d).toMatchObject({ status: "PENDING", amountMinor: 100050, currency: "USD", jetaFxClientId: "JX-1", commissionMinor: null });
    expect(String(d.creditedToId)).toBe(exec.id);
    expect((await Lead.findById(id).lean())!.jetaFxClientId).toBe("JX-1");
    expect(await LeadActivity.countDocuments({ leadId: id, type: "DEPOSIT_LOGGED" })).toBe(1);
    expect(await InAppNotification.countDocuments({ userId: admin.id, title: "Deposit to verify" })).toBe(1);
    await expect(logDeposit(id, { sequence: "FIRST", amount: "50", depositedAt: "2026-10-05" }, exec.actor, scope)).rejects.toBeInstanceOf(
      BusinessError,
    );
    await logDeposit(id, { sequence: "LATER", amount: "50", depositedAt: "2026-10-05" }, exec.actor, scope);
    await logDeposit(id, { sequence: "LATER", amount: "60", depositedAt: "2026-10-06" }, exec.actor, scope);
    expect(await LeadDeposit.countDocuments({ leadId: id })).toBe(3);
  });

  it("only commission managers verify; the rate is fixed at verification and commission stays private", async () => {
    const { exec, other, admin, mgr, id } = await setup();
    const dep = await logDeposit(
      id,
      { sequence: "FIRST", amount: "1000", depositedAt: "2026-10-05", jetaFxClientId: "JX-2" },
      exec.actor,
      await exec.scope(),
    );
    await expect(verifyDeposit(dep, exec.actor, await exec.scope())).rejects.toBeInstanceOf(NotFoundError);
    await expect(verifyDeposit(dep, mgr.actor, await mgr.scope())).rejects.toBeInstanceOf(NotFoundError);
    await verifyDeposit(dep, admin.actor, await admin.scope());
    await expect(verifyDeposit(dep, admin.actor, await admin.scope())).rejects.toBeInstanceOf(TransitionError);
    const d = (await LeadDeposit.findById(dep).lean())!;
    expect(d).toMatchObject({ status: "VERIFIED", commissionPct: "0.100000", commissionMinor: 10000 });
    expect(await InAppNotification.countDocuments({ userId: exec.id, title: "Deposit verified" })).toBe(1);

    // A later rate change leaves verified deposits alone.
    await saveCommissionSettings(
      {
        firstPct: 20,
        slabs: [
          { from: 0, pct: 1 },
          { from: 25000, pct: 2.5 },
          { from: 10000, pct: 2 },
        ],
      },
      admin.actor,
    );
    expect(await getCommissionSettings()).toEqual({
      firstPct: 20,
      slabs: [
        { from: 0, pct: 1 },
        { from: 10000, pct: 2 },
        { from: 25000, pct: 2.5 },
      ],
    });
    expect((await LeadDeposit.findById(dep).lean())!.commissionMinor).toBe(10000);
    // Later deposits earn the slab their month's total reaches ($30,400 here), each on its whole amount.
    const big = await logDeposit(id, { sequence: "LATER", amount: "30000", depositedAt: "2026-10-06" }, exec.actor, await exec.scope());
    const small = await logDeposit(id, { sequence: "LATER", amount: "400", depositedAt: "2026-10-06" }, exec.actor, await exec.scope());
    await verifyDeposit(big, admin.actor, await admin.scope());
    await verifyDeposit(small, admin.actor, await admin.scope());
    expect((await LeadDeposit.findById(big).lean())!).toMatchObject({ commissionPct: "0.025000", commissionMinor: 75000 });
    expect((await LeadDeposit.findById(small).lean())!).toMatchObject({ commissionPct: "0.025000", commissionMinor: 1000 });

    // The executive sees their own commission, a manager who can see the lead does not.
    expect((await getLeadDetail(id, await exec.scope())).deposits.every((x) => x.commissionMinor != null)).toBe(true);
    expect((await getLeadDetail(id, await mgr.scope())).deposits.every((x) => x.commissionMinor == null)).toBe(true);
    const mine = await listDeposits({}, await exec.scope());
    expect(mine.summary).toMatchObject({ verifiedCount: 3, verifiedMinor: 3140000, commissionMinor: 86000 });
    expect((await listDeposits({}, await other.scope())).total).toBe(0);
    expect((await listDeposits({ staff: exec.id }, await admin.scope())).total).toBe(3);

    const c = await getStaffCommission(exec.id, await admin.scope());
    expect(c.commission).toEqual({ month: 86000, lastMonth: 0, all: 86000 });
    expect(c.deposits).toEqual({ month: 3140000, all: 3140000 });
    await expect(getStaffCommission(exec.id, await mgr.scope())).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rates later deposits by the person's monthly total across their leads, first deposits excluded", async () => {
    const { exec, other, admin, id } = await setup();
    const as = await admin.scope();
    const second = await createLead(
      { projectId: await general(), name: "Second depositor", phone: phone(), source: "INSTAGRAM" },
      exec.actor,
      await exec.scope(),
    );
    const otherLead = await createLead(
      { projectId: await general(), name: "Other's depositor", phone: phone(), source: "INSTAGRAM" },
      other.actor,
      await other.scope(),
    );
    const log = async (who: typeof exec, leadId: string, sequence: "FIRST" | "LATER", amount: string, depositedAt: string) =>
      logDeposit(leadId, { sequence, amount, depositedAt, jetaFxClientId: `JX-${leadId}` }, who.actor, await who.scope());
    const get = async (dep: string) => (await LeadDeposit.findById(dep).lean())!;

    const first = await log(exec, id, "FIRST", "20000", "2026-10-01");
    await verifyDeposit(first, admin.actor, as);
    const a = await log(exec, id, "LATER", "8000", "2026-10-02");
    await verifyDeposit(a, admin.actor, as);
    // $8,000: base 1%. The $20,000 1st deposit doesn't count toward the month.
    expect(await get(a)).toMatchObject({ commissionPct: "0.010000", commissionMinor: 8000, slabBaseMinor: 800000 });
    const b = await log(exec, second, "LATER", "6000", "2026-10-03");
    await verifyDeposit(b, admin.actor, as);
    // $14,000 from two leads: 2% on both.
    expect(await get(a)).toMatchObject({ commissionPct: "0.020000", commissionMinor: 16000, slabBaseMinor: 1400000 });
    expect(await get(b)).toMatchObject({ commissionPct: "0.020000", commissionMinor: 12000 });
    const c = await log(exec, second, "LATER", "15000", "2026-10-04");
    // Pending deposits don't count.
    expect((await get(a)).commissionPct).toBe("0.020000");
    // Another person's deposits and another month stay out of it.
    const theirs = await log(other, otherLead, "LATER", "50000", "2026-10-04");
    await verifyDeposit(theirs, admin.actor, as);
    const sept = await log(exec, id, "LATER", "30000", "2026-09-28");
    await verifyDeposit(sept, admin.actor, as);
    expect(await get(sept)).toMatchObject({ commissionPct: "0.025000", slabBaseMinor: 3000000 });
    expect((await get(a)).commissionPct).toBe("0.020000");
    await verifyDeposit(c, admin.actor, as);
    // $29,000: 2.5% on all three; the 1st deposit keeps its own rate.
    expect([await get(a), await get(b), await get(c)].map((d) => [d.commissionPct, d.commissionMinor, d.slabBaseMinor])).toEqual([
      ["0.025000", 20000, 2900000],
      ["0.025000", 15000, 2900000],
      ["0.025000", 37500, 2900000],
    ]);
    expect(await get(first)).toMatchObject({ commissionPct: "0.100000", commissionMinor: 200000, slabBaseMinor: null });
    expect(await get(theirs)).toMatchObject({ commissionPct: "0.025000", slabBaseMinor: 5000000 });
    const note = await InAppNotification.findOne({ userId: exec.id, title: "Deposit verified" }).sort({ _id: -1 }).lean();
    expect(note!.body).toMatch(/October 2026 later deposits: .*29,000.*2\.5% on all of them\. Your earlier ones this month went up too\./);

    // The deposits page shows the month's progress to the next slab.
    expect((await listDeposits({}, await exec.scope())).summary.month).toEqual({ laterMinor: 2900000, pct: "0.025000", next: null });
    expect((await listDeposits({}, as)).summary.month).toBeNull(); // everyone's: no single month
    expect((await listDeposits({ staff: exec.id }, as)).summary.month).toMatchObject({ laterMinor: 2900000 });

    // Rejecting a verified one drops the month back to $14,000: 2%.
    await rejectDeposit(c, "Reversed by the broker", admin.actor, as);
    expect(await get(c)).toMatchObject({ status: "REJECTED", commissionMinor: null, slabBaseMinor: null });
    expect(await get(a)).toMatchObject({ commissionPct: "0.020000", commissionMinor: 16000, slabBaseMinor: 1400000 });
    expect((await listDeposits({}, await exec.scope())).summary.month).toEqual({
      laterMinor: 1400000,
      pct: "0.020000",
      next: { fromMinor: 2500000, pct: "0.025000" },
    });

    // New slabs re-rate the current month at once; September keeps its rate.
    await saveCommissionSettings(
      {
        firstPct: 10,
        slabs: [
          { from: 0, pct: 1 },
          { from: 10000, pct: 3 },
        ],
      },
      admin.actor,
    );
    expect(await get(a)).toMatchObject({ commissionPct: "0.030000", commissionMinor: 24000 });
    expect(await get(b)).toMatchObject({ commissionPct: "0.030000", commissionMinor: 18000 });
    expect(await get(sept)).toMatchObject({ commissionPct: "0.025000", commissionMinor: 75000 });
    expect(await get(first)).toMatchObject({ commissionPct: "0.100000" });
  });

  it("backfills later deposits rated per deposit: a dry run first, then once", async () => {
    const { exec, admin, id } = await setup();
    const as = await admin.scope();
    const dep = async (amount: string, depositedAt: string) => {
      const d = await logDeposit(id, { sequence: "LATER", amount, depositedAt, jetaFxClientId: "JX-B" }, exec.actor, await exec.scope());
      await verifyDeposit(d, admin.actor, as);
      return d;
    };
    const sept = await dep("9000", "2026-09-10");
    const a = await dep("8000", "2026-10-02");
    const b = await dep("6000", "2026-10-03");
    // As the old rule left them: each rated by its own amount ($8,000 and $6,000: 1%), no month total.
    await LeadDeposit.updateMany(
      { _id: { $in: [sept, a, b] } },
      [{ $set: { commissionPct: "0.010000", commissionMinor: { $multiply: ["$amountMinor", 0.01] }, slabBaseMinor: null } }],
      { updatePipeline: true },
    );
    const sys = { type: "SYSTEM" as const, id: "test" };

    const dry = await rerateLaterCommission({ apply: false }, sys);
    expect(dry.map((r) => [r.month, r.totalMinor, r.pct, r.beforeMinor, r.afterMinor, r.changed])).toEqual([
      ["2026-09", 900000, "0.010000", 9000, 9000, 1], // only the month total is missing
      ["2026-10", 1400000, "0.020000", 14000, 28000, 2],
    ]);
    expect((await LeadDeposit.findById(a).lean())!).toMatchObject({ commissionMinor: 8000, slabBaseMinor: null });

    expect((await rerateLaterCommission({ apply: false, fromMonth: "2026-10" }, sys)).map((r) => r.month)).toEqual(["2026-10"]);
    await expect(rerateLaterCommission({ apply: false, fromMonth: "Oct" }, sys)).rejects.toThrow(/2026-10/);

    await rerateLaterCommission({ apply: true }, sys);
    expect((await LeadDeposit.findById(a).lean())!).toMatchObject({
      commissionPct: "0.020000",
      commissionMinor: 16000,
      slabBaseMinor: 1400000,
    });
    expect((await LeadDeposit.findById(b).lean())!).toMatchObject({ commissionPct: "0.020000", commissionMinor: 12000 });
    expect(await AuditLog.countDocuments({ action: "crm.commission.rerate" })).toBe(2);
    expect(await rerateLaterCommission({ apply: true }, sys)).toEqual([]); // nothing left on the old rule
    expect((await rerateLaterCommission({ apply: false, all: true }, sys)).every((r) => r.changed === 0)).toBe(true);
  });

  it("rejects pending or reversed deposits and lets the logger delete a pending one", async () => {
    const { exec, other, admin, id } = await setup();
    const scope = await exec.scope();
    const a = await logDeposit(
      id,
      { sequence: "FIRST", amount: "300", depositedAt: "2026-10-05", jetaFxClientId: "JX-3" },
      exec.actor,
      scope,
    );
    await verifyDeposit(a, admin.actor, await admin.scope());
    await rejectDeposit(a, "Reversed by the broker", admin.actor, await admin.scope());
    expect((await LeadDeposit.findById(a).lean())!).toMatchObject({
      status: "REJECTED",
      commissionMinor: null,
      rejectReason: "Reversed by the broker",
    });
    // A rejected 1st deposit can be logged again.
    const b = await logDeposit(id, { sequence: "FIRST", amount: "300", depositedAt: "2026-10-05" }, exec.actor, scope);
    await expect(deleteDeposit(b, other.actor, await other.scope())).rejects.toBeInstanceOf(NotFoundError); // not their lead
    await deleteDeposit(b, exec.actor, scope);
    expect(await LeadDeposit.countDocuments({ _id: b })).toBe(0);
    await expect(deleteDeposit(a, exec.actor, scope)).rejects.toBeInstanceOf(BusinessError);
    expect(await AuditLog.countDocuments({ action: { $in: ["lead.deposit.verify", "lead.deposit.reject", "lead.deposit.delete"] } })).toBe(
      3,
    );
  });

  it("migrates the old 1st / 2nd / later rates: 2nd deposits become later ones, the later rate the base slab", async () => {
    const { exec, id } = await setup();
    const dep = await logDeposit(
      id,
      { sequence: "LATER", amount: "200", depositedAt: "2026-10-05", jetaFxClientId: "JX-5" },
      exec.actor,
      await exec.scope(),
    );
    await LeadDeposit.collection.updateOne({ _id: new Types.ObjectId(dep) }, { $set: { sequence: "SECOND" } });
    await Setting.updateOne({ _id: "crm.commission" }, { $set: { value: { firstPct: "0.04", secondPct: "0.03", laterPct: "0.015" } } });
    await seedBaseData();
    expect((await LeadDeposit.findById(dep).lean())!.sequence).toBe("LATER");
    expect(await getCommissionSettings()).toEqual({ firstPct: 4, slabs: [{ from: 0, pct: 1.5 }] });
    await seedBaseData(); // no-op once done
    expect(await getCommissionSettings()).toEqual({ firstPct: 4, slabs: [{ from: 0, pct: 1.5 }] });
  });

  it("keeps leads with deposits from being deleted", async () => {
    const { exec, admin, id } = await setup();
    await logDeposit(
      id,
      { sequence: "FIRST", amount: "100", depositedAt: "2026-10-05", jetaFxClientId: "JX-4" },
      exec.actor,
      await exec.scope(),
    );
    await expect(deleteLead(id, admin.actor, await admin.scope())).rejects.toThrow(/deposits/);
  });
});

describe("leaderboard", () => {
  it("ranks people by conversions in the period, then deposits; commission only for commission managers", async () => {
    const a = await staff("sales_executive");
    const b = await staff("sales_executive");
    const idle = await staff("sales_executive");
    const admin = await staff("crm_admin");
    const g = await general();
    await saveCommissionSettings({ firstPct: 10, slabs: [{ from: 0, pct: 1 }] }, admin.actor);
    const inner = await product("INNER-CIRCLE");
    const f1 = await product("F1-CLUB");

    // Last month: one conversion for b.
    freezeClock("2026-09-20T06:00:00Z");
    const old = await createLead({ projectId: g, name: "Old", phone: phone(), source: "INSTAGRAM" }, b.actor, await b.scope());
    await markConversions(old, { productIds: [inner] }, b.actor, await b.scope());

    freezeClock("2026-10-06T06:00:00Z");
    const a1 = await createLead({ projectId: g, name: "A1", phone: phone(), source: "INSTAGRAM" }, a.actor, await a.scope());
    const a2 = await createLead({ projectId: g, name: "A2", phone: phone(), source: "INSTAGRAM" }, a.actor, await a.scope());
    const b1 = await createLead({ projectId: g, name: "B1", phone: phone(), source: "INSTAGRAM" }, b.actor, await b.scope());
    await markConversions(a1, { productIds: [inner, f1] }, a.actor, await a.scope());
    await markConversions(b1, { productIds: [inner] }, b.actor, await b.scope());
    const dep = await logDeposit(
      b1,
      { sequence: "FIRST", amount: "500", depositedAt: "2026-10-04", jetaFxClientId: "JX-B1" },
      b.actor,
      await b.scope(),
    );
    await verifyDeposit(dep, admin.actor, await admin.scope());
    await logDeposit(
      a2,
      { sequence: "FIRST", amount: "900", depositedAt: "2026-10-05", jetaFxClientId: "JX-A2" },
      a.actor,
      await a.scope(),
    );

    const board = await getLeaderboard({ period: "month" }, await a.scope());
    expect(board.showCommission).toBe(false);
    expect(board.rows.map((r) => [r.name, r.rank, r.conversions])).toEqual([
      [`sales_executive ${n - 3}`, 1, 2],
      [`sales_executive ${n - 2}`, 2, 1],
      [`sales_executive ${n - 1}`, 3, 0],
    ]);
    const rowA = board.rows[0]!;
    expect(rowA).toMatchObject({ isMe: true, newLeads: 2, convertedLeads: 1, conversionRate: 50, depositsMinor: 0, commissionMinor: null });
    expect(rowA.byProduct).toEqual({ [inner]: 1, [f1]: 1 });
    expect(board.me).toMatchObject({ conversions: 2, pendingCount: 1, pendingMinor: 90000 });
    expect(board.rows.find((r) => r.id === idle.id)?.conversions).toBe(0);

    const forAdmin = await getLeaderboard({ period: "month" }, await admin.scope());
    expect(forAdmin.rows.find((r) => r.id === b.id)).toMatchObject({ depositsMinor: 50000, commissionMinor: 5000 });
    expect((await getLeaderboard({ period: "lastMonth" }, await a.scope())).rows[0]).toMatchObject({ id: b.id, conversions: 1 });
    expect((await getLeaderboard({ period: "all" }, await a.scope())).rows.find((r) => r.id === b.id)?.conversions).toBe(2);

    const dash = await getCrmDashboard(await admin.scope());
    expect(dash.byProduct.find((p) => p.id === inner)?.month).toBe(2);
    expect(dash.bySource.find((s) => s.source === "INSTAGRAM")?.converted).toBe(3);
  });
});
