import { AuditLog, AuthSession, AuthUser, CrmDevice, Lead, NotificationLog, Project, StaffProfile } from "@edge/db";
import { createStaff, setStaffDisabled } from "@edge/services";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CONSOLE, closeTestDb, CRM, INTERNAL, producer, resetDb, startApi } from "./helpers";

// A file of its own: the auth rate limit is per app instance and these tests sign in a lot.
let app: Awaited<ReturnType<typeof startApi>>["app"];
beforeAll(async () => {
  ({ app } = await startApi());
});
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  producer.take();
});

const PASSWORD = "StaffPass!2026";
let seq = 0;
async function person(role: string) {
  seq += 1;
  const email = `${role}-${seq}-${Date.now()}@edge.test`;
  const { id } = await createStaff({ name: `${role} ${seq}`, email, roleKeys: [role], password: PASSWORD }, { type: "SYSTEM" });
  return { id, email };
}
async function signIn(email: string, where: "crm" | "console", password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/v1/auth/sign-in")
    .set("Origin", where === "crm" ? CRM : CONSOLE)
    .send({ identifier: email, password, app: where });
  return { agent, status: res.status };
}
async function staffAgent(role: string, where: "crm" | "console" = "crm") {
  const p = await person(role);
  const { agent, status } = await signIn(p.email, where);
  expect(status).toBe(200);
  return { agent, ...p };
}
const system = { type: "SYSTEM" } as const;

describe("deleting staff accounts", () => {
  it("CRM admins delete an unused, disabled CRM account; everything that names it blocks", async () => {
    const admin = await staffAgent("crm_admin");
    const exec = await person("sales_executive");
    const project = await Project.create({ name: "Spring", code: "SPRING", memberIds: [exec.id], roundRobinLastId: exec.id });
    await CrmDevice.create({ userId: exec.id, tokenHash: `hash-${exec.id}` });

    // Not disabled yet: the check names it and the delete is refused.
    const check = await admin.agent.get(`/api/v1/records/crmStaff/${exec.id}/delete-check`).set(INTERNAL).expect(200);
    expect(check.body.blockers.map((b: { message: string }) => b.message)).toContain(
      "Disable the account first, so nothing new reaches them while you delete it",
    );
    expect(check.body.removes).toContain("1 project team place");
    await admin.agent.post(`/api/v1/records/crmStaff/${exec.id}/delete`).set(INTERNAL).send({ confirm: "DELETE" }).expect(422);

    await setStaffDisabled(exec.id, true, { type: "USER", id: admin.id });
    // A lead they own blocks.
    const lead = await Lead.create({ projectId: project._id, name: "Owned", source: "WEBSITE", ownerId: exec.id });
    const blocked = await admin.agent.get(`/api/v1/records/crmStaff/${exec.id}/delete-check`).set(INTERNAL).expect(200);
    expect(blocked.body.blockers).toEqual([
      expect.objectContaining({
        message: "1 lead they own, converted or created",
        href: expect.stringContaining(`/leads?owner=${exec.id}`),
      }),
    ]);
    await Lead.deleteOne({ _id: lead._id });

    // The typed confirmation is required by the API too.
    await admin.agent.post(`/api/v1/records/crmStaff/${exec.id}/delete`).set(INTERNAL).send({}).expect(400);
    const res = await admin.agent.post(`/api/v1/records/crmStaff/${exec.id}/delete`).set(INTERNAL).send({ confirm: "DELETE" }).expect(200);
    expect(res.body.message).toMatch(/account deleted/);
    expect(await AuthUser.exists({ _id: exec.id })).toBeNull();
    expect(await StaffProfile.exists({ _id: exec.id })).toBeNull();
    expect(await CrmDevice.countDocuments({ userId: exec.id })).toBe(0);
    const p = await Project.findById(project._id).lean();
    expect(p!.memberIds.map(String)).not.toContain(exec.id);
    expect(p!.roundRobinLastId).toBeNull();
    const entry = await AuditLog.findOne({ action: "staff.delete", entityId: exec.id }).lean();
    expect(entry!.before).toMatchObject({ user: { email: exec.email }, roles: ["sales_executive"] });
    expect(JSON.stringify(entry!.before)).not.toContain("tempPasswordEnc");
  });

  it("keeps CRM staff managers to pure CRM accounts and denies everyone else", async () => {
    const admin = await staffAgent("crm_admin");
    const manager = await staffAgent("crm_manager");
    const mentor = await person("mentor");
    const exec = await person("sales_executive");
    await manager.agent.get(`/api/v1/records/crmStaff/${exec.id}/delete-check`).set(INTERNAL).expect(403);
    // Console staff can't be found from the CRM at all.
    await admin.agent.get(`/api/v1/records/crmStaff/${mentor.id}/delete-check`).set(INTERNAL).expect(404);
    // Nor can CRM admins use the console type or super-admin-only types.
    await admin.agent.get(`/api/v1/records/staff/${exec.id}/delete-check`).set(INTERNAL).expect(403);
    await admin.agent.get(`/api/v1/records/task/${exec.id}/delete-check`).set(INTERNAL).expect(403);
    // You can't delete yourself.
    const self = await admin.agent.get(`/api/v1/records/crmStaff/${admin.id}/delete-check`).set(INTERNAL).expect(200);
    expect(self.body.blockers.map((b: { message: string }) => b.message)).toContain("You can't delete your own account");
  });

  it("console staff managers can't delete a super admin, and the last super admin always stays", async () => {
    const admin = await staffAgent("admin", "console");
    const boss = await staffAgent("super_admin", "console");
    const other = await person("super_admin");
    await setStaffDisabled(other.id, true, { type: "USER", id: boss.id });
    const byAdmin = await admin.agent.get(`/api/v1/records/staff/${other.id}/delete-check`).set(INTERNAL).expect(200);
    expect(byAdmin.body.blockers.map((b: { message: string }) => b.message)).toContain("Only a super admin can delete another super admin");
    const byBoss = await boss.agent.get(`/api/v1/records/staff/${other.id}/delete-check`).set(INTERNAL).expect(200);
    expect(byBoss.body.blockers).toEqual([]);
    await boss.agent.post(`/api/v1/records/staff/${other.id}/delete`).set(INTERNAL).send({ confirm: "delete" }).expect(400);
    await boss.agent.post(`/api/v1/records/staff/${other.id}/delete`).set(INTERNAL).send({ confirm: "DELETE" }).expect(200);
    // Admins hold staff.manage but not records.delete.
    await admin.agent.get(`/api/v1/records/role/${other.id}/delete-check`).set(INTERNAL).expect(403);
  });

  it("names deleted people as Deleted user", async () => {
    const boss = await staffAgent("super_admin", "console");
    const gone = await person("mentor");
    await AuditLog.create({ actorType: "USER", actorId: gone.id, action: "test.thing", entityType: "Test", entityId: "1" });
    await setStaffDisabled(gone.id, true, { type: "USER", id: boss.id });
    await boss.agent.post(`/api/v1/records/staff/${gone.id}/delete`).set(INTERNAL).send({ confirm: "DELETE" }).expect(200);
    const audit = await boss.agent.get("/api/v1/admin/audit").query({ q: "test.thing" }).set(INTERNAL).expect(200);
    expect(audit.body.rows[0].actor).toBe("Deleted user");
    // The audit list never hands out the deleted record's copy.
    const all = await boss.agent.get("/api/v1/admin/audit").query({ q: "staff.delete" }).set(INTERNAL).expect(200);
    expect(all.body.rows.length).toBe(1);
    expect(all.body.rows[0]).not.toHaveProperty("before");
  });
});

