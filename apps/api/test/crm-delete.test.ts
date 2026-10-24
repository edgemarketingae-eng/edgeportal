import { Lead, NotificationLog, StaffProfile } from "@edge/db";
import { createStaff } from "@edge/services";
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

let seq = 0;
async function staffAgent(role: string, app_: "crm" | "console" = "crm") {
  seq += 1;
  const email = `${role}-${seq}-${Date.now()}@edge.test`;
  const { id } = await createStaff({ name: `${role} ${seq}`, email, roleKeys: [role], password: "StaffPass!2026" }, { type: "SYSTEM" });
  const agent = request.agent(app);
  await agent
    .post("/api/v1/auth/sign-in")
    .set("Origin", app_ === "crm" ? CRM : CONSOLE)
    .send({ identifier: email, password: "StaffPass!2026", app: app_ })
    .expect(200);
  return { agent, id, email };
}

const generalId = async (agent: ReturnType<typeof request.agent>) =>
  (await agent.get("/api/v1/crm/options").set(INTERNAL).expect(200)).body.projects.find((p: { isDefault: boolean }) => p.isDefault)
    .id as string;

describe("deleting leads and temporary passwords", () => {
  it("only admins and CRM admins delete leads", async () => {
    const exec = await staffAgent("sales_executive");
    const g = await generalId(exec.agent);
    const mk = async (phone: string) =>
      (
        await exec.agent
          .post("/api/v1/crm/leads")
          .set(INTERNAL)
          .send({ projectId: g, name: `Delete ${phone}`, phone, source: "WEBSITE" })
          .expect(200)
      ).body.id as string;
    const one = await mk("+971501239001");
    const two = await mk("+971501239002");
    const three = await mk("+971501239003");
    for (const role of ["sales_executive", "project_manager", "crm_manager"]) {
      const { agent } = await staffAgent(role);
      await agent.post(`/api/v1/crm/leads/${one}/delete`).set(INTERNAL).expect(403);
      await agent
        .post("/api/v1/crm/bulk-delete")
        .set(INTERNAL)
        .send({ ids: [one] })
        .expect(403);
    }
    const crmAdmin = await staffAgent("crm_admin");
    expect((await crmAdmin.agent.get(`/api/v1/crm/leads/${one}`).set(INTERNAL).expect(200)).body.can.delete).toBe(true);
    await crmAdmin.agent.post(`/api/v1/crm/leads/${one}/delete`).set(INTERNAL).expect(200);
    await crmAdmin.agent.get(`/api/v1/crm/leads/${one}`).set(INTERNAL).expect(404);
    const admin = await staffAgent("admin", "crm");
    expect(
      (
        await admin.agent
          .post("/api/v1/crm/bulk-delete")
          .set(INTERNAL)
          .send({ ids: [two, three] })
          .expect(200)
      ).body,
    ).toMatchObject({ deleted: 2, skipped: 0 });
    expect(await Lead.countDocuments({ _id: { $in: [one, two, three] } })).toBe(0);
  });

  it("shows an invited person's temporary password to staff managers until they set their own", async () => {
    const crmAdmin = await staffAgent("crm_admin");
    const email = `invite-${Date.now()}@edge.test`;
    const created = await crmAdmin.agent
      .post("/api/v1/crm/team")
      .set(INTERNAL)
      .send({ name: "Invited Exec", email, roleKeys: ["sales_executive"], projectIds: [] })
      .expect(200);
    const id = created.body.id as string;
    const temp = created.body.tempPassword as string;
    const row = async () =>
      (
        (await crmAdmin.agent.get("/api/v1/crm/team").set(INTERNAL).expect(200)).body as {
          id: string;
          invited: boolean;
          tempPassword: string | null;
        }[]
      ).find((r) => r.id === id)!;
    expect(await row()).toMatchObject({ invited: true, tempPassword: temp });
    const consoleAdmin = await staffAgent("admin", "console");
    expect(
      ((await consoleAdmin.agent.get(`/api/v1/admin/staff/${id}`).set(INTERNAL).expect(200)).body as { tempPassword: string }).tempPassword,
    ).toBe(temp);
    // Lower roles cannot list staff at all.
    await (await staffAgent("crm_manager")).agent.get("/api/v1/crm/team").set(INTERNAL).expect(403);

    const person = request.agent(app);
    await person.post("/api/v1/auth/sign-in").set("Origin", CRM).send({ identifier: email, password: temp, app: "crm" }).expect(200);
    await person
      .post("/api/auth/change-password")
      .set("Origin", CRM)
      .send({ currentPassword: temp, newPassword: "MyOwnPass!2026" })
      .expect(200);
    expect(await row()).toMatchObject({ invited: false, tempPassword: null });
    expect((await StaffProfile.findById(id).lean())!.tempPasswordEnc).toBeNull();

    // A reset puts a new one in place; a self-service email reset clears it again.
    const reset = await crmAdmin.agent.post(`/api/v1/crm/team/${id}/reset-password`).set(INTERNAL).expect(200);
    expect(await row()).toMatchObject({ invited: true, tempPassword: reset.body.tempPassword });
    await request(app)
      .post("/api/auth/request-password-reset")
      .set("Origin", CRM)
      .set("x-forwarded-host", "crm.localhost:3002")
      .set("x-forwarded-proto", "http")
      .send({ email, redirectTo: "/reset-password" })
      .expect(200);
    const mail = (await NotificationLog.findOne({ template: "auth.resetPassword", to: email }).lean())!;
    const token = new URL((mail.payload as { url: string }).url).pathname.split("/").pop()!;
    await request(app).post("/api/auth/reset-password").set("Origin", CRM).send({ token, newPassword: "AnotherPass!2026" }).expect(200);
    expect((await StaffProfile.findById(id).lean())!.tempPasswordEnc).toBeNull();
  });
});
