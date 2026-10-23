import { createHmac } from "node:crypto";
import { AuthUser, Enrollment, Lead, NotificationLog, Role } from "@edge/db";
import { allHandlers, createStaff } from "@edge/services";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CONSOLE, closeTestDb, createCurrentBatch, CRM, INTERNAL, newStudent, producer, resetDb, startApi, STUDENT } from "./helpers";

let app: Awaited<ReturnType<typeof startApi>>["app"];
beforeAll(async () => {
  ({ app } = await startApi());
});
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  producer.take();
});

let seq = 0;
async function staffAgent(role: string, app_: "crm" | "console" = "crm") {
  seq += 1;
  const email = `${role}-${seq}-${Date.now()}@edge.test`;
  const { id } = await createStaff({ name: `${role} ${seq}`, email, roleKeys: [role], password: "StaffPass!2026" }, { type: "SYSTEM" });
  const agent = request.agent(app);
  const origin = app_ === "crm" ? CRM : CONSOLE;
  await agent.post("/api/v1/auth/sign-in").set("Origin", origin).send({ identifier: email, password: "StaffPass!2026", app: app_ }).expect(200);
  return { agent, id, email };
}

const sign = (body: string) => createHmac("sha256", "test-lead-webhook-secret-0123").update(body).digest("hex");
const generalId = async (agent: ReturnType<typeof request.agent>) => (await agent.get("/api/v1/crm/options").set(INTERNAL).expect(200)).body.projects.find((p: { isDefault: boolean }) => p.isDefault).id as string;