describe("changing a staff member's sign-in email", () => {
  it("a CRM admin changes a CRM account's email; the new one signs in and the old one doesn't", async () => {
    const admin = await staffAgent("crm_admin");
    const exec = await staffAgent("sales_executive");
    const sessionsBefore = await AuthSession.countDocuments({ userId: exec.id });
    const next = `renamed-${Date.now()}@edge.test`;
    const res = await admin.agent
      .post(`/api/v1/crm/team/${exec.id}/email`)
      .set(INTERNAL)
      .send({ email: ` ${next.toUpperCase()} ` })
      .expect(200);
    expect(res.body.message).toContain(next);
    expect((await AuthUser.findById(exec.id).lean())!.email).toBe(next);
    // Still signed in.
    expect(await AuthSession.countDocuments({ userId: exec.id })).toBe(sessionsBefore);
    await exec.agent.get("/api/v1/me").set(INTERNAL).expect(200);
    // Both addresses hear about it; the old one only sees the new address masked.
    const mails = await NotificationLog.find({ template: "auth.emailChanged" }).lean();
    expect(mails.map((m) => m.to).sort()).toEqual([exec.email, next].sort());
    const toOld = mails.find((m) => m.to === exec.email)!;
    expect((toOld.payload as { newEmail: string }).newEmail).toMatch(/^r\*\*\*@edge\.test$/);
    expect((await signIn(exec.email, "crm")).status).not.toBe(200);
    expect((await signIn(next, "crm")).status).toBe(200);
    // The same address again, or someone else's, is refused.
    await admin.agent.post(`/api/v1/crm/team/${exec.id}/email`).set(INTERNAL).send({ email: next }).expect(400);
    await admin.agent.post(`/api/v1/crm/team/${exec.id}/email`).set(INTERNAL).send({ email: admin.email }).expect(400);
    const audit = await AuditLog.findOne({ action: "staff.email.change", entityId: exec.id }).lean();
    expect(audit).toMatchObject({ before: { email: exec.email }, after: { email: next } });
  });

  it("re-sends the invitation when the person never signed in", async () => {
    const admin = await staffAgent("crm_admin");
    const { id } = await createStaff({ name: "New Hire", email: `typo-${Date.now()}@edge.test`, roleKeys: ["sales_executive"] }, system);
    const fixed = `fixed-${Date.now()}@edge.test`;
    await admin.agent.post(`/api/v1/crm/team/${id}/email`).set(INTERNAL).send({ email: fixed }).expect(200);
    const welcomes = await NotificationLog.find({ template: "auth.staffWelcome" }).sort({ createdAt: 1 }).lean();
    expect(welcomes.at(-1)!.to).toBe(fixed);
    expect(await NotificationLog.countDocuments({ template: "auth.emailChanged" })).toBe(0);
  });

  it("only a super admin changes a super admin's email; the CRM can't reach console accounts", async () => {
    const admin = await staffAgent("admin", "console");
    const crmAdmin = await staffAgent("crm_admin");
    const boss = await person("super_admin");
    const mentor = await person("mentor");
    await admin.agent.post(`/api/v1/admin/staff/${boss.id}/email`).set(INTERNAL).send({ email: "boss2@edge.test" }).expect(422);
    await admin.agent
      .post(`/api/v1/admin/staff/${mentor.id}/email`)
      .set(INTERNAL)
      .send({ email: `m-${Date.now()}@edge.test` })
      .expect(200);
    await crmAdmin.agent.post(`/api/v1/crm/team/${boss.id}/email`).set(INTERNAL).send({ email: "boss3@edge.test" }).expect(404);
  });
});
