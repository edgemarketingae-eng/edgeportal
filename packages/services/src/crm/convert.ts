import { randomBytes } from "node:crypto";
import { AuthUser, AuthVerification, Batch, CrmTask, Enrollment, isDuplicateKey, Lead, StudentProfile, Types, withTx } from "@edge/db";
import { OPEN_TASK_STATUSES } from "@edge/domain/crm/enums";
import { now } from "@edge/domain/clock";
import type { Actor } from "@edge/domain/enums";
import { hashPassword } from "better-auth/crypto";
import { audit } from "../audit";
import { recordEvent } from "../enrollment/service";
import { env } from "../env";
import { BusinessError, NotFoundError, TransitionError } from "../errors";
import { oid } from "../ids";
import { queueEmail } from "../notifications/email";
import { flushOutbox } from "../runtime";
import { createUserWithPasswordHash, tempPassword } from "../staff/service";
import { findAccountByContact, loadLead, lockLead, recomputeNextFollowUp, recordActivity } from "./common";
import { assertLeadVisible, type CrmScope } from "./scope";

const SET_PASSWORD_DAYS = 7;

/** A Better Auth password-reset token (the student app's /reset-password page consumes it). Call outside withTx. */
function mintSetPasswordToken() {
  const token = randomBytes(24).toString("base64url");
  return { token, expiresAt: new Date(now().getTime() + SET_PASSWORD_DAYS * 86_400_000), url: `${env.STUDENT_APP_URL}/reset-password?token=${token}` };
}

async function storeToken(userId: Types.ObjectId, t: ReturnType<typeof mintSetPasswordToken>) {
  const at = now();
  await AuthVerification.create([{ identifier: `reset-password:${t.token}`, value: String(userId), expiresAt: t.expiresAt, createdAt: at, updatedAt: at }]);
}

/**
 * Create the student account for a lead (name/email/phone), optionally enroll them in a batch, and
 * email a set-password link. The phone goes to pendingPhone so the normal verify-phone flow runs at
 * first sign-in. Never sets mustChangePassword (students have no change-password gate).
 */
export async function convertLeadToStudent(leadId: string, o: { batchId?: string; sendSetPassword?: boolean; actor: Actor & { type: "USER" }; scope: CrmScope }) {
  const lead = await loadLead(leadId, o.scope);
  if (lead.mergedIntoId) throw new TransitionError("This lead was merged into another lead");
  if (lead.stage === "CONVERTED" || lead.studentId) throw new TransitionError("This lead is already a student");
  if (!lead.phone) throw new BusinessError("Add a mobile number before converting", { phone: "Required" });
  if (!lead.email) throw new BusinessError("Add an email before converting", { email: "Required" });
  const account = await findAccountByContact({ phone: lead.phone, email: lead.email });
  if (account?.kind === "student") throw new BusinessError(`${account.name} is already a student with this mobile or email. Use “Link to existing student” instead.`);
  if (account) throw new BusinessError("This mobile number or email belongs to a staff account");
  const batch = o.batchId ? await Batch.findById(oid(o.batchId, "Batch")).lean() : null;
  if (o.batchId && !batch) throw new NotFoundError("Batch");

  // CPU work and token generation outside the (retryable) transaction.
  const passwordHash = await hashPassword(tempPassword());
  const token = mintSetPasswordToken();
  const at = now();
  const result = await withTx(async () => {
    const l = await lockLead(lead._id, { studentId: null, stage: { $ne: "CONVERTED" } });
    const userId = await createUserWithPasswordHash({ name: l.name, email: l.email!, passwordHash, emailVerified: false });
    await StudentProfile.create([{ _id: userId, country: l.country ?? "AE", pendingPhone: l.phone, marketingConsent: !!l.consent?.marketing, marketingConsentAt: l.consent?.marketingAt ?? null }]);
    let enrollmentId: Types.ObjectId | null = null;
    if (batch) {
      const [e] = await Enrollment.create([{ studentId: userId, batchId: batch._id, source: "CRM_CONVERTED", feeMinor: batch.feeMinor, currency: batch.currency }]);
      await recordEvent(e!, "CREATED", o.actor, { to: "PENDING_PAYMENT", data: { batchId: String(batch._id), source: "CRM_CONVERTED", leadId } });
      await audit({ actor: o.actor, action: "enrollment.assign", entityType: "Enrollment", entityId: String(e!._id), after: { batchId: String(batch._id), source: "CRM_CONVERTED", leadId } });
      enrollmentId = e!._id;
    }
    await Lead.updateOne({ _id: l._id }, { $set: { stage: "CONVERTED", stageChangedAt: at, studentId: userId, enrollmentId, convertedAt: at, convertedById: oid(o.actor.id), lastActivityAt: at } });
    await recordActivity(l._id, "CONVERTED", o.actor, { data: { studentId: String(userId), batchId: batch ? String(batch._id) : null, batchName: batch?.name ?? null, emailSent: o.sendSetPassword !== false } });
    await audit({ actor: o.actor, action: "lead.convert", entityType: "Lead", entityId: leadId, after: { studentId: String(userId), batchId: batch ? String(batch._id) : null } });
    if (o.sendSetPassword !== false) {
      await storeToken(userId, token);
      await queueEmail({
        to: l.email!,
        userId: String(userId),
        template: "crm.studentWelcome",
        data: { name: l.name, email: l.email!, batchName: batch?.name ?? null, setPasswordUrl: token.url, expiresDays: SET_PASSWORD_DAYS },
        dedupeKey: `crm-welcome:${leadId}`,
      });
    }
    return { studentId: String(userId), enrollmentId: enrollmentId ? String(enrollmentId) : null };
  });
  await flushOutbox();
  return result;
}

