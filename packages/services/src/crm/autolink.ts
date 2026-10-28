import { AuthUser, Enrollment, isDuplicateKey, Lead, LeadActivity, Payment, StudentProfile, Types } from "@edge/db";
import { now } from "@edge/domain/clock";
import type { Actor } from "@edge/domain/enums";
import { formatMoney } from "@edge/domain/money";
import { notifyUser } from "../notifications/in-app";
import { leadHref, recordActivity } from "./common";
import { recordStudentConversion } from "./products";

export interface AutoLinkHint {
  phone?: string | null;
  email?: string | null;
  reason: "signup" | "verified" | "payment" | "manual";
  paymentId?: string | null;
}

/**
 * Job handler (at-least-once): when a student signs up or pays, find the unlinked lead with the same
 * phone or email and mark it CONVERTED. Idempotent through the `studentId: null` filter and the
 * partial-unique index on studentId. A linked lead also gets a "payment received" timeline entry.
 */
export async function linkLeadForStudent(userId: string, hint: AutoLinkHint, actor: Actor = { type: "SYSTEM", id: "crm-autolink" }) {
  if (!Types.ObjectId.isValid(userId) || userId.length !== 24) return { linked: false as const, reason: "bad id" };
  const _id = new Types.ObjectId(userId);
  const [u, p] = await Promise.all([
    AuthUser.findById(_id, { name: 1, email: 1, phoneNumber: 1 }).lean(),
    StudentProfile.findById(_id, { pendingPhone: 1 }).lean(),
  ]);
  if (!u || !p) return { linked: false as const, reason: "not a student" };

  const already = await Lead.findOne({ studentId: _id, mergedIntoId: null }).lean();
  if (already) {
    if (hint.reason === "payment" && hint.paymentId) await notePayment(already._id, hint.paymentId, actor);
    return { linked: false as const, reason: "already linked", leadId: String(already._id) };
  }

  const phones = [hint.phone, u.phoneNumber, p.pendingPhone].filter((x): x is string => !!x);
  const emails = [hint.email, u.email].filter((x): x is string => !!x).map((e) => e.toLowerCase());
  const or: Record<string, unknown>[] = [];
  if (phones.length) or.push({ phone: { $in: phones } });
  if (emails.length) or.push({ email: { $in: emails } });
  if (!or.length) return { linked: false as const, reason: "no contact" };
  // Prefer a live lead (open, or already converted to a product such as Inner Circle); a LOST lead that signs up anyway is still a win.
  const lead =
    (await Lead.findOne({ studentId: null, mergedIntoId: null, stage: { $ne: "LOST" }, $or: or })
      .sort({ createdAt: -1 })
      .lean()) ?? (await Lead.findOne({ studentId: null, mergedIntoId: null, $or: or }).sort({ createdAt: -1 }).lean());
  if (!lead) return { linked: false as const, reason: "no lead" };

  const e = await Enrollment.findOne({ studentId: _id, isCurrent: true }, { _id: 1 }).lean();
  const at = now();
  let r;
  try {
    r = await Lead.updateOne(
      { _id: lead._id, studentId: null },
      {
        $set: {
          studentId: _id,
          enrollmentId: e?._id ?? null,
          stage: "CONVERTED",
          stageChangedAt: lead.stage === "CONVERTED" ? (lead.stageChangedAt ?? at) : at,
          convertedAt: lead.convertedAt ?? at,
          lastActivityAt: at,
        },
      },
    );
  } catch (err) {
    if (isDuplicateKey(err)) return { linked: false as const, reason: "already linked" };
    throw err;
  }
  if (r.modifiedCount !== 1) return { linked: false as const, reason: "raced" };
  await recordActivity(lead._id, "CONVERTED", actor, { data: { via: hint.reason, studentId: userId, auto: true } });
  try {
    await recordStudentConversion(lead._id, actor, at);
  } catch (err) {
    if (!isDuplicateKey(err)) throw err; // a concurrent run recorded it
  }
  if (hint.reason === "payment" && hint.paymentId) await notePayment(lead._id, hint.paymentId, actor);
  if (lead.ownerId) {
    await notifyUser(String(lead.ownerId), {
      title: `${lead.name} is now a student`,
      body: hint.reason === "payment" ? "They just made a payment." : "They signed up on the student portal.",
      href: leadHref(lead._id),
    });
  }
  return { linked: true as const, leadId: String(lead._id) };
}

/** One "Payment received" entry per payment on the lead timeline (idempotent). */
async function notePayment(leadId: Types.ObjectId, paymentId: string, actor: Actor) {
  if (!Types.ObjectId.isValid(paymentId)) return;
  if (await LeadActivity.exists({ leadId, type: "SYSTEM", "data.paymentId": paymentId })) return;
  const p = await Payment.findById(paymentId, { totalMinor: 1, currency: 1, kind: 1 }).lean();
  if (!p) return;
  await recordActivity(leadId, "SYSTEM", actor, {
    body: `Payment received: ${formatMoney(p.totalMinor, p.currency)} (${p.kind.toLowerCase()})`,
    data: { paymentId, totalMinor: p.totalMinor, kind: p.kind },
  });
  await Lead.updateOne({ _id: leadId }, { $set: { lastActivityAt: now() } });
}
