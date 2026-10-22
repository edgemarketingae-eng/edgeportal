import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthUser, Batch, Course, Enrollment, FeeRate, isDuplicateKey, PaymentEvent, Role, Types, withTx } from "../src";
import { closeTestDb, connectTestDb, resetDb } from "../src/testing/harness";
import { seedBaseData } from "../src/seed-data";

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(resetDb);

async function expectDuplicate(p: Promise<unknown>) {
  await p.then(
    () => expect.fail("expected a duplicate key error"),
    (e) => expect(isDuplicateKey(e)).toBe(true),
  );
}

describe("indexes", () => {
  it("allows many users without a phone but not two with the same phone", async () => {
    await AuthUser.create({ name: "A", email: "a@x.com" });
    await AuthUser.create({ name: "B", email: "b@x.com" });
    await AuthUser.create({ name: "C", email: "c@x.com", phoneNumber: "+971500000001" });
    await expectDuplicate(AuthUser.create({ name: "D", email: "d@x.com", phoneNumber: "+971500000001" }));
    await expectDuplicate(AuthUser.create({ name: "E", email: "a@x.com" }));
  });

  it("one current enrollment per student, one current batch per course", async () => {
    const studentId = new Types.ObjectId();
    const b1 = new Types.ObjectId();
    const b2 = new Types.ObjectId();
    await Enrollment.create({ studentId, batchId: b1, source: "AUTO_CURRENT_BATCH", feeMinor: 500000 });
    await expectDuplicate(Enrollment.create({ studentId, batchId: b2, source: "STAFF_ASSIGNED", feeMinor: 500000 }));
    await Enrollment.create({ studentId, batchId: b2, source: "STAFF_ASSIGNED", feeMinor: 500000, isCurrent: false });

    const course = await Course.create({ code: "FX", slug: "fx", title: "FX" });
    const base = { courseId: course._id, startDate: new Date("2026-11-01"), feeMinor: 500000 };
    await Batch.create({ ...base, code: "B1", name: "B1", status: "OPEN", isCurrentForEnrollment: true });
    await Batch.create({ ...base, code: "B2", name: "B2", status: "OPEN" });
    await expectDuplicate(Batch.create({ ...base, code: "B3", name: "B3", status: "OPEN", isCurrentForEnrollment: true }));
  });

  it("webhook inbox rejects a duplicate event", async () => {
    await PaymentEvent.create({ gateway: "STRIPE", externalEventId: "evt_1", type: "x", signatureOk: true });
    await expectDuplicate(PaymentEvent.create({ gateway: "STRIPE", externalEventId: "evt_1", type: "x", signatureOk: true }));
  });

  it("rejects non-integer money", async () => {
    await expect(Batch.create({ courseId: new Types.ObjectId(), code: "BX", name: "x", startDate: new Date(), feeMinor: 10.5 })).rejects.toThrow(/integer/);
  });

  it("seed is idempotent", async () => {
    await seedBaseData();
    await seedBaseData();
    expect(await Role.countDocuments({ key: "super_admin" })).toBe(1);
    expect(await FeeRate.countDocuments()).toBe(6);
  });

  it("transactions commit atomically and roll back on error", async () => {
    const studentId = new Types.ObjectId();
    await expect(
      withTx(async () => {
        await Enrollment.create([{ studentId, batchId: new Types.ObjectId(), source: "AUTO_CURRENT_BATCH", feeMinor: 1 }]);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await Enrollment.countDocuments({ studentId })).toBe(0);
    await withTx(async () => {
      await Enrollment.create([{ studentId, batchId: new Types.ObjectId(), source: "AUTO_CURRENT_BATCH", feeMinor: 1 }]);
    });
    expect(await Enrollment.countDocuments({ studentId })).toBe(1);
  });
});
