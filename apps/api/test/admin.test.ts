import { Enrollment } from "@edge/db";
import { createStaff } from "@edge/services";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CONSOLE, closeTestDb, createCurrentBatch, INTERNAL, resetDb, signedUpStudent, startApi } from "./helpers";

let app: Awaited<ReturnType<typeof startApi>>["app"];
beforeAll(async () => {
  ({ app } = await startApi());
});
afterAll(closeTestDb);
beforeEach(resetDb);

async function staffAgent(role: string) {
  const email = `${role}-${Date.now()}@edge.test`;
  await createStaff({ name: role, email, roleKeys: [role], password: "StaffPass!2026" }, { type: "SYSTEM" });
  const agent = request.agent(app);
  await agent
    .post("/api/v1/auth/sign-in")
    .set("Origin", CONSOLE)
    .send({ identifier: email, password: "StaffPass!2026", app: "console" })
    .expect(200);
  return agent;
}

describe("admin API permissions", () => {
  it("enforces permissions on approvals and exposes the student list and CSV", async () => {
    await createCurrentBatch();
    const { agent: student, s } = await signedUpStudent(app);
    await student.get("/api/v1/admin/dashboard").set(INTERNAL).expect(403);
    const portal = await student.get("/api/v1/student/portal").set(INTERNAL).expect(200);
    expect(portal.body.entitlements.banner).toBe("PENDING_PAYMENT");
    expect(portal.body.enrollment.batch.advancePresetsMinor).toEqual([20000, 30000, 50000]);

    const e = await Enrollment.findOne({}).lean();
    await Enrollment.updateOne(
      { _id: e!._id },
      { $set: { status: "PENDING_APPROVAL", paymentState: "PARTIALLY_PAID", paidCourseMinor: 30000, firstPaidAt: new Date() } },
    );

    const finance = await staffAgent("finance");
    await finance.post(`/api/v1/admin/enrollments/${e!._id}/approve`).set(INTERNAL).send({}).expect(403);
    const admissions = await staffAgent("admissions");
    const approvals = await admissions.get("/api/v1/admin/approvals").set(INTERNAL).expect(200);
    expect(approvals.body).toMatchObject({ total: 1, page: 1 });
    expect(approvals.body.rows[0].email).toBe(s.email);
    await admissions.post(`/api/v1/admin/enrollments/${e!._id}/approve`).set(INTERNAL).send({}).expect(200);
    const again = await admissions.post(`/api/v1/admin/enrollments/${e!._id}/approve`).set(INTERNAL).send({}).expect(409);
    expect(again.body.error.code).toBe("TRANSITION_NOT_ALLOWED");
    await admissions.post(`/api/v1/admin/enrollments/not-an-id/approve`).set(INTERNAL).send({}).expect(404);

    const list = await admissions.get("/api/v1/admin/students").query({ status: "ACTIVE" }).set(INTERNAL).expect(200);
    expect(list.body.total).toBe(1);
    const csv = await admissions.get("/api/v1/admin/students.csv").set(INTERNAL).expect(200);
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.text).toContain(s.email);
    const detail = await admissions.get(`/api/v1/admin/students/${portal.body.enrollment.studentId}`).set(INTERNAL).expect(200);
    expect(detail.body.events.map((x: { type: string }) => x.type)).toEqual(expect.arrayContaining(["APPROVED", "CREATED"]));
  });

  it("admin manages courses, batches and staff", async () => {
    const admin = await staffAgent("super_admin");
    const course = await admin
      .post("/api/v1/admin/courses")
      .set(INTERNAL)
      .send({ code: "fx-pro", title: "Forex Pro", isActive: true })
      .expect(200);
    const batch = await admin
      .post("/api/v1/admin/batches")
      .set(INTERNAL)
      .send({
        courseId: course.body.id,
        code: "fx-b9",
        name: "Batch 9",
        startDate: "2027-02-01",
        status: "OPEN",
        fee: "5,000",
        advanceEnabled: true,
        advancePresets: "300, 200",
        allowCustomAdvance: true,
        balanceDueRule: "DAYS_AFTER_FIRST_PAYMENT",
        balanceDueDays: "30",
        lockGraceDays: "0",
        isCurrentForEnrollment: true,
        mentorIds: [],
      })
      .expect(200);
    const b = await admin.get(`/api/v1/admin/batches/${batch.body.id}`).set(INTERNAL).expect(200);
    expect(b.body).toMatchObject({ code: "FX-B9", feeMinor: 500000, advancePresetsMinor: [20000, 30000], isCurrentForEnrollment: true });
    const bad = await admin
      .post("/api/v1/admin/batches")
      .set(INTERNAL)
      .send({ courseId: course.body.id, code: "x", name: "Bad", startDate: "nope" })
      .expect(400);
    expect(bad.body.error.fieldErrors.startDate).toBeDefined();
    const staff = await admin
      .post("/api/v1/admin/staff")
      .set(INTERNAL)
      .send({ name: "New Mentor", email: "Mentor@Edge.test ", roleKeys: ["mentor"] })
      .expect(200);
    expect(staff.body.tempPassword).toMatch(/^Edge-/);
    const rows = await admin.get("/api/v1/admin/staff").set(INTERNAL).expect(200);
    expect(rows.body.find((x: { email: string }) => x.email === "mentor@edge.test")?.invited).toBe(true);
    const settings = await admin.get("/api/v1/admin/settings").set(INTERNAL).expect(200);
    expect(settings.body.feeRates).toHaveLength(6);
  });
});
