import { AuthAccount, AuthUser, Enrollment, StudentProfile } from "@edge/db";
import { createStaff } from "@edge/services";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CONSOLE, closeTestDb, createCurrentBatch, INTERNAL, newStudent, resetDb, signedUpStudent, startApi, STUDENT } from "./helpers";

let app: Awaited<ReturnType<typeof startApi>>["app"];

beforeAll(async () => {
  ({ app } = await startApi());
});
afterAll(closeTestDb);
beforeEach(resetDb);

describe("student sign-up and phone verification", () => {
  it("creates the account, verifies the phone and enrolls in the current batch", async () => {
    const batch = await createCurrentBatch();
    const s = newStudent();
    const agent = request.agent(app);
    const res = await agent.post("/api/v1/auth/student-signup").set("Origin", STUDENT).send(s).expect(200);
    expect(([] as string[]).concat(res.headers["set-cookie"] ?? []).join(";")).toMatch(/better-auth\.session_token/);

    let me = await agent.get("/api/v1/me").set(INTERNAL).expect(200);
    expect(me.body.student.pendingPhone).toBe(s.phone);
    expect(me.body.homes.student).toBe("/verify-phone");

    await agent.post("/api/v1/auth/phone/verify").set("Origin", STUDENT).send({ code: "123456" }).expect(400);
    const ok = await agent.post("/api/v1/auth/phone/verify").set("Origin", STUDENT).send({ code: "000000" }).expect(200);
    expect(ok.body.home).toBe("/dashboard");

    me = await agent.get("/api/v1/me").set(INTERNAL).expect(200);
    expect(me.body.user.phoneNumberVerified).toBe(true);
    expect(me.body.user.phoneNumber).toBe(s.phone);
    expect(me.body.student.pendingPhone).toBeNull();
    expect(me.body.homes).toEqual({ student: "/dashboard", console: null, crm: null });
    const e = await Enrollment.findOne({ studentId: me.body.user.id }).lean();
    expect(String(e?.batchId)).toBe(String(batch._id));
    expect(e?.status).toBe("PENDING_PAYMENT");
  });

  it("rejects a mobile number that is already registered, and invalid input", async () => {
    const { s } = await signedUpStudent(app);
    const dup = await request(app).post("/api/v1/auth/student-signup").set("Origin", STUDENT).send({ ...newStudent(), phone: s.phone }).expect(409);
    expect(dup.body.error.fieldErrors.phone).toMatch(/already registered/);
    const bad = await request(app).post("/api/v1/auth/student-signup").set("Origin", STUDENT).send({ ...newStudent(), terms: false }).expect(400);
    expect(bad.body.error.fieldErrors.terms).toBeDefined();
    await request(app).post("/api/v1/auth/student-signup").set("Origin", "https://evil.example").send(newStudent()).expect(403);
  });

  it("blocks direct Better Auth calls that must go through the policy endpoints", async () => {
    await request(app).post("/api/auth/sign-up/email").set("Origin", STUDENT).send({ name: "x", email: "x@example.com", password: "Sup3rSecret!" }).expect(403);
    await request(app).post("/api/auth/phone-number/send-otp").set("Origin", STUDENT).send({ phoneNumber: "+971500000000" }).expect(403);
    await request(app).post("/api/auth/phone-number/request-password-reset").set("Origin", STUDENT).send({ phoneNumber: "+971500000000" }).expect(403);
  });

  it("writes Better Auth documents with ObjectId user references", async () => {
    const { s } = await signedUpStudent(app);
    const u = await AuthUser.findOne({ email: s.email }).lean();
    const acc = await AuthAccount.findOne({ userId: u!._id }).lean();
    expect(acc?.providerId).toBe("credential");
    expect(acc?.accountId).toBe(u!._id.toHexString());
    expect(await StudentProfile.exists({ _id: u!._id })).toBeTruthy();
  });
});

