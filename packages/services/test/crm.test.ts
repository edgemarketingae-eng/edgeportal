import {
  AuditLog,
  AuthAccount,
  AuthUser,
  AuthVerification,
  Batch,
  CrmTask,
  Enrollment,
  InAppNotification,
  Lead,
  LeadActivity,
  LeadInboundEvent,
  NotificationLog,
  Payment,
  Project,
  Role,
  seedBaseData,
  StaffProfile,
  StudentProfile,
  TaskComment,
  Types,
} from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { isCrmRole } from "@edge/domain/auth/permissions";
import { freezeClock, setClock } from "@edge/domain/clock";
import { SCHEDULES } from "@edge/jobs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addActivity,
  addTaskComment,
  allHandlers,
  assignLead,
  bulkAssignLeads,
  bulkDeleteLeads,
  BusinessError,
  claimLead,
  completeTask,
  convertLeadToStudent,
  createCrmStaff,
  createLead,
  createProject,
  createStaff,
  createTask,
  deleteLead,
  deliverEmail,
  dueTaskCount,
  getBoard,
  getCrmDashboard,
  getDefaultProject,
  getLeadDetail,
  getProject,
  getTaskDetail,
  handleLeadWebhook,
  importLeads,
  linkLeadForStudent,
  listCrmRoles,
  listCrmStaff,
  listLeads,
  listStaff,
  listProjects,
  loadCrmScope,
  loadViewer,
  loginUrlFor,
  mergeLeads,
  moveLeadToProject,
  moveTask,
  NotFoundError,
  previewImport,
  removeProjectMember,
  resetStaffPassword,
  salesExecutivesFor,
  resetEnvForTests,
  runBatchUrgency,
  runFollowUpDigest,
  runStaleSweep,
  saveCrmRole,
  setProjectMember,
  setStage,
  signLeadPayload,
  TransitionError,
  updateCrmStaff,
  updateProject,
  type CrmScope,
} from "../src";
import { createBatch, createStudent, producer, sent } from "./helpers";

const SECRET = "test-lead-webhook-secret-0123";
process.env.LEAD_WEBHOOK_SECRET = SECRET;
resetEnvForTests();

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  producer.take();
  sent.length = 0;
  freezeClock("2026-10-06T06:00:00Z"); // 10:00 Dubai
});
afterEach(() => setClock(null));

type RoleKey = "crm_admin" | "crm_manager" | "project_manager" | "sales_executive" | "admin" | "finance";
let n = 0;
async function staff(role: RoleKey) {
  n += 1;
  const { id } = await createStaff(
    { name: `${role} ${n}`, email: `${role}-${n}-${Date.now()}@edge.test`, roleKeys: [role], password: "StaffPass!2026" },
    { type: "SYSTEM" },
  );
  const viewer = (await loadViewer(id))!;
  const actor = { type: "USER" as const, id };
  /** Scope is reloaded on demand because project membership changes during a test. */
  const scope = (): Promise<CrmScope> => loadCrmScope(viewer);
  return { id, actor, viewer, scope };
}
const general = async () => String((await getDefaultProject())._id);

