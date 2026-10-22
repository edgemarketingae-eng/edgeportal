import { AuthUser, Batch, Course, Enrollment, EnrollmentEvent, isDuplicateKey, lockForUpdate, StudentProfile, Types, withTx, type BatchDoc, type CourseDoc, type EnrollmentDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import { daysUntil, formatDate } from "@edge/domain/dates";
import { ALLOWED_FROM, computeBalanceDue, isOverdue, remainingMinor, type EnrollmentSnapshot, type EnrollmentStatus, type TransitionName } from "@edge/domain/enrollment/machine";
import type { Actor } from "@edge/domain/enums";
import { enqueueInTx } from "@edge/jobs";
import { audit } from "../audit";
import { env } from "../env";
import { NotFoundError, TransitionError } from "../errors";
import { oid } from "../ids";
import { queueEmail } from "../notifications/email";
import { flushOutbox } from "../runtime";
import { getSetting } from "../settings";

export type EnrollmentRow = EnrollmentDoc;
export interface EnrollmentFull {
  e: EnrollmentDoc;
  batch: BatchDoc;
  course: CourseDoc;
  user: { id: string; name: string; email: string; phoneNumber: string | null };
  profile: { country: string; jetaFxClientId: string | null };
}

const dashboardUrl = () => `${env.STUDENT_APP_URL}/dashboard`;
const balanceUrl = () => `${env.STUDENT_APP_URL}/checkout/balance`;

export function toSnapshot(e: EnrollmentDoc, batch: BatchDoc): EnrollmentSnapshot {
  return {
    status: e.status as EnrollmentStatus,
    paymentState: e.paymentState as EnrollmentSnapshot["paymentState"],
    feeMinor: e.firstPaidAt ? e.feeMinor : batch.feeMinor,
    paidCourseMinor: e.paidCourseMinor ?? 0,
    balanceDueOn: e.balanceDueOn ?? null,
    lockAt: e.lockAt ?? null,
    lockReason: (e.lockReason as EnrollmentSnapshot["lockReason"]) ?? null,
    firstPaidAt: e.firstPaidAt ?? null,
    fullyPaidAt: e.fullyPaidAt ?? null,
    vatTreatment: (e.vatTreatment as EnrollmentSnapshot["vatTreatment"]) ?? null,
    taxCountry: e.taxCountry ?? null,
  };
}

export function batchTerms(b: BatchDoc) {
  return { balanceDueRule: b.balanceDueRule as "FIXED_DATE" | "DAYS_AFTER_FIRST_PAYMENT", balanceDueDate: b.balanceDueDate ?? null, balanceDueDays: b.balanceDueDays ?? null, lockGraceDays: b.lockGraceDays ?? 0 };
}

/** Append-only history plus a debounced MailerLite resync (both join the surrounding transaction). */
export async function recordEvent(
  e: Pick<EnrollmentDoc, "_id" | "studentId">,
  type: string,
  actor: Actor,
  opts: { from?: string | null; to?: string | null; data?: Record<string, unknown> } = {},
) {
  await EnrollmentEvent.create([{ enrollmentId: e._id, type, fromStatus: opts.from ?? null, toStatus: opts.to ?? null, data: opts.data ?? {}, actorType: actor.type, actorId: actor.id ?? null }]);
  await enqueueInTx("mailerlite.sync", { userId: String(e.studentId) }, { dedupeId: `ml-${e.studentId}`, delayMs: 30_000 });
}

export async function loadFull(e: EnrollmentDoc): Promise<EnrollmentFull> {
  const [batch, user, profile] = await Promise.all([Batch.findById(e.batchId).lean(), AuthUser.findById(e.studentId).lean(), StudentProfile.findById(e.studentId).lean()]);
  if (!batch || !user) throw new NotFoundError("Enrollment");
  const course = await Course.findById(batch.courseId).lean();
  if (!course) throw new NotFoundError("Course");
  return {
    e,
    batch,
    course,
    user: { id: String(user._id), name: user.name, email: user.email, phoneNumber: user.phoneNumber ?? null },
    profile: { country: profile?.country ?? "AE", jetaFxClientId: profile?.jetaFxClientId ?? null },
  };
}

/** The batch new students join automatically (one current batch per course; one course today). */
export async function getCurrentBatch() {
  const batches = await Batch.find({ isCurrentForEnrollment: true, status: { $in: ["OPEN", "RUNNING"] } }).sort({ startDate: 1 }).lean();
  for (const b of batches) {
    const course = await Course.findOne({ _id: b.courseId, isActive: true }).lean();
    if (course) return { batch: b, course };
  }
  return null;
}

export async function getCurrentEnrollment(studentId: string | Types.ObjectId): Promise<EnrollmentFull | null> {
  const e = await Enrollment.findOne({ studentId: oid(studentId, "Student"), isCurrent: true }).lean();
  return e ? loadFull(e) : null;
}

/** After phone verification: place the student in the current batch if they have no enrollment. */
export async function ensureCurrentEnrollment(studentId: string, actor: Actor) {
  const sid = oid(studentId, "Student");
  const existing = await Enrollment.findOne({ studentId: sid, isCurrent: true }).lean();
  if (existing) return existing;
  const current = await getCurrentBatch();
  if (!current) return null;
  try {
    const created = await withTx(async () => {
      const [doc] = await Enrollment.create([{ studentId: sid, batchId: current.batch._id, source: "AUTO_CURRENT_BATCH", feeMinor: current.batch.feeMinor, currency: current.batch.currency }]);
      await recordEvent(doc!, "CREATED", actor, { to: "PENDING_PAYMENT", data: { batchId: String(current.batch._id), source: "AUTO_CURRENT_BATCH" } });
      return doc!.toObject() as EnrollmentDoc;
    });
    await flushOutbox();
    return created;
  } catch (e) {
    if (isDuplicateKey(e)) return Enrollment.findOne({ studentId: sid, isCurrent: true }).lean(); // a concurrent request won
    throw e;
  }
}

async function explainTransition(id: Types.ObjectId, action: TransitionName): Promise<never> {
  const e = await Enrollment.findById(id).lean();
  if (!e) throw new NotFoundError("Enrollment");
  if (action === "approve" && e.status === "PENDING_APPROVAL" && e.paymentState === "UNPAID") throw new TransitionError("Cannot approve before a payment is received");
  throw new TransitionError(`Cannot ${action} an enrollment that is ${e.status}`);
}

export async function approveEnrollment(id: string, actor: Actor & { type: "USER" }) {
  const _id = oid(id, "Enrollment");
  await withTx(async () => {
    const before = await Enrollment.findOneAndUpdate(
      { _id, status: { $in: ALLOWED_FROM.approve }, paymentState: { $ne: "UNPAID" } },
      { $set: { status: "ACTIVE", approvedAt: now(), approvedById: oid(actor.id) }, $inc: { rev: 1 } },
      { returnDocument: "before" },
    ).lean();
    if (!before) await explainTransition(_id, "approve");
    const full = await loadFull(before!);
    await recordEvent(before!, "APPROVED", actor, { from: before!.status, to: "ACTIVE" });
    await audit({ actor, action: "enrollment.approve", entityType: "Enrollment", entityId: id, before: { status: before!.status }, after: { status: "ACTIVE" } });
    await queueEmail({
      to: full.user.email,
      userId: full.user.id,
      template: "enrollment.approved",
      data: { name: full.user.name, batchName: full.batch.name, dashboardUrl: dashboardUrl(), whatsappGroupUrl: full.batch.whatsappGroupUrl ?? null },
      dedupeKey: `approved:${id}`,
    });
  });
  await flushOutbox();
}

export async function rejectEnrollment(id: string, actor: Actor & { type: "USER" }, reason: string) {
  if (!reason.trim()) throw new TransitionError("A reason is required");
  const _id = oid(id, "Enrollment");
  await withTx(async () => {
    const before = await Enrollment.findOneAndUpdate(
      { _id, status: { $in: ALLOWED_FROM.reject } },
      { $set: { status: "REJECTED", rejectedAt: now(), rejectedById: oid(actor.id), rejectionReason: reason }, $inc: { rev: 1 } },
      { returnDocument: "before" },
    ).lean();
    if (!before) await explainTransition(_id, "reject");
    const full = await loadFull(before!);
    const profile = await getSetting("academy.profile");
    await recordEvent(before!, "REJECTED", actor, { from: before!.status, to: "REJECTED", data: { reason } });
    await audit({ actor, action: "enrollment.reject", entityType: "Enrollment", entityId: id, before: { status: before!.status }, after: { status: "REJECTED", reason } });
    await queueEmail({ to: full.user.email, userId: full.user.id, template: "enrollment.rejected", data: { name: full.user.name, batchName: full.batch.name, reason, supportEmail: profile.supportEmail } });
  });
  await flushOutbox();
}

export async function lockEnrollment(id: string, actor: Actor & { type: "USER" }, note: string) {
  const _id = oid(id, "Enrollment");
  await withTx(async () => {
    const before = await Enrollment.findOneAndUpdate(
      { _id, status: { $in: ALLOWED_FROM.lock } },
      { $set: { status: "LOCKED", lockReason: "MANUAL", lockedAt: now(), lockedById: oid(actor.id), lockNote: note || null }, $inc: { rev: 1 } },
      { returnDocument: "before" },
    ).lean();
    if (!before) await explainTransition(_id, "lock");
    const full = await loadFull(before!);
    await recordEvent(before!, "LOCKED", actor, { from: "ACTIVE", to: "LOCKED", data: { reason: "MANUAL", note } });
    await audit({ actor, action: "enrollment.lock", entityType: "Enrollment", entityId: id, after: { note } });
    await queueEmail({
      to: full.user.email,
      userId: full.user.id,
      template: "enrollment.locked",
      data: { name: full.user.name, batchName: full.batch.name, balanceMinor: remainingMinor(toSnapshot(before!, full.batch)), currency: before!.currency ?? "AED", payUrl: balanceUrl(), manual: true, note },
    });
  });
  await flushOutbox();
}

/** Unlock; a still-overdue part-paid enrollment needs a new future due date or it would re-lock at once. */
export async function unlockEnrollment(id: string, actor: Actor & { type: "USER" }, newDueDate?: Date) {
  const _id = oid(id, "Enrollment");
  await withTx(async () => {
    const e = await lockForUpdate<EnrollmentDoc>(Enrollment, { _id });
    if (!(ALLOWED_FROM.unlock as readonly string[]).includes(e.status)) throw new TransitionError(`Cannot unlock an enrollment that is ${e.status}`);
    const full = await loadFull(e);
    const set: Record<string, unknown> = { status: "ACTIVE", lockReason: null, lockedAt: null, lockedById: null, lockNote: null };
    if (isOverdue(toSnapshot(e, full.batch), now())) {
      if (!newDueDate) throw new TransitionError("This student still owes a balance. Set a new due date to unlock.");
      const due = computeBalanceDue({ ...batchTerms(full.batch), balanceDueRule: "FIXED_DATE", balanceDueDate: newDueDate }, now());
      if (due.lockAt <= now()) throw new TransitionError("The new due date must be in the future");
      set.balanceDueOn = due.balanceDueOn;
      set.lockAt = due.lockAt;
    }
    await Enrollment.updateOne({ _id }, { $set: set });
    await recordEvent(e, "UNLOCKED", actor, { from: "LOCKED", to: "ACTIVE", data: { newDueDate: newDueDate?.toISOString() } });
    await audit({ actor, action: "enrollment.unlock", entityType: "Enrollment", entityId: id, after: { newDueDate } });
    await queueEmail({ to: full.user.email, userId: full.user.id, template: "enrollment.unlocked", data: { name: full.user.name, batchName: full.batch.name, dashboardUrl: dashboardUrl() } });
  });
  await flushOutbox();
}

/** Move the balance due date; re-activates an auto-locked enrollment when the date is in the future. */
export async function extendDueDate(id: string, actor: Actor & { type: "USER" }, newDueDate: Date) {
  const _id = oid(id, "Enrollment");
  await withTx(async () => {
    const e = await lockForUpdate<EnrollmentDoc>(Enrollment, { _id });
    if (e.paymentState !== "PARTIALLY_PAID") throw new TransitionError("Only part-paid enrollments have a balance due date");
    const full = await loadFull(e);
    const due = computeBalanceDue({ ...batchTerms(full.batch), balanceDueRule: "FIXED_DATE", balanceDueDate: newDueDate }, now());
    if (due.lockAt <= now()) throw new TransitionError("The new due date must be in the future");
    const reactivate = e.status === "LOCKED" && e.lockReason === "AUTO_OVERDUE";
    await Enrollment.updateOne({ _id }, { $set: { balanceDueOn: due.balanceDueOn, lockAt: due.lockAt, ...(reactivate ? { status: "ACTIVE", lockReason: null, lockedAt: null } : {}) } });
    await recordEvent(e, "DUE_CHANGED", actor, { from: e.status, to: reactivate ? "ACTIVE" : e.status, data: { from: e.balanceDueOn?.toISOString(), to: due.balanceDueOn.toISOString() } });
    await audit({ actor, action: "enrollment.extendDue", entityType: "Enrollment", entityId: id, before: { balanceDueOn: e.balanceDueOn }, after: { balanceDueOn: due.balanceDueOn } });
    if (reactivate) await queueEmail({ to: full.user.email, userId: full.user.id, template: "enrollment.unlocked", data: { name: full.user.name, batchName: full.batch.name, dashboardUrl: dashboardUrl() } });
  });
  await flushOutbox();
}

/** Move a student to another batch, keeping the money snapshot (fee only refreshes before the first payment). */
export async function changeBatch(id: string, actor: Actor & { type: "USER" }, toBatchId: string) {
  const _id = oid(id, "Enrollment");
  const target = await Batch.findById(oid(toBatchId, "Batch")).lean();
  if (!target) throw new NotFoundError("Batch");
  try {
    await withTx(async () => {
      const e = await lockForUpdate<EnrollmentDoc>(Enrollment, { _id });
      if (["REJECTED", "CANCELLED"].includes(e.status)) throw new TransitionError(`Cannot move a ${e.status} enrollment`);
      if (String(e.batchId) === String(target._id)) return;
      await Enrollment.updateOne({ _id }, { $set: { batchId: target._id, ...(e.firstPaidAt ? {} : { feeMinor: target.feeMinor }) } });
      await recordEvent(e, "BATCH_CHANGED", actor, { data: { from: String(e.batchId), to: String(target._id) } });
      await audit({ actor, action: "enrollment.changeBatch", entityType: "Enrollment", entityId: id, before: { batchId: String(e.batchId) }, after: { batchId: String(target._id) } });
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new TransitionError("The student already has an enrollment in that batch");
    throw e;
  }
  await flushOutbox();
}

/** Staff assignment for a student with no current enrollment (e.g. signed up while no batch was open). */
export async function assignStudentToBatch(studentId: string, batchId: string, actor: Actor & { type: "USER" }) {
  const current = await Enrollment.findOne({ studentId: oid(studentId, "Student"), isCurrent: true }).lean();
  if (current) return changeBatch(String(current._id), actor, batchId);
  const batch = await Batch.findById(oid(batchId, "Batch")).lean();
  if (!batch) throw new NotFoundError("Batch");
  try {
    await withTx(async () => {
      const [created] = await Enrollment.create([{ studentId: oid(studentId), batchId: batch._id, source: "STAFF_ASSIGNED", feeMinor: batch.feeMinor, currency: batch.currency }]);
      await recordEvent(created!, "CREATED", actor, { to: "PENDING_PAYMENT", data: { batchId, source: "STAFF_ASSIGNED" } });
      await audit({ actor, action: "enrollment.assign", entityType: "Enrollment", entityId: String(created!._id), after: { batchId } });
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new TransitionError("The student already has an enrollment");
    throw e;
  }
  await flushOutbox();
}

/** Hourly job: lock ACTIVE part-paid enrollments past lockAt. Idempotent (the filter re-checks). */
export async function runAutolock(asOf: Date = now()) {
  const due = await Enrollment.find({ status: "ACTIVE", paymentState: "PARTIALLY_PAID", lockAt: { $lt: asOf } }, { _id: 1 }).lean();
  let locked = 0;
  for (const { _id } of due) {
    const did = await withTx(async () => {
      const before = await Enrollment.findOneAndUpdate(
        { _id, status: "ACTIVE", paymentState: "PARTIALLY_PAID", lockAt: { $lt: asOf } },
        { $set: { status: "LOCKED", lockReason: "AUTO_OVERDUE", lockedAt: asOf }, $inc: { rev: 1 } },
        { returnDocument: "before" },
      ).lean();
      if (!before) return false;
      const full = await loadFull(before);
      await recordEvent(before, "LOCKED", { type: "SYSTEM", id: "autolock" }, { from: "ACTIVE", to: "LOCKED", data: { reason: "AUTO_OVERDUE", lockAt: before.lockAt } });
      await queueEmail({
        to: full.user.email,
        userId: full.user.id,
        template: "enrollment.locked",
        data: { name: full.user.name, batchName: full.batch.name, balanceMinor: remainingMinor(toSnapshot(before, full.batch)), currency: before.currency ?? "AED", payUrl: balanceUrl(), manual: false },
        dedupeKey: `autolock:${_id}:${before.lockAt?.toISOString()}`,
      });
      return true;
    });
    if (did) locked++;
  }
  if (locked) await flushOutbox();
  return { checked: due.length, locked };
}

/** Daily job: remind part-paid students before their due date (offsets from settings). Exactly-once via dedupe keys. */
export async function runBalanceReminders(asOf: Date = now()) {
  const offsets = await getSetting("reminders.balanceDueOffsetsDays");
  const rows = await Enrollment.find({ paymentState: "PARTIALLY_PAID", status: { $in: ["ACTIVE", "PENDING_APPROVAL"] }, balanceDueOn: { $ne: null } }).lean();
  let sent = 0;
  for (const e of rows) {
    const days = daysUntil(e.balanceDueOn!, asOf);
    if (!offsets.includes(days)) continue;
    const full = await loadFull(e);
    const id = await queueEmail({
      to: full.user.email,
      userId: full.user.id,
      template: "enrollment.balanceReminder",
      data: {
        name: full.user.name,
        batchName: full.batch.name,
        balanceMinor: remainingMinor(toSnapshot(e, full.batch)),
        currency: e.currency ?? "AED",
        balanceDueOn: e.balanceDueOn!.toISOString(),
        daysLeft: days,
        payUrl: balanceUrl(),
      },
      dedupeKey: `reminder:${e._id}:${formatDate(e.balanceDueOn!)}:${days}`,
    });
    if (id) sent++;
  }
  if (sent) await flushOutbox();
  return { candidates: rows.length, sent };
}

export async function getEnrollmentById(id: string) {
  const e = await Enrollment.findById(oid(id, "Enrollment")).lean();
  if (!e) throw new NotFoundError("Enrollment");
  return e;
}