/** Re-send the set-password email to a converted lead's student account (new 7-day token). */
export async function resendWelcome(leadId: string, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const lead = await loadLead(leadId, scope);
  if (!lead.studentId) throw new TransitionError("This lead has no student account yet");
  const user = await AuthUser.findById(lead.studentId, { name: 1, email: 1 }).lean();
  if (!user) throw new NotFoundError("Student");
  const token = mintSetPasswordToken();
  await withTx(async () => {
    await storeToken(user._id, token);
    await queueEmail({ to: user.email, userId: String(user._id), template: "crm.studentWelcome", data: { name: user.name, email: user.email, batchName: null, setPasswordUrl: token.url, expiresDays: SET_PASSWORD_DAYS } });
    await recordActivity(lead._id, "SYSTEM", actor, { body: "Set-password email sent again", data: { studentId: String(user._id) } });
    await audit({ actor, action: "crm.welcome.resend", entityType: "Lead", entityId: leadId, after: { studentId: String(user._id) } });
  });
  await flushOutbox();
}

/** Attach a lead to an existing student (the "already a student" case). Reads the enrollment, never creates one. */
export async function linkLeadToStudent(leadId: string, studentId: string, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const sid = oid(studentId, "Student");
  const [user, profile] = await Promise.all([AuthUser.findById(sid, { name: 1 }).lean(), StudentProfile.findById(sid, { _id: 1 }).lean()]);
  if (!user || !profile) throw new NotFoundError("Student");
  const enrollment = await Enrollment.findOne({ studentId: sid, isCurrent: true }, { _id: 1 }).lean();
  const at = now();
  try {
    await withTx(async () => {
      const lead = await lockLead(oid(leadId, "Lead"), { studentId: null });
      assertLeadVisible(lead, scope);
      await Lead.updateOne({ _id: lead._id }, { $set: { stage: "CONVERTED", stageChangedAt: at, studentId: sid, enrollmentId: enrollment?._id ?? null, convertedAt: at, convertedById: oid(actor.id), lastActivityAt: at } });
      await recordActivity(lead._id, "LINKED", actor, { data: { studentId, name: user.name, via: "manual" } });
      await audit({ actor, action: "lead.link", entityType: "Lead", entityId: leadId, after: { studentId } });
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new BusinessError("This student is already linked to another lead");
    throw e;
  }
}

/** Used by tests and the detail page: open follow-ups left on a converted lead. */
export async function openTasksForLead(leadId: Types.ObjectId) {
  await recomputeNextFollowUp(leadId);
  return CrmTask.countDocuments({ leadId, status: { $in: [...OPEN_TASK_STATUSES] } });
}
