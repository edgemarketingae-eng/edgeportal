import { AuthUser, InAppNotification, Role, StaffProfile, Types } from "@edge/db";
import type { Permission } from "@edge/domain/auth/permissions";

/** In-app notification for every active staff member whose roles grant `permission`. */
export async function notifyPermissionHolders(permission: Permission, n: { title: string; body: string; href?: string }) {
  const roleIds = (await Role.find({ permissions: permission }, { _id: 1 }).lean()).map((r) => r._id);
  if (!roleIds.length) return 0;
  const staff = await StaffProfile.find({ roleIds: { $in: roleIds } }, { _id: 1 }).lean();
  const active = await AuthUser.find({ _id: { $in: staff.map((s) => s._id) }, disabledAt: null }, { _id: 1 }).lean();
  if (!active.length) return 0;
  await InAppNotification.create(active.map((u) => ({ userId: u._id, title: n.title, body: n.body, href: n.href ?? null })));
  return active.length;
}

export async function notifyUser(userId: string, n: { title: string; body: string; href?: string }) {
  await InAppNotification.create([{ userId: new Types.ObjectId(userId), title: n.title, body: n.body, href: n.href ?? null }]);
}

export async function listNotifications(userId: string, markRead = true) {
  const uid = new Types.ObjectId(userId);
  const items = await InAppNotification.find({ userId: uid }).sort({ createdAt: -1 }).limit(50).lean();
  if (markRead && items.some((i) => !i.readAt)) await InAppNotification.updateMany({ userId: uid, readAt: null }, { $set: { readAt: new Date() } });
  return items.map((i) => ({ id: String(i._id), title: i.title ?? "", body: i.body ?? "", href: i.href ?? null, readAt: i.readAt?.toISOString() ?? null, createdAt: (i as { createdAt?: Date }).createdAt?.toISOString() ?? "" }));
}
