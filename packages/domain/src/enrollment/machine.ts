import { dubaiDateOnly, endOfDubaiDay } from "../dates";

/**
 * Pure enrollment rules. No I/O: the service layer loads rows, calls these,
 * and persists the patch inside a locked transaction.
 */
export type EnrollmentStatus = "PENDING_PAYMENT" | "PENDING_APPROVAL" | "ACTIVE" | "LOCKED" | "REJECTED" | "CANCELLED";
export type PaymentState = "UNPAID" | "PARTIALLY_PAID" | "PAID";
export type LockReason = "AUTO_OVERDUE" | "MANUAL";
import type { VatTreatment } from "../payments/fees";

export interface EnrollmentSnapshot {
  status: EnrollmentStatus;
  paymentState: PaymentState;
  feeMinor: number;
  paidCourseMinor: number;
  balanceDueOn: Date | null;
  lockAt: Date | null;
  lockReason: LockReason | null;
  firstPaidAt: Date | null;
  fullyPaidAt: Date | null;
  vatTreatment: VatTreatment | null;
  taxCountry: string | null;
}

export interface BatchTerms {
  balanceDueRule: "FIXED_DATE" | "DAYS_AFTER_FIRST_PAYMENT";
  balanceDueDate: Date | null;
  balanceDueDays: number | null;
  lockGraceDays: number;
}

export interface SucceededPayment {
  courseMinor: number;
  vatTreatment: VatTreatment;
  billingCountry: string;
}

export function derivePaymentState(paidCourseMinor: number, feeMinor: number): PaymentState {
  if (paidCourseMinor >= feeMinor) return "PAID";
  if (paidCourseMinor > 0) return "PARTIALLY_PAID";
  return "UNPAID";
}

export function remainingMinor(e: Pick<EnrollmentSnapshot, "feeMinor" | "paidCourseMinor">) {
  return Math.max(0, e.feeMinor - e.paidCourseMinor);
}

export function computeBalanceDue(batch: BatchTerms, firstPaidAt: Date): { balanceDueOn: Date; lockAt: Date } {
  let balanceDueOn: Date;
  if (batch.balanceDueRule === "FIXED_DATE" && batch.balanceDueDate) {
    balanceDueOn = batch.balanceDueDate;
  } else {
    balanceDueOn = dubaiDateOnly(firstPaidAt, batch.balanceDueDays ?? 30);
  }
  return { balanceDueOn, lockAt: endOfDubaiDay(balanceDueOn, batch.lockGraceDays) };
}

export function isOverdue(e: Pick<EnrollmentSnapshot, "paymentState" | "lockAt">, at: Date) {
  return e.paymentState === "PARTIALLY_PAID" && !!e.lockAt && e.lockAt.getTime() < at.getTime();
}

export interface Transition {
  patch: Partial<EnrollmentSnapshot>;
  from: EnrollmentStatus;
  to: EnrollmentStatus;
  /** Things the service must do after commit (emails, alerts). */
  effects: ("PENDING_APPROVAL" | "FULLY_PAID" | "AUTO_UNLOCKED" | "PAYMENT_ON_CLOSED_ENROLLMENT")[];
}

export function onPaymentSucceeded(e: EnrollmentSnapshot, batch: BatchTerms, p: SucceededPayment, at: Date): Transition {
  const patch: Partial<EnrollmentSnapshot> = {};
  const effects: Transition["effects"] = [];
  const first = e.firstPaidAt === null;

  if (first) {
    patch.firstPaidAt = at;
    patch.vatTreatment = p.vatTreatment;
    patch.taxCountry = p.billingCountry;
  }

  const paid = e.paidCourseMinor + p.courseMinor;
  const state = derivePaymentState(paid, e.feeMinor);
  patch.paidCourseMinor = paid;
  patch.paymentState = state;

  if (state === "PAID") {
    patch.fullyPaidAt = e.fullyPaidAt ?? at;
    patch.lockAt = null;
    if (!e.fullyPaidAt) effects.push("FULLY_PAID");
  } else if (first || e.balanceDueOn === null) {
    const due = computeBalanceDue(batch, at);
    patch.balanceDueOn = due.balanceDueOn;
    patch.lockAt = due.lockAt;
  }

  let to: EnrollmentStatus = e.status;
  switch (e.status) {
    case "PENDING_PAYMENT":
      to = "PENDING_APPROVAL";
      effects.push("PENDING_APPROVAL");
      break;
    case "LOCKED":
      if (e.lockReason === "AUTO_OVERDUE" && state === "PAID") {
        to = "ACTIVE";
        patch.lockReason = null;
        effects.push("AUTO_UNLOCKED");
      }
      break;
    case "REJECTED":
    case "CANCELLED":
      effects.push("PAYMENT_ON_CLOSED_ENROLLMENT");
      break;
    default:
      break; // PENDING_APPROVAL and ACTIVE stay; balance payments never need re-approval
  }
  return { patch, from: e.status, to, effects };
}

export class TransitionError extends Error {}

export function assertCan(action: string, status: EnrollmentStatus, allowed: EnrollmentStatus[]) {
  if (!allowed.includes(status)) throw new TransitionError(`Cannot ${action} an enrollment that is ${status}`);
}

/** Statuses each simple transition may start from. Services use this in their atomic update filters. */
export const ALLOWED_FROM = {
  approve: ["PENDING_APPROVAL"],
  reject: ["PENDING_APPROVAL", "PENDING_PAYMENT"],
  lock: ["ACTIVE"],
  unlock: ["LOCKED"],
  cancel: ["PENDING_PAYMENT"],
} as const satisfies Record<string, readonly EnrollmentStatus[]>;

export type TransitionName = keyof typeof ALLOWED_FROM;
