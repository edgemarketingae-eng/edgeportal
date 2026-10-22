import { isOverdue, type EnrollmentStatus, type LockReason, type PaymentState } from "./machine";

/**
 * The single source of truth for what a student may see and do.
 * Menus, page guards, the class join redirect and the media route all call this.
 */
export interface EntitlementEnrollment {
  id: string;
  status: EnrollmentStatus;
  paymentState: PaymentState;
  lockAt: Date | null;
  lockReason: LockReason | null;
  batchId: string;
  batch: { id: string; startDate: Date; whatsappGroupUrl: string | null };
}

export type Banner = "NO_BATCH" | "PENDING_PAYMENT" | "PENDING_APPROVAL" | "OVERDUE" | "LOCKED_MANUAL" | "REJECTED" | "CANCELLED" | null;

export interface Entitlements {
  enrollmentId: string | null;
  banner: Banner;
  active: boolean;
  fullyPaid: boolean;
  canCheckout: boolean; // first payment (full or advance)
  canPayBalance: boolean;
  live: { ownBatchId: string; laterBatchesAfter: Date | null } | null;
  recordingsBatchId: string | null;
  whatsappGroupUrl: string | null;
  mentorship: boolean;
}

const NONE: Omit<Entitlements, "banner" | "enrollmentId"> = {
  active: false,
  fullyPaid: false,
  canCheckout: false,
  canPayBalance: false,
  live: null,
  recordingsBatchId: null,
  whatsappGroupUrl: null,
  mentorship: false,
};

export function entitlements(e: EntitlementEnrollment | null, at: Date): Entitlements {
  if (!e) return { ...NONE, enrollmentId: null, banner: "NO_BATCH" };

  const overdue = isOverdue(e, at);
  const fullyPaid = e.paymentState === "PAID";
  const canPayBalance = e.paymentState === "PARTIALLY_PAID" && ["PENDING_APPROVAL", "ACTIVE", "LOCKED"].includes(e.status);
  const base = { ...NONE, enrollmentId: e.id, fullyPaid, canPayBalance };

  switch (e.status) {
    case "PENDING_PAYMENT":
      return { ...base, banner: "PENDING_PAYMENT", canCheckout: e.paymentState === "UNPAID" };
    case "PENDING_APPROVAL":
      return { ...base, banner: "PENDING_APPROVAL" };
    case "REJECTED":
      return { ...base, banner: "REJECTED", canPayBalance: false };
    case "CANCELLED":
      return { ...base, banner: "CANCELLED", canPayBalance: false };
    case "LOCKED":
      return { ...base, banner: e.lockReason === "MANUAL" ? "LOCKED_MANUAL" : "OVERDUE" };
    case "ACTIVE":
      if (overdue) return { ...base, banner: "OVERDUE" };
      return {
        ...base,
        banner: null,
        active: true,
        live: { ownBatchId: e.batchId, laterBatchesAfter: fullyPaid ? e.batch.startDate : null },
        recordingsBatchId: e.batchId,
        whatsappGroupUrl: e.batch.whatsappGroupUrl,
        mentorship: true,
      };
  }
}

/** Can this student join a session of `session.batch`? (time window is checked separately) */
export function canAccessLiveSession(ent: Entitlements, session: { batchId: string; openToAlumni: boolean; batchStartDate: Date }) {
  if (!ent.live) return false;
  if (session.batchId === ent.live.ownBatchId) return true;
  return !!ent.live.laterBatchesAfter && session.openToAlumni && session.batchStartDate.getTime() > ent.live.laterBatchesAfter.getTime();
}

export function canWatchRecording(ent: Entitlements, recording: { batchId: string; status: string }) {
  return !!ent.recordingsBatchId && recording.batchId === ent.recordingsBatchId && recording.status === "PUBLISHED";
}
