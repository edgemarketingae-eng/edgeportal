import { AuthUser, Batch, Enrollment, StudentProfile, Types } from "@edge/db";
import type { MailerLiteApi } from "@edge/integrations/mailerlite/client";
import { runtime } from "../runtime";

/**
 * Only students with marketing consent are synced. The portal owns groups prefixed "Portal · "
 * (all students, batch, enrollment status, payment state); other groups are never touched.
 */
export const GROUP_PREFIX = "Portal · ";

const STATUS_LABEL: Record<string, string> = { PENDING_PAYMENT: "Awaiting payment", PENDING_APPROVAL: "Awaiting approval", ACTIVE: "Active", LOCKED: "Locked", REJECTED: "Rejected", CANCELLED: "Cancelled" };
const PAYMENT_LABEL: Record<string, string> = { UNPAID: "Unpaid", PARTIALLY_PAID: "Advance paid", PAID: "Fully paid" };

export async function desiredGroups(userId: string) {
  const e = await Enrollment.findOne({ studentId: new Types.ObjectId(userId), isCurrent: true }).lean();
  const batch = e ? await Batch.findById(e.batchId, { code: 1 }).lean() : null;
  const names = [`${GROUP_PREFIX}All students`];
  if (e && batch) names.push(`${GROUP_PREFIX}Batch ${batch.code}`, `${GROUP_PREFIX}Status: ${STATUS_LABEL[e.status]}`, `${GROUP_PREFIX}Payment: ${PAYMENT_LABEL[e.paymentState]}`);
  else names.push(`${GROUP_PREFIX}No batch`);
  return names;
}

export async function syncStudentToMailerLite(userId: string, client: MailerLiteApi = runtime().mailerlite) {
  if (!Types.ObjectId.isValid(userId)) return { skipped: "bad id" };
  const _id = new Types.ObjectId(userId);
  const [s, u] = await Promise.all([StudentProfile.findById(_id).lean(), AuthUser.findById(_id).lean()]);
  if (!s || !u || !u.phoneNumberVerified) return { skipped: "not a verified student" };
  if (!s.marketingConsent) {
    if (!s.mailerliteSubscriberId) return { skipped: "no consent" };
    await client.upsertSubscriber({ email: u.email, name: u.name, phone: u.phoneNumber ?? null, country: s.country ?? "AE", status: "unsubscribed" });
    return { unsubscribed: true };
  }
  const sub = await client.upsertSubscriber({ email: u.email, name: u.name, phone: u.phoneNumber ?? null, country: s.country ?? "AE", status: "active" });
  if (sub.id !== s.mailerliteSubscriberId) await StudentProfile.updateOne({ _id }, { $set: { mailerliteSubscriberId: sub.id } });
  const wanted = await desiredGroups(userId);
  const wantedIds = new Map<string, string>();
  for (const name of wanted) wantedIds.set(await client.findOrCreateGroup(name), name);
  const current = sub.groupNames.filter((g) => g.name.startsWith(GROUP_PREFIX));
  for (const g of current) if (!wantedIds.has(g.id)) await client.removeFromGroup(sub.id, g.id);
  const currentIds = new Set(current.map((g) => g.id));
  for (const id of wantedIds.keys()) if (!currentIds.has(id)) await client.addToGroup(sub.id, id);
  return { synced: true, groups: wanted };
}

export async function syncAllStudents() {
  const ids = await StudentProfile.find({ $or: [{ marketingConsent: true }, { mailerliteSubscriberId: { $ne: null } }] }, { _id: 1 }).lean();
  for (const { _id } of ids) await runtime().producer.send("mailerlite.sync", { userId: String(_id) }, { dedupeId: `ml-${_id}` }).catch(() => undefined);
  return { queued: ids.length };
}
