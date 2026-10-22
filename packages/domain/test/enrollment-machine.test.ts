import { describe, expect, it } from "vitest";
import {
  computeBalanceDue,
  derivePaymentState,
  isOverdue,
  onPaymentSucceeded,
  type BatchTerms,
  type EnrollmentSnapshot,
} from "../src/enrollment/machine";
import { canAccessLiveSession, canWatchRecording, entitlements } from "../src/enrollment/entitlements";

const batch: BatchTerms = { balanceDueRule: "DAYS_AFTER_FIRST_PAYMENT", balanceDueDate: null, balanceDueDays: 30, lockGraceDays: 0 };
const fresh: EnrollmentSnapshot = {
  status: "PENDING_PAYMENT",
  paymentState: "UNPAID",
  feeMinor: 500000,
  paidCourseMinor: 0,
  balanceDueOn: null,
  lockAt: null,
  lockReason: null,
  firstPaidAt: null,
  fullyPaidAt: null,
  vatTreatment: null,
  taxCountry: null,
};
const at = new Date("2026-10-06T10:00:00Z"); // 14:00 Dubai

describe("payment state", () => {
  it("derives from paid vs fee", () => {
    expect(derivePaymentState(0, 100)).toBe("UNPAID");
    expect(derivePaymentState(50, 100)).toBe("PARTIALLY_PAID");
    expect(derivePaymentState(100, 100)).toBe("PAID");
  });
});