describe("leads", () => {
  it("normalises contact details, refuses duplicates unless allowed, and shows them on the detail page", async () => {
    const exec = await staff("sales_executive");
    const g = await general();
    const id = await createLead(
      {
        projectId: g,
        name: "Amy Khan",
        phone: "050 123 4567",
        country: "AE",
        email: " Amy@Example.com ",
        source: "INSTAGRAM",
        tags: "Hot, webinar ,hot",
      },
      exec.actor,
      await exec.scope(),
    );
    const lead = (await Lead.findById(id).lean())!;
    expect(lead.phone).toBe("+971501234567");
    expect(lead.country).toBe("AE");
    expect(lead.email).toBe("amy@example.com");
    expect(lead.tags).toEqual(["hot", "webinar"]);
    expect(String(lead.ownerId)).toBe(exec.id);
    expect(String(lead.projectId)).toBe(g);
    expect(lead.stage).toBe("NEW");
    await expect(
      createLead({ projectId: g, name: "Amy again", phone: "+971501234567", source: "WEBSITE" }, exec.actor, await exec.scope()),
    ).rejects.toBeInstanceOf(BusinessError);
    await expect(
      createLead({ projectId: g, name: "Bad phone", phone: "123", source: "WEBSITE" }, exec.actor, await exec.scope()),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      createLead(
        { projectId: "000000000000000000000000", name: "Nope", phone: "+971501234568", source: "WEBSITE" },
        exec.actor,
        await exec.scope(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const dup = await createLead(
      { projectId: g, name: "Amy again", phone: "+971501234567", source: "WEBSITE", allowDuplicate: true },
      exec.actor,
      await exec.scope(),
    );
    const detail = await getLeadDetail(id, await exec.scope());
    expect(detail.duplicates.map((d) => d.id)).toContain(dup);
    expect(detail.lead.project.code).toBe("GENERAL");
    expect(detail.can).toEqual({
      delete: false,
      assign: false,
      claim: false,
      moveProject: false,
      removeConversion: false,
      reviewDeposits: false,
    });
  });

  it("logs touches, auto-advances NEW to CONTACTED, schedules and completes follow-ups", async () => {
    const exec = await staff("sales_executive");
    const g = await general();
    const id = await createLead({ projectId: g, name: "Ben", phone: "+971502222222", source: "WEBSITE" }, exec.actor, await exec.scope());
    await addActivity(id, { type: "NOTE", body: "Budget looks fine" }, exec.actor, await exec.scope());
    expect((await Lead.findById(id).lean())!.stage).toBe("NEW");
    await addActivity(
      id,
      { type: "CALL", body: "Spoke, keen", outcome: "ANSWERED", nextFollowUpAt: "2026-10-07T10:00", nextFollowUpTitle: "Send brochure" },
      exec.actor,
      await exec.scope(),
    );
    let lead = (await Lead.findById(id).lean())!;
    expect(lead.stage).toBe("CONTACTED");
    expect(lead.firstContactedAt?.toISOString()).toBe("2026-10-06T06:00:00.000Z");
    expect(lead.nextFollowUpAt?.toISOString()).toBe("2026-10-07T06:00:00.000Z");
    const task = (await CrmTask.findOne({ leadId: lead._id, status: "TODO" }).lean())!;
    expect(task.title).toBe("Send brochure");
    expect(String(task.assigneeId)).toBe(exec.id);
    expect(String(task.projectId)).toBe(g);
    expect(await dueTaskCount(await exec.scope())).toBe(0);
    freezeClock("2026-10-07T05:00:00Z");
    expect(await dueTaskCount(await exec.scope())).toBe(1);
    await completeTask(
      String(task._id),
      { note: "Sent it", outcome: "ANSWERED", nextFollowUpAt: "2026-10-09T10:00" },
      exec.actor,
      await exec.scope(),
    );
    expect((await CrmTask.findById(task._id).lean())!.status).toBe("DONE");
    lead = (await Lead.findById(id).lean())!;
    expect(lead.nextFollowUpAt?.toISOString()).toBe("2026-10-09T06:00:00.000Z");
    expect(await LeadActivity.countDocuments({ leadId: lead._id, type: "TASK_DONE" })).toBe(1);
    await expect(completeTask(String(task._id), {}, exec.actor, await exec.scope())).rejects.toBeInstanceOf(TransitionError);
    await createTask({ leadId: id, title: "Call again", type: "WHATSAPP", dueAt: "2026-10-08T12:00" }, exec.actor, await exec.scope());
    expect((await Lead.findById(id).lean())!.nextFollowUpAt?.toISOString()).toBe("2026-10-08T08:00:00.000Z");
  });

  it("moves through stages, needs a reason to lose, never converts by hand, and can reopen", async () => {
    const exec = await staff("sales_executive");
    const g = await general();
    const id = await createLead(
      { projectId: g, name: "Cara", email: "cara@example.com", source: "REFERRAL" },
      exec.actor,
      await exec.scope(),
    );
    await setStage(id, { stage: "QUALIFIED" }, exec.actor, await exec.scope());
    expect((await Lead.findById(id).lean())!.firstContactedAt).not.toBeNull();
    await expect(setStage(id, { stage: "CONVERTED" }, exec.actor, await exec.scope())).rejects.toBeInstanceOf(TransitionError);
    await setStage(id, { stage: "LOST", lostReason: "Budget" }, exec.actor, await exec.scope());
    expect((await Lead.findById(id).lean())!.lostReason).toBe("Budget");
    await setStage(id, { stage: "NEW" }, exec.actor, await exec.scope());
    expect((await Lead.findById(id).lean())!.lostReason).toBeNull();
  });
});

describe("projects and scope", () => {
  it("project managers see their projects, executives see own + unassigned, managers see all", async () => {
    const mgr = await staff("crm_manager");
    const pm = await staff("project_manager");
    const a = await staff("sales_executive");
    const b = await staff("sales_executive");
    const g = await general();
    const P = await createProject({ name: "Nov drive", managerIds: [pm.id], memberIds: [a.id] }, mgr.actor, await mgr.scope());
    await expect(createProject({ name: "Nope" }, pm.actor, await pm.scope())).rejects.toBeInstanceOf(NotFoundError);

    const L1 = await createLead({ projectId: P, name: "Owned by A", phone: "+971503000001", source: "WEBSITE" }, a.actor, await a.scope());
    const L2 = await createLead(
      { projectId: P, name: "Unassigned in P", phone: "+971503000002", source: "WEBSITE", ownerId: "" },
      pm.actor,
      await pm.scope(),
    );
    const L3 = await createLead(
      { projectId: g, name: "A in General", phone: "+971503000003", source: "WEBSITE" },
      a.actor,
      await a.scope(),
    );
    const L5 = await createLead({ projectId: P, name: "PM's own", phone: "+971503000005", source: "WEBSITE" }, pm.actor, await pm.scope());
    await expect(
      createLead({ projectId: P, name: "B is not on the team", phone: "+971503000004", source: "WEBSITE" }, b.actor, await b.scope()),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      createLead(
        { projectId: P, name: "Owner off team", phone: "+971503000006", source: "WEBSITE", ownerId: b.id },
        pm.actor,
        await pm.scope(),
      ),
    ).rejects.toBeInstanceOf(BusinessError);

    const ids = async (s: CrmScope) => (await listLeads({ view: "all" }, s)).rows.map((r) => r.id).sort();
    expect(await ids(await a.scope())).toEqual([L1, L2, L3].sort());
    expect(await ids(await pm.scope())).toEqual([L1, L2, L5].sort());
    expect(await ids(await b.scope())).toEqual([]);
    expect(await ids(await mgr.scope())).toEqual([L1, L2, L3, L5].sort());
    await expect(getLeadDetail(L5, await a.scope())).rejects.toBeInstanceOf(NotFoundError);
    await expect(getLeadDetail(L1, await b.scope())).rejects.toBeInstanceOf(NotFoundError);
    expect((await getLeadDetail(L1, await pm.scope())).can).toMatchObject({ assign: true, claim: false });

    // assignment authority
    await expect(assignLead(L2, a.id, a.actor, await a.scope())).rejects.toBeInstanceOf(NotFoundError); // executives cannot assign
    await expect(assignLead(L2, b.id, pm.actor, await pm.scope())).rejects.toBeInstanceOf(BusinessError); // B is not on the team
    await assignLead(L2, a.id, pm.actor, await pm.scope());
    expect(String((await Lead.findById(L2).lean())!.ownerId)).toBe(a.id);
    expect(await InAppNotification.countDocuments({ userId: a.id, title: "Lead assigned to you" })).toBe(1);

    // claim from the pool
    const L6 = await createLead(
      { projectId: P, name: "Pool", phone: "+971503000007", source: "WEBSITE", ownerId: "" },
      pm.actor,
      await pm.scope(),
    );
    expect((await getLeadDetail(L6, await a.scope())).can.claim).toBe(true);
    await claimLead(L6, a.actor, await a.scope());
    expect(String((await Lead.findById(L6).lean())!.ownerId)).toBe(a.id);
    expect(await LeadActivity.countDocuments({ leadId: L6, type: "CLAIMED" })).toBe(1);
    await expect(claimLead(L6, a.actor, await a.scope())).rejects.toBeInstanceOf(TransitionError);

    // dashboards follow the scope
    expect((await getCrmDashboard(await pm.scope())).openLeads).toBe(4);
    expect((await getCrmDashboard(await a.scope())).openLeads).toBe(4);
    expect((await getCrmDashboard(await mgr.scope())).scopeAll).toBe(true);
    expect((await getCrmDashboard(await mgr.scope())).projects.find((p) => p.id === P)?.open).toBe(4);
    await expect(getCrmDashboard(await b.scope(), { project: P })).rejects.toBeInstanceOf(NotFoundError);

    // project pages
    expect((await listProjects(await b.scope())).map((p) => p.code)).toEqual(["GENERAL"]);
    expect((await listProjects(await a.scope())).map((p) => p.code).sort()).toEqual(["GENERAL", "NOV-DRIVE"]);
    const detail = await getProject(P, await pm.scope());
    expect(detail.project.canManage).toBe(true);
    expect(detail.team.map((t) => [t.name, t.role])).toEqual([
      [pm.viewer.user.name, "manager"],
      [a.viewer.user.name, "member"],
    ]);
    expect(detail.team.find((t) => t.id === a.id)?.openLeads).toBe(3);
    await expect(updateProject(P, { status: "PAUSED" }, pm.actor, await pm.scope())).rejects.toBeInstanceOf(BusinessError);
    await updateProject(P, { status: "PAUSED", targetConversions: 25 }, mgr.actor, await mgr.scope());
    expect((await Project.findById(P).lean())!.targetConversions).toBe(25);
    await setProjectMember(P, { userId: b.id, role: "member" }, pm.actor, await pm.scope());
    const L7 = await createLead(
      { projectId: P, name: "Pool for B", phone: "+971503000008", source: "WEBSITE", ownerId: "" },
      pm.actor,
      await pm.scope(),
    );
    expect(await ids(await b.scope())).toEqual([L7]); // a member sees the project's unassigned pool, not colleagues' leads
    await removeProjectMember(P, b.id, pm.actor, await pm.scope());
    expect(await ids(await b.scope())).toEqual([]);
    await expect(setProjectMember(P, { userId: b.id, role: "manager" }, pm.actor, await pm.scope())).rejects.toBeInstanceOf(BusinessError);
    await expect(updateProject(g, { status: "ARCHIVED" }, mgr.actor, await mgr.scope())).rejects.toBeInstanceOf(BusinessError);

    // moving leads between projects keeps the owner only when they are on the new team
    await moveLeadToProject(L3, P, mgr.actor, await mgr.scope());
    expect(String((await Lead.findById(L3).lean())!.ownerId)).toBe(a.id);
    const Q = await createProject({ name: "Other", managerIds: [pm.id] }, mgr.actor, await mgr.scope());
    await moveLeadToProject(L1, Q, pm.actor, await pm.scope());
    const moved = (await Lead.findById(L1).lean())!;
    expect(String(moved.projectId)).toBe(Q);
    expect(moved.ownerId).toBeNull();
    expect(await LeadActivity.countDocuments({ leadId: L1, type: "PROJECT_CHANGED" })).toBe(1);
  });
});

describe("task board", () => {
  it("creates, moves, reorders, completes and comments; visibility follows the scope", async () => {
    const mgr = await staff("crm_manager");
    const pm = await staff("project_manager");
    const a = await staff("sales_executive");
    const P = await createProject({ name: "Board", managerIds: [pm.id], memberIds: [a.id] }, mgr.actor, await mgr.scope());
    const t1 = await createTask({ projectId: P, title: "Prepare brochure", priority: "HIGH" }, pm.actor, await pm.scope());
    const t2 = await createTask(
      { projectId: P, title: "Call the webinar list", assigneeId: a.id, dueAt: "2026-10-06T14:00" },
      pm.actor,
      await pm.scope(),
    );
    const t3 = await createTask({ projectId: P, title: "Mine", type: "OTHER" }, a.actor, await a.scope());
    await expect(
      createTask({ projectId: P, title: "Not mine to give", assigneeId: pm.id }, a.actor, await a.scope()),
    ).rejects.toMatchObject({ status: 403 });
    expect((await CrmTask.find({ projectId: P }).sort({ order: 1 }).lean()).map((t) => t.order)).toEqual([0, 1, 2]);

    const boardA = await getBoard(await a.scope(), {});
    expect(boardA.TODO.map((t) => t.id).sort()).toEqual([t2, t3].sort()); // a sees assigned + created, not the PM's own task
    await expect(getTaskDetail(t1, await a.scope())).rejects.toBeInstanceOf(NotFoundError);
    expect((await getBoard(await pm.scope(), {})).TODO).toHaveLength(3);

    await moveTask(t2, { status: "IN_PROGRESS", orderedIds: [t2] }, a.actor, await a.scope());
    await moveTask(t3, { status: "TODO", orderedIds: [t3, t1, "000000000000000000000000"] }, pm.actor, await pm.scope());
    const after = await getBoard(await pm.scope(), {});
    expect(after.IN_PROGRESS.map((t) => t.id)).toEqual([t2]);
    expect(after.TODO.map((t) => t.id)).toEqual([t3, t1]);

    await moveTask(t2, { status: "DONE" }, a.actor, await a.scope());
    let doc = (await CrmTask.findById(t2).lean())!;
    expect(doc.completedAt).not.toBeNull();
    expect(String(doc.completedById)).toBe(a.id);
    await moveTask(t2, { status: "TODO", orderedIds: [t2, t3, t1] }, pm.actor, await pm.scope());
    doc = (await CrmTask.findById(t2).lean())!;
    expect(doc.completedAt).toBeNull();
    expect(doc.order).toBe(0);

    await addTaskComment(t2, "Spoke to 4 of them", a.actor, await a.scope());
    const detail = await getTaskDetail(t2, await pm.scope());
    expect(detail.comments).toHaveLength(1);
    expect(detail.task.commentCount).toBe(1);
    expect(detail.assignees.map((x) => x.id).sort()).toEqual([pm.id, a.id].sort());
    expect(await dueTaskCount(await a.scope())).toBe(1);
  });

  it("task due dates are optional and drive the lead's next follow-up", async () => {
    const exec = await staff("sales_executive");
    const g = await general();
    const id = await createLead({ projectId: g, name: "Dee", phone: "+971505550001", source: "WEBSITE" }, exec.actor, await exec.scope());
    await createTask({ leadId: id, title: "No date" }, exec.actor, await exec.scope());
    expect((await Lead.findById(id).lean())!.nextFollowUpAt).toBeNull();
    const dated = await createTask({ leadId: id, title: "Dated", dueAt: "2026-10-10T09:00" }, exec.actor, await exec.scope());
    expect((await Lead.findById(id).lean())!.nextFollowUpAt?.toISOString()).toBe("2026-10-10T05:00:00.000Z");
    await moveTask(dated, { status: "DONE" }, exec.actor, await exec.scope());
    expect((await Lead.findById(id).lean())!.nextFollowUpAt).toBeNull();
    expect(await LeadActivity.countDocuments({ leadId: id, type: "TASK_DONE", "data.via": "board" })).toBe(1);
  });
});

describe("conversion", () => {
  it("creates the student account, enrollment, set-password token and welcome email exactly once", async () => {
    const batch = await createBatch();
    const mgr = await staff("crm_manager");
    const g = await general();
    const id = await createLead(
      { projectId: g, name: "Zed Ali", phone: "+971509998877", email: "zed@example.com", source: "WEBSITE", marketingConsent: true },
      mgr.actor,
      await mgr.scope(),
    );
    const r = await convertLeadToStudent(id, { batchId: String(batch._id), actor: mgr.actor, scope: await mgr.scope() });
    const user = (await AuthUser.findById(r.studentId).lean())!;
    expect(user.email).toBe("zed@example.com");
    expect(user.phoneNumber).toBeNull();
    expect(user.mustChangePassword).toBe(false);
    expect(await AuthAccount.countDocuments({ userId: user._id, providerId: "credential" })).toBe(1);
    expect((await StudentProfile.findById(user._id).lean())!.pendingPhone).toBe("+971509998877");
    const e = (await Enrollment.findOne({ studentId: user._id }).lean())!;
    expect(e.source).toBe("CRM_CONVERTED");
    const lead = (await Lead.findById(id).lean())!;
    expect(lead.stage).toBe("CONVERTED");
    const token = (await AuthVerification.findOne({ value: r.studentId }).lean())!;
    expect(token.identifier).toMatch(/^reset-password:/);
    const log = (await NotificationLog.findOne({ template: "crm.studentWelcome" }).lean())!;
    expect((log.payload as { setPasswordUrl: string }).setPasswordUrl).toContain(token.identifier.replace("reset-password:", ""));
    await deliverEmail(String(log._id));
    expect(sent[0]?.html).toContain("Set my password");
    await expect(convertLeadToStudent(id, { actor: mgr.actor, scope: await mgr.scope() })).rejects.toBeInstanceOf(TransitionError);
    await expect(
      createLead(
        { projectId: g, name: "Zed Ali", phone: "+971509998877", source: "WHATSAPP", allowDuplicate: true },
        mgr.actor,
        await mgr.scope(),
      ),
    ).rejects.toBeInstanceOf(BusinessError);

    const sid = await createStudent();
    const phone = (await AuthUser.findById(sid).lean())!.phoneNumber!;
    const linked = await createLead(
      { projectId: g, name: "Existing Student", phone, email: "existing-student@example.com", source: "WHATSAPP" },
      mgr.actor,
      await mgr.scope(),
    );
    expect((await Lead.findById(linked).lean())!.stage).toBe("CONVERTED");
    await Lead.updateOne({ _id: linked }, { $set: { stage: "NEW", studentId: null, convertedAt: null } });
    await expect(convertLeadToStudent(linked, { actor: mgr.actor, scope: await mgr.scope() })).rejects.toThrow(/Link to existing student/);
  });

  it("auto-links the matching lead once and notes payments", async () => {
    const mgr = await staff("crm_manager");
    const exec = await staff("sales_executive");
    const g = await general();
    const leadId = await createLead(
      { projectId: g, name: "Sam", phone: "+971501112233", source: "INSTAGRAM", ownerId: exec.id },
      mgr.actor,
      await mgr.scope(),
    );
    const sid = await createStudent();
    await AuthUser.updateOne({ _id: sid }, { $set: { phoneNumber: "+971501112233" } });
    expect((await linkLeadForStudent(sid, { reason: "signup" })).linked).toBe(true);
    expect((await Lead.findById(leadId).lean())!.stage).toBe("CONVERTED");
    expect(await InAppNotification.countDocuments({ userId: exec.id, title: /now a student/ })).toBe(1);
    expect((await linkLeadForStudent(sid, { reason: "signup" })).linked).toBe(false);
    const batch = await createBatch();
    const [e] = await Enrollment.create([
      { studentId: sid, batchId: batch._id, source: "STAFF_ASSIGNED", feeMinor: batch.feeMinor, currency: "AED" },
    ]);
    const [p] = await Payment.create([
      {
        enrollmentId: e!._id,
        studentId: sid,
        kind: "ADVANCE",
        gateway: "MANUAL",
        feeRateKey: "MANUAL",
        status: "SUCCEEDED",
        currency: "AED",
        billingCountry: "AE",
        vatTreatment: "STANDARD",
        courseMinor: 30000,
        courseVatMinor: 1500,
        netMinor: 31500,
        processingFeeMinor: 0,
        processingFeeVatMinor: 0,
        totalMinor: 31500,
        idempotencyKey: `t-${Date.now()}`,
      },
    ]);
    await linkLeadForStudent(sid, { reason: "payment", paymentId: String(p!._id) });
    await linkLeadForStudent(sid, { reason: "payment", paymentId: String(p!._id) });
    expect(await LeadActivity.countDocuments({ leadId, type: "SYSTEM", "data.paymentId": String(p!._id) })).toBe(1);
  });
});

describe("website intake", () => {
  it("lands in the default project, notifies CRM managers, dedupes the inbox and appends repeat enquiries", async () => {
    const mgr = await staff("crm_manager");
    const body = JSON.stringify({
      id: "evt-1",
      name: "Web Lead",
      phone: "+971507776655",
      email: "web@example.com",
      message: "Interested in November",
      utm: { source: "instagram", campaign: "oct-launch" },
      consent: true,
    });
    expect((await handleLeadWebhook("website", body, new Headers({ "x-edge-signature": "nope" }), null)).status).toBe(401);
    const ok = await handleLeadWebhook("website", body, new Headers({ "x-edge-signature": signLeadPayload(SECRET, body) }), "1.2.3.4");
    expect(ok.status).toBe(200);
    const lead = (await Lead.findById(String(ok.body.leadId)).lean())!;
    expect(String(lead.projectId)).toBe(await general());
    expect(lead.ownerId).toBeNull();
    expect(lead.utm?.campaign).toBe("oct-launch");
    expect(await InAppNotification.countDocuments({ userId: mgr.id, title: "New website lead" })).toBe(1); // General has no managers: crm.all holders are told
    expect((await handleLeadWebhook("website", body, new Headers({ "x-edge-lead-token": SECRET }), null)).body.duplicate).toBe(true);
    const body2 = JSON.stringify({ id: "evt-2", name: "Web Lead", phone: "+971507776655", message: "Still interested" });
    const again = await handleLeadWebhook("website", body2, new Headers({ "x-edge-signature": signLeadPayload(SECRET, body2) }), null);
    expect(again.body).toMatchObject({ leadId: String(lead._id), existing: true });
    expect(await LeadActivity.countDocuments({ leadId: lead._id, type: "INBOUND" })).toBe(1);
    expect(await LeadInboundEvent.countDocuments()).toBe(2);
  });
});

describe("merge and import", () => {
  it("merges a duplicate into the survivor (manager of its project) with history, tasks and missing fields", async () => {
    const mgr = await staff("crm_manager");
    const g = await general();
    const a = await createLead(
      { projectId: g, name: "Dup A", phone: "+971501000001", source: "INSTAGRAM", notes: "first" },
      mgr.actor,
      await mgr.scope(),
    );
    const b = await createLead(
      { projectId: g, name: "Dup B", email: "dup@example.com", source: "WEBSITE", tags: "vip", allowDuplicate: true },
      mgr.actor,
      await mgr.scope(),
    );
    await createTask({ leadId: b, title: "Call B", dueAt: "2026-10-08T10:00" }, mgr.actor, await mgr.scope());
    await setStage(b, { stage: "QUALIFIED" }, mgr.actor, await mgr.scope());
    await mergeLeads(a, b, mgr.actor, await mgr.scope());
    const survivor = (await Lead.findById(a).lean())!;
    expect(survivor.email).toBe("dup@example.com");
    expect(survivor.tags).toContain("vip");
    expect(survivor.stage).toBe("QUALIFIED");
    expect(survivor.nextFollowUpAt?.toISOString()).toBe("2026-10-08T06:00:00.000Z");
    expect(String((await Lead.findById(b).lean())!.mergedIntoId)).toBe(a);
    expect(await CrmTask.countDocuments({ leadId: a, status: "TODO" })).toBe(1);
    expect((await listLeads({ view: "all" }, await mgr.scope())).total).toBe(1);
  });

  it("previews and imports a CSV into a project, skipping duplicates and invalid rows", async () => {
    const mgr = await staff("crm_manager");
    const g = await general();
    const csv = [
      "Name,Mobile,Email,Notes",
      "Amy,+971501234567,amy@x.com,hi",
      "Bob,notaphone,,",
      "Cara,,cara@x.com,",
      "Amy Dup,+971501234567,,",
    ].join("\n");
    expect(await previewImport(csv)).toMatchObject({ total: 4, valid: 2, invalid: 1, duplicates: 1 });
    expect(await importLeads(csv, { projectId: g, source: "IMPORT" }, mgr.actor, await mgr.scope())).toEqual({
      created: 2,
      skipped: 1,
      invalid: 1,
    });
    expect(await Lead.countDocuments({ projectId: g })).toBe(2);
    expect(await LeadActivity.countDocuments({ type: "IMPORTED" })).toBe(2);
  });
});

describe("team inside the CRM", () => {
  it("CRM admins manage only CRM roles and pure CRM users; welcome emails point at the right app", async () => {
    const admin = await staff("crm_admin");
    const finance = await staff("finance");
    const created = await createCrmStaff(
      { name: "New Exec", email: `exec-${Date.now()}@edge.test`, roleKeys: ["sales_executive"] },
      admin.actor,
    );
    const welcome = (await NotificationLog.findOne({ userId: created.id, template: "auth.staffWelcome" }).lean())!;
    expect((welcome.payload as { loginUrl: string }).loginUrl).toBe("http://crm.localhost:3002/login");
    await expect(
      createCrmStaff({ name: "Sneaky", email: `sneaky-${Date.now()}@edge.test`, roleKeys: ["admin"] }, admin.actor),
    ).rejects.toBeInstanceOf(BusinessError);
    await expect(
      createCrmStaff({ name: "Mixed", email: `mixed-${Date.now()}@edge.test`, roleKeys: ["sales_executive", "finance"] }, admin.actor),
    ).rejects.toBeInstanceOf(BusinessError);
    const rows = await listCrmStaff();
    expect(rows.map((r) => r.id)).toContain(created.id);
    expect(rows.map((r) => r.id)).not.toContain(finance.id);
    await expect(updateCrmStaff(finance.id, { name: "x", roleKeys: ["sales_executive"] }, admin.actor)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await updateCrmStaff(created.id, { name: "New Exec", roleKeys: ["project_manager"] }, admin.actor);
    expect((await listCrmRoles()).every(isCrmRole)).toBe(true);
    const roleId = await saveCrmRole(
      { name: "Senior exec", permissions: ["crm.access", "crm.read", "crm.write", "admin.access", "payment.read"] },
      admin.actor,
    );
    expect((await Role.findById(roleId).lean())!.permissions).toEqual(["crm.access", "crm.read", "crm.write"]);
    const financeRole = (await Role.findOne({ key: "finance" }).lean())!;
    await expect(
      saveCrmRole({ id: String(financeRole._id), name: "Finance", permissions: ["crm.read"] }, admin.actor),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(loginUrlFor([{ permissions: ["crm.access"] }])).toBe("http://crm.localhost:3002/login");
    expect(loginUrlFor([{ permissions: ["crm.access"] }, { permissions: ["admin.access"] }])).toBe("http://console.localhost:3001/login");
  });

  it("retires the old sales role, moving its members to sales_executive, and seeds the default project once", async () => {
    const [old] = await Role.create([{ key: "sales", name: "Sales", permissions: ["admin.access", "crm.read"], isSystem: true }]);
    const { id } = await createStaff(
      { name: "Legacy", email: `legacy-${Date.now()}@edge.test`, roleKeys: ["sales"], password: "StaffPass!2026" },
      { type: "SYSTEM" },
    );
    await seedBaseData();
    await seedBaseData();
    expect(await Role.exists({ key: "sales" })).toBeNull();
    const repl = (await Role.findOne({ key: "sales_executive" }).lean())!;
    const staffDoc = (await StaffProfile.findById(id).lean())!;
    expect(staffDoc.roleIds.map(String)).toEqual([String(repl._id)]);
    expect(staffDoc.roleIds.map(String)).not.toContain(String(old!._id));
    expect(await Project.countDocuments({ isDefault: true })).toBe(1);
  });
});

describe("jobs", () => {
  it("every schedule has a handler", () => {
    const handlers = allHandlers();
    for (const s of SCHEDULES) expect(handlers[s.queue], s.queue).toBeTypeOf("function");
  });

  it("sends the digest once per assignee per day", async () => {
    const exec = await staff("sales_executive");
    const g = await general();
    await createLead(
      { projectId: g, name: "Digest", phone: "+971504000001", source: "WEBSITE", nextFollowUpAt: "2026-10-06T09:00" },
      exec.actor,
      await exec.scope(),
    );
    await createTask({ projectId: g, title: "Standalone, later", dueAt: "2026-10-20T09:00" }, exec.actor, await exec.scope());
    expect(await runFollowUpDigest()).toEqual({ owners: 1, sent: 1 });
    expect(await runFollowUpDigest()).toEqual({ owners: 1, sent: 0 });
    const log = (await NotificationLog.findOne({ template: "crm.followUpDigest" }).lean())!;
    await deliverEmail(String(log._id));
    expect(sent.at(-1)?.subject).toBe("1 follow-up due today");
    expect(sent.at(-1)?.html).toContain("http://crm.localhost:3002/tasks");
  });

  it("cools stale leads and drives batch urgency inside the lead's project", async () => {
    const mgr = await staff("crm_manager");
    const exec = await staff("sales_executive");
    const P = await createProject({ name: "Urgency", memberIds: [exec.id] }, mgr.actor, await mgr.scope());
    const b1 = await createBatch({ current: false, startDate: new Date("2026-10-25T00:00:00Z"), code: "B-URG" });
    const id = await createLead(
      { projectId: P, name: "Urgent", phone: "+971505000001", source: "WEBSITE", batchInterestId: String(b1._id) },
      exec.actor,
      await exec.scope(),
    );
    freezeClock("2026-10-20T06:00:00Z");
    expect(await runStaleSweep()).toEqual({ cooled: 1 });
    expect(await runStaleSweep()).toEqual({ cooled: 0 });
    expect((await runBatchUrgency()).tasksCreated).toBe(1);
    expect((await runBatchUrgency()).tasksCreated).toBe(0);
    const task = (await CrmTask.findOne({ leadId: id, status: "TODO" }).lean())!;
    expect(task.autoKey).toBe(`batch-urgency:${b1._id}:${id}`);
    expect(String(task.projectId)).toBe(P);
    expect(String(task.assigneeId)).toBe(exec.id);
    await Batch.updateOne({ _id: b1._id }, { $set: { status: "COMPLETED" } });
    const b2 = await createBatch({ current: true, startDate: new Date("2027-01-10T00:00:00Z"), code: "B-NEXT" });
    expect((await runBatchUrgency()).rolled).toBe(1);
    expect(String((await Lead.findById(id).lean())!.batchInterestId)).toBe(String(b2._id));
  });
});

describe("deleting leads", () => {
  it("removes the lead with its activities, tasks, comments and merged duplicates; keeps webhook events unlinked; audits it", async () => {
    const admin = await staff("crm_admin");
    const g = await general();
    const scope = await admin.scope();
    const id = await createLead({ projectId: g, name: "Junk Lead", phone: "+971501110000", source: "WEBSITE" }, admin.actor, scope);
    const dup = await createLead({ projectId: g, name: "Junk Dup", email: "junk@example.com", source: "WEBSITE" }, admin.actor, scope);
    await addActivity(id, { type: "NOTE", body: "spam" }, admin.actor, scope);
    const taskId = await createTask({ leadId: id, title: "Call", type: "CALL" }, admin.actor, scope);
    await addTaskComment(taskId, "no answer", admin.actor, scope);
    await mergeLeads(id, dup, admin.actor, scope);
    await LeadInboundEvent.create({ source: "website", externalEventId: "evt-1", signatureOk: true, leadId: id });
    const keep = await createLead({ projectId: g, name: "Real Lead", phone: "+971502220000", source: "WEBSITE" }, admin.actor, scope);

    expect((await getLeadDetail(id, scope)).can.delete).toBe(true);
    await deleteLead(id, admin.actor, scope);

    expect(await Lead.countDocuments({ _id: { $in: [id, dup] } })).toBe(0);
    expect(await LeadActivity.countDocuments({ leadId: { $in: [id, dup] } })).toBe(0);
    expect(await CrmTask.countDocuments({ _id: taskId })).toBe(0);
    expect(await TaskComment.countDocuments({ taskId })).toBe(0);
    expect((await LeadInboundEvent.findOne({ externalEventId: "evt-1" }).lean())!.leadId).toBeNull();
    expect(await Lead.countDocuments({ _id: keep })).toBe(1);
    const log = (await AuditLog.findOne({ action: "lead.delete", entityId: id }).lean())!;
    expect(log.before).toMatchObject({ name: "Junk Lead", phone: "+971501110000" });
    expect(log.after).toMatchObject({ tasks: 1, mergedLeads: 1 });
    await expect(deleteLead(id, admin.actor, scope)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses leads linked to a student, and bulk delete skips them", async () => {
    const admin = await staff("crm_admin");
    const g = await general();
    const scope = await admin.scope();
    const linked = await createLead(
      { projectId: g, name: "Student Lead", phone: "+971503330000", email: "stud@example.com", source: "WEBSITE" },
      admin.actor,
      scope,
    );
    await convertLeadToStudent(linked, { sendSetPassword: false, actor: admin.actor, scope });
    const a = await createLead({ projectId: g, name: "A", phone: "+971504440000", source: "WEBSITE" }, admin.actor, scope);
    const b = await createLead({ projectId: g, name: "B", phone: "+971505550000", source: "WEBSITE" }, admin.actor, scope);
    await expect(deleteLead(linked, admin.actor, scope)).rejects.toBeInstanceOf(BusinessError);
    expect(await bulkDeleteLeads({ ids: [a, b, linked, "000000000000000000000000"] }, admin.actor, scope)).toEqual({
      deleted: 2,
      skipped: 2,
    });
    expect(await Lead.countDocuments({ _id: linked })).toBe(1);
  });

  it("only admins and CRM admins hold the delete permission", async () => {
    for (const role of ["crm_admin", "admin"] as const)
      expect((await (await staff(role)).scope()).permissions.has("crm.leads.delete")).toBe(true);
    for (const role of ["crm_manager", "project_manager", "sales_executive"] as const) {
      const s = await staff(role);
      const lead = await createLead(
        { projectId: await general(), name: `Lead ${role}`, phone: `+97150${String(Date.now()).slice(-7)}`, source: "WEBSITE" },
        s.actor,
        await s.scope(),
      );
      expect((await s.scope()).permissions.has("crm.leads.delete")).toBe(false);
      expect((await getLeadDetail(lead, await s.scope())).can.delete).toBe(false);
    }
  });
});

describe("temporary staff passwords", () => {
  it("are readable to staff managers while invited, change on reset, and are redacted from the email log once sent", async () => {
    const admin = await staff("admin");
    const { id, tempPassword } = await createStaff(
      { name: "Fresh Mentor", email: `fresh-${Date.now()}@edge.test`, roleKeys: ["mentor"] },
      admin.actor,
    );
    expect(tempPassword).toMatch(/^Edge-/);
    const row = () => listStaff().then((rows) => rows.find((r) => r.id === id)!);
    expect(await row()).toMatchObject({ invited: true, tempPassword });
    expect((await StaffProfile.findById(id).lean())!.tempPasswordEnc).not.toContain(tempPassword!);

    const log = (await NotificationLog.findOne({ userId: id, template: "auth.staffWelcome" }).lean())!;
    await deliverEmail(String(log._id));
    expect(sent.at(-1)?.html).toContain(tempPassword!);
    expect((await NotificationLog.findById(log._id).lean())!.payload).toMatchObject({ tempPassword: "[redacted]" });

    const next = await resetStaffPassword(id, admin.actor);
    expect(next).not.toBe(tempPassword);
    expect((await row()).tempPassword).toBe(next);

    // What the auth hook does once they set their own password.
    await AuthUser.updateOne({ _id: id }, { $set: { mustChangePassword: false } });
    await StaffProfile.updateOne({ _id: id }, { $set: { tempPasswordEnc: null } });
    expect(await row()).toMatchObject({ invited: false, tempPassword: null });
  });

  it("are never exposed for active staff even if a stale value remains", async () => {
    const admin = await staff("admin");
    const { id } = await createStaff({ name: "Old Hand", email: `old-${Date.now()}@edge.test`, roleKeys: ["mentor"] }, admin.actor);
    await AuthUser.updateOne({ _id: id }, { $set: { mustChangePassword: false } });
    expect((await listStaff()).find((r) => r.id === id)!.tempPassword).toBeNull();
  });
});

describe("leads from any country", () => {
  it("never assumes the UAE: local numbers need a country, and the country follows the choice or the number", async () => {
    const exec = await staff("sales_executive");
    const g = await general();
    const scope = await exec.scope();
    await expect(
      createLead({ projectId: g, name: "No Country", phone: "050 999 1111", source: "WEBSITE" }, exec.actor, scope),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const saudi = await createLead(
      { projectId: g, name: "Saudi Local", phone: "050 999 1111", country: "SA", source: "WEBSITE" },
      exec.actor,
      scope,
    );
    expect(await Lead.findById(saudi).lean()).toMatchObject({ phone: "+966509991111", country: "SA" });
    const indian = await createLead({ projectId: g, name: "Ravi", phone: "+91 98765 43210", source: "WEBSITE" }, exec.actor, scope);
    expect((await Lead.findById(indian).lean())!.country).toBe("IN");
    const byEmail = await createLead({ projectId: g, name: "Email Only", email: "far@example.com", source: "WEBSITE" }, exec.actor, scope);
    expect((await Lead.findById(byEmail).lean())!.country).toBeNull();
    const resident = await createLead(
      { projectId: g, name: "Expat", phone: "+91 98765 43299", country: "AE", source: "WEBSITE" },
      exec.actor,
      scope,
    );
    expect((await Lead.findById(resident).lean())!.country).toBe("AE");
  });

  it("imports local numbers with the chosen default country and rejects unknown country codes", async () => {
    const mgr = await staff("crm_manager");
    const g = await general();
    const csv = [
      "name,phone,country",
      "Local UAE,050 777 1234,",
      "Local India,98765 40000,IN",
      "Bad Code,+971507770000,UK",
      "Intl,+447400123456,",
    ].join("\n");
    expect(await previewImport(csv, "AE")).toMatchObject({ valid: 3, invalid: 1 });
    expect(await previewImport(csv)).toMatchObject({ valid: 2, invalid: 2 });
    expect(await importLeads(csv, { projectId: g, source: "IMPORT", defaultCountry: "AE" }, mgr.actor, await mgr.scope())).toEqual({
      created: 3,
      skipped: 0,
      invalid: 1,
    });
    expect(await Lead.findOne({ name: "Local India" }).lean()).toMatchObject({ phone: "+919876540000", country: "IN" });
    expect((await Lead.findOne({ name: "Intl" }).lean())!.country).toBe("GB");
  });
});

describe("pagination and bulk actions", () => {
  async function seedLeads(n: number, projectId: string, actor: { type: "USER"; id: string }, scope: CrmScope) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++)
      ids.push(
        await createLead(
          { projectId, name: `Bulk ${String(i).padStart(3, "0")}`, email: `bulk${i}-${Date.now()}@example.com`, source: "IMPORT" },
          actor,
          scope,
        ),
      );
    return ids;
  }

  it("pages leads without repeats, clamps past the end, and reports the total", async () => {
    const admin = await staff("crm_admin");
    const scope = await admin.scope();
    await seedLeads(30, await general(), admin.actor, scope);
    const p1 = await listLeads({ view: "all", sort: "name", page: 1, pageSize: 25 }, scope);
    const p2 = await listLeads({ view: "all", sort: "name", page: 2, pageSize: 25 }, scope);
    expect(p1).toMatchObject({ total: 30, page: 1, pageSize: 25 });
    expect(p1.rows).toHaveLength(25);
    expect(p2.rows).toHaveLength(5);
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(30);
    expect((await listLeads({ view: "all", page: 99, pageSize: 25 }, scope)).page).toBe(2);
  });

  it("round-robin shares leads evenly across the project's sales executives only, and General uses every sales executive", async () => {
    const admin = await staff("crm_admin");
    const [a, b, c] = [await staff("sales_executive"), await staff("sales_executive"), await staff("sales_executive")];
    const pm = await staff("project_manager");
    const projectId = await createProject(
      { name: "RR Drive", code: `RR${Date.now() % 100000}`, managerIds: [pm.id], memberIds: [a.id, b.id, c.id] },
      admin.actor,
      await admin.scope(),
    );
    const scope = await admin.scope();
    const ids = await seedLeads(10, projectId, admin.actor, scope);
    expect(await bulkAssignLeads({ ids }, "ROUND_ROBIN", admin.actor, scope)).toEqual({ updated: 10, skipped: 0 });
    const counts = await Lead.aggregate<{ _id: unknown; n: number }>([
      { $match: { projectId: new Types.ObjectId(projectId) } },
      { $group: { _id: "$ownerId", n: { $sum: 1 } } },
    ]);
    expect(counts.map((x) => x.n).sort()).toEqual([3, 3, 4]);
    expect(counts.map((x) => String(x._id))).not.toContain(pm.id);

    // A project with no sales executives: nothing to share with, so the leads are skipped.
    const empty = await createProject(
      { name: "Nobody", code: `NB${Date.now() % 100000}`, managerIds: [pm.id] },
      admin.actor,
      await admin.scope(),
    );
    const lonely = await seedLeads(2, empty, admin.actor, await admin.scope());
    expect(await bulkAssignLeads({ ids: lonely }, "ROUND_ROBIN", admin.actor, await admin.scope())).toEqual({ updated: 0, skipped: 2 });

    // General is open to everyone: every active sales executive (here a, b, c and the seeded demo desk) takes part.
    const general_ = await getDefaultProject();
    const execs = await salesExecutivesFor(general_);
    expect(execs.map((e) => e.id)).toEqual(expect.arrayContaining([a.id, b.id, c.id]));
    expect(execs.map((e) => e.id)).not.toContain(pm.id);
    expect(execs.map((e) => e.id)).not.toContain(admin.id);
  });

  it("bulk actions by filter touch exactly the leads the list shows", async () => {
    const admin = await staff("crm_admin");
    const scope = await admin.scope();
    const g = await general();
    await seedLeads(12, g, admin.actor, scope);
    await createLead({ projectId: g, name: "Keep Me", email: `keep-${Date.now()}@example.com`, source: "WEBSITE" }, admin.actor, scope);
    const filters = { q: "Bulk", view: "all" as const };
    expect((await listLeads(filters, scope)).total).toBe(12);
    expect(await bulkDeleteLeads({ filters }, admin.actor, scope)).toEqual({ deleted: 12, skipped: 0 });
    expect(await Lead.countDocuments({ name: /^Bulk/ })).toBe(0);
    expect(await Lead.countDocuments({ name: "Keep Me" })).toBe(1);
  });

  it("imports round-robin and refuses it for a project without sales executives", async () => {
    const admin = await staff("crm_admin");
    const [a, b] = [await staff("sales_executive"), await staff("sales_executive")];
    const projectId = await createProject(
      { name: "Import RR", code: `IR${Date.now() % 100000}`, memberIds: [a.id, b.id] },
      admin.actor,
      await admin.scope(),
    );
    const csv = ["name,email", ...Array.from({ length: 6 }, (_, i) => `Imp ${i},imp${i}-${Date.now()}@example.com`)].join("\n");
    expect(
      (await importLeads(csv, { projectId, source: "IMPORT", ownerId: "ROUND_ROBIN" }, admin.actor, await admin.scope())).created,
    ).toBe(6);
    const counts = await Lead.aggregate<{ _id: unknown; n: number }>([
      { $match: { projectId: new Types.ObjectId(projectId) } },
      { $group: { _id: "$ownerId", n: { $sum: 1 } } },
    ]);
    expect(counts.map((x) => x.n)).toEqual([3, 3]);
    const none = await createProject({ name: "Import None", code: `IN${Date.now() % 100000}` }, admin.actor, await admin.scope());
    await expect(
      importLeads(csv, { projectId: none, source: "IMPORT", ownerId: "ROUND_ROBIN" }, admin.actor, await admin.scope()),
    ).rejects.toBeInstanceOf(BusinessError);
  });
});