describe("sign-in", () => {
  it("students sign in to the student portal but not to the console", async () => {
    const { s } = await signedUpStudent(app);
    const ok = await request(app).post("/api/v1/auth/sign-in").set("Origin", STUDENT).send({ identifier: s.email, password: s.password, app: "student" }).expect(200);
    expect(ok.body.home).toBe("/dashboard");
    const byPhone = await request(app).post("/api/v1/auth/sign-in").set("Origin", STUDENT).send({ identifier: s.phone, password: s.password, app: "student" }).expect(200);
    expect(byPhone.body.home).toBe("/dashboard");
    const wrong = await request(app).post("/api/v1/auth/sign-in").set("Origin", CONSOLE).send({ identifier: s.email, password: s.password, app: "console" }).expect(403);
    expect(wrong.headers["set-cookie"]).toBeUndefined();
    await request(app).post("/api/v1/auth/sign-in").set("Origin", STUDENT).send({ identifier: s.email, password: "wrong-password", app: "student" }).expect(401);
  });

  it("staff created by the service sign in to the console", async () => {
    await createStaff({ name: "Admin", email: "admin@edge.test", roleKeys: ["super_admin"], password: "AdminPass!2026" }, { type: "SYSTEM" });
    const agent = request.agent(app);
    const res = await agent.post("/api/v1/auth/sign-in").set("Origin", CONSOLE).send({ identifier: "admin@edge.test", password: "AdminPass!2026", app: "console" }).expect(200);
    expect(res.body.home).toBe("/admin");
    const me = await agent.get("/api/v1/me").set(INTERNAL).expect(200);
    expect(me.body.permissions).toContain("roles.manage");
    await request(app).post("/api/v1/auth/sign-in").set("Origin", STUDENT).send({ identifier: "admin@edge.test", password: "AdminPass!2026", app: "student" }).expect(403);
  });

  it("disabled users cannot sign in", async () => {
    const { s } = await signedUpStudent(app);
    await AuthUser.updateOne({ email: s.email }, { $set: { disabledAt: new Date() } });
    const res = await request(app).post("/api/v1/auth/sign-in").set("Origin", STUDENT).send({ identifier: s.email, password: s.password, app: "student" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(([] as string[]).concat(res.headers["set-cookie"] ?? []).join(";")).not.toMatch(/session_token=[^;]+/);
  });
});

describe("one-time code login", () => {
  it("sends without revealing whether the number exists and signs in with the code", async () => {
    const { s } = await signedUpStudent(app);
    const unknown = await request(app).post("/api/v1/auth/otp/send").set("Origin", STUDENT).send({ phone: "+971509999999" }).expect(200);
    const known = await request(app).post("/api/v1/auth/otp/send").set("Origin", STUDENT).send({ phone: s.phone }).expect(200);
    expect(unknown.body.message.replace(/\+\d+/, "")).toBe(known.body.message.replace(/\+\d+/, ""));
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/otp/verify").set("Origin", STUDENT).send({ phone: s.phone, code: "000000" }).expect(200);
    const me = await agent.get("/api/v1/me").set(INTERNAL).expect(200);
    expect(me.body.user.email).toBe(s.email);
  });

  it("is refused for accounts protected by two-factor", async () => {
    const { s } = await signedUpStudent(app);
    await AuthUser.updateOne({ email: s.email }, { $set: { twoFactorEnabled: true } });
    await request(app).post("/api/v1/auth/otp/verify").set("Origin", STUDENT).send({ phone: s.phone, code: "000000" }).expect(400);
  });
});

describe("internal API", () => {
  it("hides /api/v1 without the internal token and requires a session", async () => {
    await request(app).get("/api/v1/me").expect(404);
    await request(app).get("/api/v1/me").set(INTERNAL).expect(401);
    const health = await request(app).get("/api/health").expect(200);
    expect(health.body.db).toBe("up");
  });
});
