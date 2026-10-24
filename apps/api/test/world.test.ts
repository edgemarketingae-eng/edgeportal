import { AuditLog, InAppNotification, StudentProfile, Types } from "@edge/db";
import { createStaff } from "@edge/services";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CONSOLE, closeTestDb, createCurrentBatch, INTERNAL, newStudent, producer, resetDb, startApi, STUDENT } from "./helpers";

// Students from any country, admins correcting a country, and paged notifications.
let app: Awaited<ReturnType<typeof startApi>>["app"];
beforeAll(async () => {
  ({ app } = await startApi());
});
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  producer.take();
});

async function staffAgent(role: string) {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@edge.test`;
  const { id } = await createStaff({ name: role, email, roleKeys: [role], password: "StaffPass!2026" }, { type: "SYSTEM" });
  const agent = request.agent(app);
  await agent
    .post("/api/v1/auth/sign-in")
    .set("Origin", CONSOLE)
    .send({ identifier: email, password: "StaffPass!2026", app: "console" })
    .expect(200);
  return { agent, id };
}

describe("students outside the UAE", () => {
  it("signs up with a country of residence, pays no UAE VAT and only sees international methods", async () => {
    await createCurrentBatch();
    const s = { ...newStudent(), phone: `+9198${String(Date.now()).slice(-8)}`, country: "IN" };
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/student-signup").set("Origin", STUDENT).send(s).expect(200);
    await agent.post("/api/v1/auth/phone/verify").set("Origin", STUDENT).send({ code: "000000" }).expect(200);
    const me = await agent.get("/api/v1/me").set(INTERNAL).expect(200);
    expect((await StudentProfile.findById(me.body.user.id).lean())!.country).toBe("IN");
    const options = await agent.get("/api/v1/student/checkout/options").set(INTERNAL).expect(200);
    expect(options.body.vatTreatment).toBe("ZERO_RATED");
    expect(options.body.methods.map((m: { key: string }) => m.key)).toEqual(["STRIPE_CARD_INTL"]);
  });

  it("keeps a UAE resident with a foreign SIM on UAE VAT, and refuses a local number without its country", async () => {
    await createCurrentBatch();
    const expat = { ...newStudent(), phone: `+9198${String(Date.now()).slice(-8)}`, country: "AE" };
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/student-signup").set("Origin", STUDENT).send(expat).expect(200);
    await agent.post("/api/v1/auth/phone/verify").set("Origin", STUDENT).send({ code: "000000" }).expect(200);
    expect((await agent.get("/api/v1/student/checkout/options").set(INTERNAL).expect(200)).body.vatTreatment).toBe("STANDARD");

    const local = await request(app)
      .post("/api/v1/auth/student-signup")
      .set("Origin", STUDENT)
      .send({ ...newStudent(), phone: "050 123 9876" })
      .expect(400);
    expect(local.body.error.fieldErrors.phone).toMatch(/country code/);
    await request(app)
      .post("/api/v1/auth/student-signup")
      .set("Origin", STUDENT)
      .send({ ...newStudent(), country: "UK" })
      .expect(400);
  });

  it("lets admissions correct a student's country (audited) but not finance", async () => {
    await createCurrentBatch();
    const s = newStudent();
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/student-signup").set("Origin", STUDENT).send(s).expect(200);
    const id = (await agent.get("/api/v1/me").set(INTERNAL).expect(200)).body.user.id as string;
    expect((await StudentProfile.findById(id).lean())!.country).toBe("AE");

    const finance = await staffAgent("finance");
    await finance.agent.post(`/api/v1/admin/students/${id}/country`).set(INTERNAL).send({ country: "SA" }).expect(403);
    const admissions = await staffAgent("admissions");
    await admissions.agent.post(`/api/v1/admin/students/${id}/country`).set(INTERNAL).send({ country: "XX" }).expect(400);
    await admissions.agent.post(`/api/v1/admin/students/${id}/country`).set(INTERNAL).send({ country: "sa" }).expect(200);
    expect((await StudentProfile.findById(id).lean())!.country).toBe("SA");
    expect(await AuditLog.findOne({ action: "student.country", entityId: id }).lean()).toMatchObject({
      before: { country: "AE" },
      after: { country: "SA" },
    });
  });
});

describe("paged notifications", () => {
  it("returns one page at a time and marks only that page read", async () => {
    const { agent, id } = await staffAgent("admissions");
    const userId = new Types.ObjectId(id);
    const base = Date.now();
    await InAppNotification.insertMany(
      Array.from({ length: 30 }, (_, i) => ({ userId, title: `N${i}`, body: "x", createdAt: new Date(base + i * 1000) })),
    );
    const p1 = await agent.get("/api/v1/notifications").query({ pageSize: 25 }).set(INTERNAL).expect(200);
    expect(p1.body).toMatchObject({ total: 30, page: 1, pageSize: 25 });
    expect(p1.body.rows[0].title).toBe("N29");
    expect(await InAppNotification.countDocuments({ userId, readAt: null })).toBe(5);
    const p2 = await agent.get("/api/v1/notifications").query({ page: 2, pageSize: 25 }).set(INTERNAL).expect(200);
    expect(p2.body.rows.map((r: { title: string }) => r.title)).toEqual(["N4", "N3", "N2", "N1", "N0"]);
    expect(await InAppNotification.countDocuments({ userId, readAt: null })).toBe(0);
  });
});
