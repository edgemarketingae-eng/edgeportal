import { Batch, Enrollment, NotificationLog } from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { freezeClock, setClock } from "@edge/domain/clock";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { approveEnrollment, createStaff, ensureCurrentEnrollment, listStudents, lockEnrollment, runAutolock, runBalanceReminders, saveBatch, TransitionError, unlockEnrollment } from "../src";
import { createBatch, createStudent, producer } from "./helpers";

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  producer.take();
  freezeClock("2026-10-06T10:00:00Z");
});
afterEach(() => setClock(null));

async function staffActor() {
  const { id } = await createStaff({ name: "Admin", email: `admin-${Date.now()}@edge.test`, roleKeys: ["admin"], password: "AdminPass!2026" }, { type: "SYSTEM" });
  return { type: "USER" as const, id };
}

async function partPaid(studentId: string, status: "PENDING_APPROVAL" | "ACTIVE", lockAt: Date) {
  await Enrollment.updateOne({ studentId, isCurrent: true }, { $set: { status, paymentState: "PARTIALLY_PAID", paidCourseMinor: 30000, firstPaidAt: new Date("2026-10-06T10:00:00Z"), balanceDueOn: new Date("2026-11-05T00:00:00Z"), lockAt } });
}

describe("enrollment service", () => {
  it("concurrent sign-up verifications create exactly one enrollment", async () => {
    await createBatch();
    const sid = await createStudent();
    await Promise.all(Array.from({ length: 6 }, () => ensureCurrentEnrollment(sid, { type: "USER", id: sid })));
    expect(await Enrollment.countDocuments({ studentId: sid })).toBe(1);
  });

  it("returns null when no batch is open", async () => {
    await createBatch({ current: false });
    expect(await ensureCurrentEnrollment(await createStudent(), { type: "SYSTEM" })).toBeNull();
  });

  it("approval needs a payment, and parallel approvals have exactly one winner", async () => {
    await createBatch();
    const sid = await createStudent();
    const e = await ensureCurrentEnrollment(sid, { type: "SYSTEM" });
    const actor = await staffActor();
    await Enrollment.updateOne({ _id: e!._id }, { $set: { status: "PENDING_APPROVAL" } });
    await expect(approveEnrollment(String(e!._id), actor)).rejects.toThrow(/before a payment/);
    await partPaid(sid, "PENDING_APPROVAL", new Date("2026-11-05T19:59:59.999Z"));
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => approveEnrollment(String(e!._id), actor)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof TransitionError)).toBe(true);
    expect((await Enrollment.findById(e!._id).lean())?.status).toBe("ACTIVE");
    expect(await NotificationLog.countDocuments({ template: "enrollment.approved" })).toBe(1);
  });

  it("auto-locks overdue part-paid students once, and unlock needs a future due date", async () => {
    await createBatch();
    const sid = await createStudent();
    const e = await ensureCurrentEnrollment(sid, { type: "SYSTEM" });
    await partPaid(sid, "ACTIVE", new Date("2026-11-05T19:59:59.999Z"));
    expect((await runAutolock(new Date("2026-11-05T19:00:00Z"))).locked).toBe(0);
    const [a, b] = await Promise.all([runAutolock(new Date("2026-11-05T20:00:01Z")), runAutolock(new Date("2026-11-05T20:00:01Z"))]);
    expect(a.locked + b.locked).toBe(1);
    const locked = await Enrollment.findById(e!._id).lean();
    expect(locked?.status).toBe("LOCKED");
    expect(locked?.lockReason).toBe("AUTO_OVERDUE");
    expect(await NotificationLog.countDocuments({ template: "enrollment.locked" })).toBe(1);

    freezeClock("2026-11-07T10:00:00Z");
    const actor = await staffActor();
    await expect(unlockEnrollment(String(e!._id), actor)).rejects.toThrow(/new due date/);
    await unlockEnrollment(String(e!._id), actor, new Date("2026-11-20T00:00:00Z"));
    const unlocked = await Enrollment.findById(e!._id).lean();
    expect(unlocked?.status).toBe("ACTIVE");
    expect(unlocked?.balanceDueOn?.toISOString().slice(0, 10)).toBe("2026-11-20");
    await lockEnrollment(String(e!._id), actor, "ID check");
    expect((await Enrollment.findById(e!._id).lean())?.lockReason).toBe("MANUAL");
  });

  it("balance reminders go out once per offset day", async () => {
    await createBatch();
    const sid = await createStudent();
    await ensureCurrentEnrollment(sid, { type: "SYSTEM" });
    await partPaid(sid, "ACTIVE", new Date("2026-11-05T19:59:59.999Z"));
    expect((await runBalanceReminders(new Date("2026-11-02T05:00:00Z"))).sent).toBe(1); // 3 days before
    expect((await runBalanceReminders(new Date("2026-11-02T05:00:00Z"))).sent).toBe(0);
    expect((await runBalanceReminders(new Date("2026-11-01T05:00:00Z"))).sent).toBe(0); // 4 days: not an offset
  });
});

describe("catalog and admin lists", () => {
  it("making a batch current switches the previous one off", async () => {
    const b1 = await createBatch({ code: "B-ONE" });
    const actor = await staffActor();
    const id = await saveBatch(
      null,
      {
        courseId: String(b1.courseId),
        code: "B-TWO",
        name: "Batch 2",
        startDate: "2027-01-10",
        status: "OPEN",
        fee: 600000,
        advanceEnabled: true,
        advancePresets: "200, 300",
        allowCustomAdvance: true,
        balanceDueRule: "DAYS_AFTER_FIRST_PAYMENT",
        balanceDueDays: 30,
        lockGraceDays: 0,
        isCurrentForEnrollment: true,
        mentorIds: [],
      },
      actor,
    );
    expect((await Batch.findById(b1._id).lean())?.isCurrentForEnrollment).toBe(false);
    const b2 = await Batch.findById(id).lean();
    expect(b2?.isCurrentForEnrollment).toBe(true);
    expect(b2?.advancePresetsMinor).toEqual([20000, 30000]);
  });

  it("filters the student list", async () => {
    await createBatch();
    const s1 = await createStudent();
    await createStudent();
    await ensureCurrentEnrollment(s1, { type: "SYSTEM" });
    expect((await listStudents({})).total).toBe(2);
    expect((await listStudents({ status: "PENDING_PAYMENT" })).total).toBe(1);
    expect((await listStudents({ status: "NONE" })).total).toBe(1);
    expect((await listStudents({ q: "Student" })).total).toBe(2);
  });
});