describe("balance due", () => {
  it("N days after first payment, locks at end of that Dubai day", () => {
    const d = computeBalanceDue(batch, at);
    expect(d.balanceDueOn.toISOString().slice(0, 10)).toBe("2026-11-05");
    expect(d.lockAt.toISOString()).toBe("2026-11-05T19:59:59.999Z");
  });
  it("uses the Dubai calendar day near midnight", () => {
    const late = new Date("2026-10-06T21:30:00Z"); // 01:30 on 7 Oct in Dubai
    expect(computeBalanceDue(batch, late).balanceDueOn.toISOString().slice(0, 10)).toBe("2026-11-06");
  });
  it("fixed date with grace days", () => {
    const d = computeBalanceDue(
      { ...batch, balanceDueRule: "FIXED_DATE", balanceDueDate: new Date("2026-12-01T00:00:00Z"), lockGraceDays: 2 },
      at,
    );
    expect(d.balanceDueOn.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(d.lockAt.toISOString()).toBe("2026-12-03T19:59:59.999Z");
  });
});

describe("onPaymentSucceeded", () => {
  const p = { courseMinor: 30000, vatTreatment: "STANDARD" as const, billingCountry: "AE" };

  it("advance moves to pending approval and sets due date", () => {
    const t = onPaymentSucceeded(fresh, batch, p, at);
    expect(t.to).toBe("PENDING_APPROVAL");
    expect(t.patch.paymentState).toBe("PARTIALLY_PAID");
    expect(t.patch.balanceDueOn).toBeInstanceOf(Date);
    expect(t.patch.vatTreatment).toBe("STANDARD");
    expect(t.effects).toContain("PENDING_APPROVAL");
  });

  it("full payment sets fullyPaidAt and no lock", () => {
    const t = onPaymentSucceeded(fresh, batch, { ...p, courseMinor: 500000 }, at);
    expect(t.patch.paymentState).toBe("PAID");
    expect(t.patch.fullyPaidAt).toEqual(at);
    expect(t.patch.lockAt).toBeNull();
    expect(t.effects).toEqual(expect.arrayContaining(["FULLY_PAID", "PENDING_APPROVAL"]));
  });

  it("balance on an active enrollment does not need re-approval", () => {
    const active = {
      ...fresh,
      status: "ACTIVE" as const,
      paymentState: "PARTIALLY_PAID" as const,
      paidCourseMinor: 30000,
      firstPaidAt: at,
      balanceDueOn: new Date("2026-11-05"),
      lockAt: new Date("2026-11-05T19:59:59.999Z"),
    };
    const t = onPaymentSucceeded(active, batch, { ...p, courseMinor: 470000 }, at);
    expect(t.to).toBe("ACTIVE");
    expect(t.patch.paymentState).toBe("PAID");
    expect(t.patch.firstPaidAt).toBeUndefined(); // VAT treatment stays frozen
  });

  it("auto-locked enrollment unlocks when fully paid", () => {
    const locked = {
      ...fresh,
      status: "LOCKED" as const,
      lockReason: "AUTO_OVERDUE" as const,
      paymentState: "PARTIALLY_PAID" as const,
      paidCourseMinor: 30000,
      firstPaidAt: at,
      balanceDueOn: new Date("2026-11-05"),
    };
    const t = onPaymentSucceeded(locked, batch, { ...p, courseMinor: 470000 }, at);
    expect(t.to).toBe("ACTIVE");
    expect(t.effects).toContain("AUTO_UNLOCKED");
  });

  it("manual lock stays locked even when fully paid", () => {
    const locked = {
      ...fresh,
      status: "LOCKED" as const,
      lockReason: "MANUAL" as const,
      paymentState: "PARTIALLY_PAID" as const,
      paidCourseMinor: 30000,
      firstPaidAt: at,
      balanceDueOn: new Date("2026-11-05"),
    };
    expect(onPaymentSucceeded(locked, batch, { ...p, courseMinor: 470000 }, at).to).toBe("LOCKED");
  });

  it("partial balance keeps the original due date", () => {
    const partial = {
      ...fresh,
      status: "ACTIVE" as const,
      paymentState: "PARTIALLY_PAID" as const,
      paidCourseMinor: 30000,
      firstPaidAt: at,
      balanceDueOn: new Date("2026-11-05T00:00:00Z"),
      lockAt: new Date("2026-11-05T19:59:59.999Z"),
    };
    const t = onPaymentSucceeded(partial, batch, { ...p, courseMinor: 100000 }, new Date("2026-10-20T10:00:00Z"));
    expect(t.patch.balanceDueOn).toBeUndefined();
  });

  it("flags payments on rejected enrollments", () => {
    expect(onPaymentSucceeded({ ...fresh, status: "REJECTED" }, batch, p, at).effects).toContain("PAYMENT_ON_CLOSED_ENROLLMENT");
  });
});

describe("entitlements", () => {
  const ownStart = new Date("2026-11-01T00:00:00Z");
  const base = {
    id: "e1",
    batchId: "b1",
    lockReason: null,
    lockAt: null,
    batch: { id: "b1", startDate: ownStart, whatsappGroupUrl: "https://chat" },
  };

  it("no enrollment => waitlist", () => {
    expect(entitlements(null, at).banner).toBe("NO_BATCH");
  });

  it("pending payment can only check out", () => {
    const e = entitlements({ ...base, status: "PENDING_PAYMENT", paymentState: "UNPAID" }, at);
    expect(e.canCheckout).toBe(true);
    expect(e.live).toBeNull();
  });

  it("pending approval with advance can pay balance but has no access", () => {
    const e = entitlements({ ...base, status: "PENDING_APPROVAL", paymentState: "PARTIALLY_PAID" }, at);
    expect(e.active).toBe(false);
    expect(e.canPayBalance).toBe(true);
  });

  it("active advance-paid: own batch only, until lockAt", () => {
    const lockAt = new Date("2026-11-05T19:59:59.999Z");
    const e = entitlements({ ...base, status: "ACTIVE", paymentState: "PARTIALLY_PAID", lockAt }, at);
    expect(e.active).toBe(true);
    expect(e.live?.laterBatchesAfter).toBeNull();
    expect(canAccessLiveSession(e, { batchId: "b2", openToAlumni: true, batchStartDate: new Date("2027-02-01") })).toBe(false);
    const after = entitlements({ ...base, status: "ACTIVE", paymentState: "PARTIALLY_PAID", lockAt }, new Date("2026-11-06T00:00:00Z"));
    expect(after.active).toBe(false);
    expect(after.banner).toBe("OVERDUE");
  });

  it("fully paid: own batch + later batches' live classes, own recordings only", () => {
    const e = entitlements({ ...base, status: "ACTIVE", paymentState: "PAID" }, at);
    expect(canAccessLiveSession(e, { batchId: "b1", openToAlumni: true, batchStartDate: ownStart })).toBe(true);
    expect(canAccessLiveSession(e, { batchId: "b2", openToAlumni: true, batchStartDate: new Date("2027-02-01") })).toBe(true);
    expect(canAccessLiveSession(e, { batchId: "b0", openToAlumni: true, batchStartDate: new Date("2026-06-01") })).toBe(false);
    expect(canAccessLiveSession(e, { batchId: "b2", openToAlumni: false, batchStartDate: new Date("2027-02-01") })).toBe(false);
    expect(canWatchRecording(e, { batchId: "b1", status: "PUBLISHED" })).toBe(true);
    expect(canWatchRecording(e, { batchId: "b2", status: "PUBLISHED" })).toBe(false);
    expect(canWatchRecording(e, { batchId: "b1", status: "HIDDEN" })).toBe(false);
  });

  it("manual lock hides everything", () => {
    const e = entitlements({ ...base, status: "LOCKED", lockReason: "MANUAL", paymentState: "PAID" }, at);
    expect(e.banner).toBe("LOCKED_MANUAL");
    expect(e.live).toBeNull();
  });

  it("isOverdue only for part-paid past lockAt", () => {
    expect(isOverdue({ paymentState: "PAID", lockAt: new Date(0) }, at)).toBe(false);
    expect(isOverdue({ paymentState: "PARTIALLY_PAID", lockAt: new Date(0) }, at)).toBe(true);
  });
});
