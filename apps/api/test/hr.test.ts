import { Role } from "@edge/db";
import { createStaff, saveEmployee, savePay } from "@edge/services";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CONSOLE, closeTestDb, INTERNAL, resetDb, signedUpStudent, startApi } from "./helpers";

let app: Awaited<ReturnType<typeof startApi>>["app"];
beforeAll(async () => {
  ({ app } = await startApi());
});
afterAll(closeTestDb);
beforeEach(resetDb);

let seq = 0;
async function staffAgent(role: string) {
  seq += 1;
  const email = `${role}-${seq}-${Date.now()}@edge.test`;
  const { id } = await createStaff({ name: `${role} ${seq}`, email, roleKeys: [role], password: "StaffPass!2026" }, { type: "SYSTEM" });
  const agent = request.agent(app);
  await agent
    .post("/api/v1/auth/sign-in")
    .set("Origin", CONSOLE)
    .send({ identifier: email, password: "StaffPass!2026", app: "console" })
    .expect(200);
  return { agent, id, actor: { type: "USER" as const, id } };
}

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const upload = (agent: ReturnType<typeof request.agent>, area: string, body: Buffer, name = "note.png") =>
  agent.post(`/api/v1/files?module=hr&area=${area}&name=${name}`).set(INTERNAL).set("content-type", "application/octet-stream").send(body);

describe("HR access", () => {
  it("gives any staff account its own pages, and nothing of anyone else's", async () => {
    const exec = await staffAgent("sales_executive");
    const me = await exec.agent.get("/api/v1/me").set(INTERNAL).expect(200);
    expect(me.body.homes.console).toBe("/staff");
    const home = await exec.agent.get("/api/v1/hr/me").set(INTERNAL).expect(200);
    expect(home.body).toMatchObject({ setUp: false, queue: null });
    for (const path of ["team", "attendance/day", "leave", "requests", "advances", "payroll", "settings"])
      await exec.agent.get(`/api/v1/hr/${path}`).set(INTERNAL).expect(403);
  });

  it("keeps the admin role out of HR, and hands pay only to hr.payroll", async () => {
    const hr = await staffAgent("hr_manager");
    const person = await staffAgent("employee");
    await saveEmployee(person.id, { joinedOn: "2020-01-01" }, hr.actor);
    await savePay(person.id, { fromMonth: "2026-01", currency: "AED", base: "3000", allowances: [] }, hr.actor);
    const admin = await staffAgent("admin");
    await admin.agent.get("/api/v1/hr/team").set(INTERNAL).expect(403);
    await admin.agent.get(`/api/v1/hr/team/${person.id}/pay`).set(INTERNAL).expect(403);

    await Role.create([{ key: "hr_clerk", name: "HR clerk", permissions: ["hr.manage"] }]);
    const clerk = await staffAgent("hr_clerk");
    await clerk.agent.get("/api/v1/hr/team").set(INTERNAL).expect(200);
    await clerk.agent.get(`/api/v1/hr/team/${person.id}/pay`).set(INTERNAL).expect(403);
    const member = await clerk.agent.get(`/api/v1/hr/team/${person.id}`).set(INTERNAL).expect(200);
    expect(JSON.stringify(member.body)).not.toContain("300000");
    const pay = await hr.agent.get(`/api/v1/hr/team/${person.id}/pay`).set(INTERNAL).expect(200);
    expect(pay.body.revisions[0].baseMinor).toBe(300_000);
  });

  it("refuses students", async () => {
    const { agent } = await signedUpStudent(app);
    await agent.get("/api/v1/hr/me").set(INTERNAL).expect(403);
  });
});

describe("files", () => {
  it("stores a real image and lets only its owner and HR read it", async () => {
    const owner = await staffAgent("employee");
    const other = await staffAgent("employee");
    const hr = await staffAgent("hr_manager");
    const up = await upload(owner.agent, "leave", pngBytes).expect(200);
    const read = await owner.agent.get(`/api/v1/files/${up.body.id}`).set(INTERNAL).expect(200);
    expect(read.headers["content-type"]).toContain("image/png");
    expect(read.headers["x-content-type-options"]).toBe("nosniff");
    await hr.agent.get(`/api/v1/files/${up.body.id}`).set(INTERNAL).expect(200);
    await other.agent.get(`/api/v1/files/${up.body.id}`).set(INTERNAL).expect(404);
  });

  it("goes by the bytes, not the file name", async () => {
    const owner = await staffAgent("employee");
    const res = await upload(owner.agent, "leave", Buffer.from("#!/bin/sh\necho hello"), "note.pdf").expect(400);
    expect(res.body.error.fieldErrors.file).toContain("JPG, PNG or PDF");
  });

  it("refuses files that are too big", async () => {
    const owner = await staffAgent("employee");
    const over = Buffer.concat([pngBytes, Buffer.alloc(5 * 1024 * 1024)]);
    await upload(owner.agent, "leave", over).expect(400);
    await upload(owner.agent, "leave", Buffer.alloc(7 * 1024 * 1024)).expect(413);
  });

  it("keeps HR's folders to HR, and unknown folders to nobody", async () => {
    const owner = await staffAgent("employee");
    await upload(owner.agent, "letters", pngBytes).expect(403);
    await upload(owner.agent, "secrets", pngBytes).expect(400);
  });

  it("won't let someone attach another person's upload", async () => {
    const hr = await staffAgent("hr_manager");
    const owner = await staffAgent("employee");
    const other = await staffAgent("employee");
    await saveEmployee(other.id, { joinedOn: "2020-01-01" }, hr.actor);
    const up = await upload(owner.agent, "requests", pngBytes).expect(200);
    await other.agent
      .post("/api/v1/hr/me/requests")
      .set(INTERNAL)
      .send({ type: "NOC", subject: "My NOC", attachmentId: up.body.id })
      .expect(422);
  });
});