describe("CRM API", () => {
  it("routes each account to the right app", async () => {
    const execEmail = `exec-${Date.now()}@edge.test`;
    await createStaff({ name: "Exec", email: execEmail, roleKeys: ["sales_executive"], password: "StaffPass!2026" }, { type: "SYSTEM" });
    const wrong = await request(app).post("/api/v1/auth/sign-in").set("Origin", CONSOLE).send({ identifier: execEmail, password: "StaffPass!2026", app: "console" }).expect(403);
    expect(wrong.body.error.message).toContain("http://crm.localhost:3002");
    const right = await request(app).post("/api/v1/auth/sign-in").set("Origin", CRM).send({ identifier: execEmail, password: "StaffPass!2026", app: "crm" }).expect(200);
    expect(right.body.home).toBe("/");
    const financeEmail = `fin-${Date.now()}@edge.test`;
    await createStaff({ name: "Fin", email: financeEmail, roleKeys: ["finance"], password: "StaffPass!2026" }, { type: "SYSTEM" });
    const noCrm = await request(app).post("/api/v1/auth/sign-in").set("Origin", CRM).send({ identifier: financeEmail, password: "StaffPass!2026", app: "crm" }).expect(403);
    expect(noCrm.body.error.message).toContain("http://console.localhost:3001");
    const admin = await staffAgent("super_admin", "crm");
    expect((await admin.agent.get("/api/v1/me").set(INTERNAL).expect(200)).body.homes).toMatchObject({ console: "/admin", crm: "/" });
  });

  it("password reset links come back to the app the request came from", async () => {
    const exec = await staffAgent("sales_executive");
    await request(app).post("/api/auth/request-password-reset").set("Origin", CRM).set("x-forwarded-host", "crm.localhost:3002").set("x-forwarded-proto", "http").send({ email: exec.email, redirectTo: "/reset-password" }).expect(200);
    const log = (await NotificationLog.findOne({ template: "auth.resetPassword", to: exec.email }).lean())!;
    expect((log.payload as { url: string }).url.startsWith("http://crm.localhost:3002/")).toBe(true);
  });

  it("enforces permissions and project scoping", async () => {
    await staffAgent("finance", "console").then(({ agent }) => agent.get("/api/v1/crm/leads").set(INTERNAL).expect(403));
    const a = await staffAgent("sales_executive");
    const b = await staffAgent("sales_executive");
    const mgr = await staffAgent("crm_manager");
    const g = await generalId(a.agent);
    const created = await a.agent.post("/api/v1/crm/leads").set(INTERNAL).send({ projectId: g, name: "Scoped Lead", phone: "+971501230001", source: "INSTAGRAM" }).expect(200);
    const id = created.body.id as string;
    await a.agent.get(`/api/v1/crm/leads/${id}`).set(INTERNAL).expect(200);
    await b.agent.get(`/api/v1/crm/leads/${id}`).set(INTERNAL).expect(404);
    await mgr.agent.get(`/api/v1/crm/leads/${id}`).set(INTERNAL).expect(200);
    expect((await a.agent.get("/api/v1/crm/dashboard").set(INTERNAL).expect(200)).body.scopeAll).toBe(false);
    expect((await mgr.agent.get("/api/v1/crm/dashboard").set(INTERNAL).expect(200)).body.scopeAll).toBe(true);

    await a.agent.post(`/api/v1/crm/leads/${id}/assign`).set(INTERNAL).send({ ownerId: b.id }).expect(403); // no crm.assign
    await mgr.agent.post(`/api/v1/crm/leads/${id}/assign`).set(INTERNAL).send({ ownerId: b.id }).expect(200);
    await a.agent.get(`/api/v1/crm/leads/${id}`).set(INTERNAL).expect(404);
    await b.agent.post(`/api/v1/crm/leads/${id}/activities`).set(INTERNAL).send({ type: "CALL", body: "Answered", outcome: "ANSWERED", nextFollowUpAt: "2026-12-01T10:00" }).expect(200);
    const detail = await b.agent.get(`/api/v1/crm/leads/${id}`).set(INTERNAL).expect(200);
    expect(detail.body.lead.stage).toBe("CONTACTED");
    expect(detail.body.tasks).toHaveLength(1);
    const bad = await b.agent.post(`/api/v1/crm/leads/${id}/stage`).set(INTERNAL).send({ stage: "LOST" }).expect(400);
    expect(bad.body.error.fieldErrors.lostReason).toBeDefined();
    await b.agent.post(`/api/v1/crm/leads/${id}/stage`).set(INTERNAL).send({ stage: "CONVERTED" }).expect(409);

    // a project manager only sees their project
    const pm = await staffAgent("project_manager");
    const project = await mgr.agent.post("/api/v1/crm/projects").set(INTERNAL).send({ name: "Nov drive", managerIds: [pm.id], memberIds: [a.id] }).expect(200);
    await pm.agent.post("/api/v1/crm/projects").set(INTERNAL).send({ name: "Nope" }).expect(403);
    const inP = await pm.agent.post("/api/v1/crm/leads").set(INTERNAL).send({ projectId: project.body.id, name: "In project", phone: "+971501230002", source: "WEBSITE", ownerId: "" }).expect(200);
    await pm.agent.get(`/api/v1/crm/leads/${id}`).set(INTERNAL).expect(404); // general-project lead owned by b
    await a.agent.post(`/api/v1/crm/leads/${inP.body.id}/claim`).set(INTERNAL).expect(200);
    await b.agent.get(`/api/v1/crm/leads/${inP.body.id}`).set(INTERNAL).expect(404);
    const projects = await a.agent.get("/api/v1/crm/projects").set(INTERNAL).expect(200);
    expect(projects.body.map((p: { code: string }) => p.code).sort()).toEqual(["GENERAL", "NOV-DRIVE"]);

    const csv = await mgr.agent.get("/api/v1/crm/leads.csv").query({ view: "all" }).set(INTERNAL).expect(200);
    expect(csv.text).toContain("Scoped Lead");
    await mgr.agent.post("/api/v1/crm/bulk-assign").set(INTERNAL).send({ ids: [id], ownerId: "" }).expect(200);
    await a.agent.get("/api/v1/crm/settings").set(INTERNAL).expect(403);
    await mgr.agent.get("/api/v1/crm/settings").set(INTERNAL).expect(200);
  });

  it("works the task board", async () => {
    const pm = await staffAgent("crm_manager");
    const g = await generalId(pm.agent);
    const t1 = await pm.agent.post("/api/v1/crm/tasks").set(INTERNAL).send({ projectId: g, title: "Prepare deck", priority: "HIGH" }).expect(200);
    const t2 = await pm.agent.post("/api/v1/crm/tasks").set(INTERNAL).send({ projectId: g, title: "Call list", dueAt: "2026-12-01T10:00" }).expect(200);
    await pm.agent.post(`/api/v1/crm/tasks/${t1.body.id}/move`).set(INTERNAL).send({ status: "IN_PROGRESS", orderedIds: [t1.body.id] }).expect(200);
    const board = await pm.agent.get("/api/v1/crm/board").set(INTERNAL).expect(200);
    expect(board.body.IN_PROGRESS.map((t: { id: string }) => t.id)).toEqual([t1.body.id]);
    expect(board.body.TODO.map((t: { id: string }) => t.id)).toEqual([t2.body.id]);
    await pm.agent.post(`/api/v1/crm/tasks/${t1.body.id}/comments`).set(INTERNAL).send({ body: "Half done" }).expect(200);
    const detail = await pm.agent.get(`/api/v1/crm/tasks/${t1.body.id}`).set(INTERNAL).expect(200);
    expect(detail.body.task.status).toBe("IN_PROGRESS");
    expect(detail.body.comments).toHaveLength(1);
    expect((await pm.agent.get("/api/v1/crm/tasks/count").set(INTERNAL).expect(200)).body.count).toBe(0);
  });

  it("CRM admins manage CRM staff and roles only", async () => {
    const admin = await staffAgent("crm_admin");
    const finance = await staffAgent("finance", "console");
    const created = await admin.agent.post("/api/v1/crm/team").set(INTERNAL).send({ name: "New Exec", email: `newexec-${Date.now()}@edge.test`, roleKeys: ["sales_executive"] }).expect(200);
    expect(created.body.tempPassword).toMatch(/^Edge-/);
    await admin.agent.post("/api/v1/crm/team").set(INTERNAL).send({ name: "Sneaky", email: `sneaky-${Date.now()}@edge.test`, roleKeys: ["admin"] }).expect(422);
    const team = await admin.agent.get("/api/v1/crm/team").set(INTERNAL).expect(200);
    expect(team.body.map((r: { id: string }) => r.id)).toContain(created.body.id);
    expect(team.body.map((r: { id: string }) => r.id)).not.toContain(finance.id);
    await admin.agent.get(`/api/v1/crm/team/${finance.id}`).set(INTERNAL).expect(404);
    await admin.agent.post(`/api/v1/crm/team/${finance.id}`).set(INTERNAL).send({ name: "Finance Person", roleKeys: ["sales_executive"] }).expect(404);
    const roles = await admin.agent.get("/api/v1/crm/roles").set(INTERNAL).expect(200);
    expect(roles.body.map((r: { key: string }) => r.key).sort()).toEqual(["crm_admin", "crm_manager", "project_manager", "sales_executive"]);
    const saved = await admin.agent.post("/api/v1/crm/roles").set(INTERNAL).send({ name: "Senior exec", permissions: ["crm.access", "crm.read", "admin.access"] }).expect(200);
    expect((await Role.findById(saved.body.id).lean())!.permissions).toEqual(["crm.access", "crm.read"]);
    const mgr = await staffAgent("crm_manager");
    await mgr.agent.get("/api/v1/crm/team").set(INTERNAL).expect(403);
  });

  it("converts a lead into a student who sets a password, signs in, verifies the phone and lands in the batch", async () => {
    const batch = await createCurrentBatch();
    const mgr = await staffAgent("crm_manager");
    const g = await generalId(mgr.agent);
    const s = newStudent();
    const lead = await mgr.agent.post("/api/v1/crm/leads").set(INTERNAL).send({ projectId: g, name: "Convert Me", phone: s.phone, email: s.email, source: "WEBSITE" }).expect(200);
    const conv = await mgr.agent.post(`/api/v1/crm/leads/${lead.body.id}/convert`).set(INTERNAL).send({ batchId: String(batch._id), sendSetPassword: true }).expect(200);
    const studentId = conv.body.studentId as string;
    await mgr.agent.post(`/api/v1/crm/leads/${lead.body.id}/convert`).set(INTERNAL).send({}).expect(409);

    const mail = await request(app).get("/api/dev/last-email").query({ to: s.email }).expect(200);
    expect(mail.body.template).toBe("crm.studentWelcome");
    const token = new URL(mail.body.payload.setPasswordUrl).searchParams.get("token")!;
    const student = request.agent(app);
    await student.post("/api/auth/reset-password").set("Origin", STUDENT).send({ token, newPassword: "NewPass!2026" }).expect(200);
    const signIn = await student.post("/api/v1/auth/sign-in").set("Origin", STUDENT).send({ identifier: s.email, password: "NewPass!2026", app: "student" }).expect(200);
    expect(signIn.body.home).toBe("/verify-phone");
    await student.post("/api/v1/auth/phone/resend").set("Origin", STUDENT).send({ channel: "sms" }).expect(200);
    expect((await student.post("/api/v1/auth/phone/verify").set("Origin", STUDENT).send({ code: "000000" }).expect(200)).body.home).toBe("/dashboard");
    expect((await AuthUser.findById(studentId).lean())!.phoneNumber).toBe(s.phone);
    const e = (await Enrollment.findOne({ studentId }).lean())!;
    expect(e.source).toBe("CRM_CONVERTED");

    const admissions = await staffAgent("admissions", "console");
    const studentDetail = await admissions.agent.get(`/api/v1/admin/students/${studentId}`).set(INTERNAL).expect(200);
    expect(studentDetail.body.lead).toMatchObject({ id: lead.body.id, href: `http://crm.localhost:3002/leads/${lead.body.id}`, projectName: "General" });
  });

  it("auto-links a lead when a matching person signs up on the portal", async () => {
    await createCurrentBatch();
    const mgr = await staffAgent("crm_manager");
    const g = await generalId(mgr.agent);
    const s = newStudent();
    const lead = await mgr.agent.post("/api/v1/crm/leads").set(INTERNAL).send({ projectId: g, name: "Self Signup", phone: s.phone, source: "INSTAGRAM" }).expect(200);
    producer.take();
    await request(app).post("/api/v1/auth/student-signup").set("Origin", STUDENT).send(s).expect(200);
    const job = producer.take().find((j) => j.queue === "crm.autoLink");
    expect(job).toBeDefined();
    expect(await allHandlers()["crm.autoLink"]!(job!.data as never)).toMatchObject({ linked: true, leadId: lead.body.id });
    expect((await Lead.findById(lead.body.id).lean())!.stage).toBe("CONVERTED");
  });

  it("accepts signed website submissions and rejects the rest", async () => {
    await staffAgent("crm_manager");
    const body = JSON.stringify({ id: "web-1", name: "Site Visitor", phone: "+971509090909", message: "Call me" });
    await request(app).post("/api/webhooks/leads/website").set("content-type", "application/json").set("x-edge-signature", "bad").send(body).expect(401);
    const ok = await request(app).post("/api/webhooks/leads/website").set("content-type", "application/json").set("x-edge-signature", sign(body)).send(body).expect(200);
    expect(ok.body.leadId).toBeTruthy();
    expect((await request(app).post("/api/webhooks/leads/website").set("content-type", "application/json").set("x-edge-signature", sign(body)).send(body).expect(200)).body.duplicate).toBe(true);
    await request(app).post("/api/webhooks/leads/unknown").set("content-type", "application/json").set("x-edge-signature", sign(body)).send(body).expect(404);
    await request(app).post("/api/webhooks/nope").set("content-type", "application/json").send("{}").expect(404);
    let last = 200;
    for (let i = 0; i < 25 && last !== 429; i++) last = (await request(app).post("/api/webhooks/leads/website").set("content-type", "application/json").send(body)).status;
    expect(last).toBe(429);
  });
});
