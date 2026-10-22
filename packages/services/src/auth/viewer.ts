import { AuthUser, InAppNotification, Role, StaffProfile, StudentProfile, Types } from "@edge/db";
import { isPermission, type Permission } from "@edge/domain/auth/permissions";
import type { ViewerDto } from "@edge/contracts";
import { env } from "../env";

/** Roles change rarely; cache them briefly and clear on save. */
let roleCache: { at: number; map: Map<string, string[]> } | null = null;
export function invalidateRoleCache() {
  roleCache = null;
}

async function roleMap(force = false) {
  if (force || !roleCache || Date.now() - roleCache.at > 60_000) {
    const roles = await Role.find({}, { permissions: 1 }).lean();
    roleCache = { at: Date.now(), map: new Map(roles.map((r) => [String(r._id), r.permissions ?? []])) };
  }
  return roleCache.map;
}

export async function permissionsFor(roleIds: (Types.ObjectId | string)[]): Promise<Set<Permission>> {
  let map = await roleMap();
  // A role created or re-seeded since the cache was built: reload once.
  if (roleIds.some((id) => !map.has(String(id)))) map = await roleMap(true);
  const perms = new Set<Permission>();
  for (const id of roleIds) for (const p of map.get(String(id)) ?? []) if (isPermission(p)) perms.add(p);
  return perms;
}

export function can(perms: Set<Permission> | Permission[], ...required: Permission[]) {
  const set = perms instanceof Set ? perms : new Set(perms);
  return required.every((p) => set.has(p));
}

export function twoFactorRequired(perms: Set<Permission>) {
  const required = env.REQUIRE_ADMIN_2FA ?? env.NODE_ENV === "production";
  return required && perms.has("admin.access");
}

export interface Viewer {
  userId: string;
  user: { id: string; name: string; email: string; phoneNumber: string | null; phoneNumberVerified: boolean; twoFactorEnabled: boolean; mustChangePassword: boolean; disabledAt: Date | null };
  permissions: Set<Permission>;
  student: { country: string; pendingPhone: string | null; jetaFxClientId: string | null; marketingConsent: boolean; marketingConsentAt: Date | null } | null;
  staff: { title: string | null; workspaceEmail: string | null } | null;
  twoFactorRequired: boolean;
}

export async function loadViewer(userId: string): Promise<Viewer | null> {
  if (!Types.ObjectId.isValid(userId)) return null;
  const _id = new Types.ObjectId(userId);
  const [u, student, staff] = await Promise.all([AuthUser.findById(_id).lean(), StudentProfile.findById(_id).lean(), StaffProfile.findById(_id).lean()]);
  if (!u) return null;
  const permissions = staff ? await permissionsFor(staff.roleIds ?? []) : new Set<Permission>();
  return {
    userId,
    user: {
      id: userId,
      name: u.name,
      email: u.email,
      phoneNumber: u.phoneNumber ?? null,
      phoneNumberVerified: !!u.phoneNumberVerified,
      twoFactorEnabled: !!u.twoFactorEnabled,
      mustChangePassword: !!u.mustChangePassword,
      disabledAt: u.disabledAt ?? null,
    },
    permissions,
    student: student
      ? { country: student.country ?? "AE", pendingPhone: student.pendingPhone ?? null, jetaFxClientId: student.jetaFxClientId ?? null, marketingConsent: !!student.marketingConsent, marketingConsentAt: student.marketingConsentAt ?? null }
      : null,
    staff: staff ? { title: staff.title ?? null, workspaceEmail: staff.workspaceEmail ?? null } : null,
    twoFactorRequired: twoFactorRequired(permissions),
  };
}

/** Landing page per app; null means this account cannot use that app. */
export function homesFor(v: Viewer): { student: string | null; console: string | null } {
  const student = v.student ? (v.user.phoneNumberVerified && !v.student.pendingPhone ? "/dashboard" : "/verify-phone") : null;
  let consoleHome: string | null = null;
  if (v.staff && (v.permissions.has("admin.access") || v.permissions.has("staff.access"))) {
    if (v.user.mustChangePassword) consoleHome = "/change-password";
    else if (v.twoFactorRequired && !v.user.twoFactorEnabled) consoleHome = "/security?required=1";
    else consoleHome = v.permissions.has("admin.access") ? "/admin" : "/staff";
  }
  return { student, console: consoleHome };
}

export async function toViewerDto(v: Viewer): Promise<ViewerDto> {
  const unread = await InAppNotification.countDocuments({ userId: new Types.ObjectId(v.userId), readAt: null });
  return {
    user: { id: v.user.id, name: v.user.name, email: v.user.email, phoneNumber: v.user.phoneNumber, phoneNumberVerified: v.user.phoneNumberVerified, twoFactorEnabled: v.user.twoFactorEnabled, mustChangePassword: v.user.mustChangePassword },
    permissions: [...v.permissions],
    student: v.student ? { country: v.student.country, pendingPhone: v.student.pendingPhone, jetaFxClientId: v.student.jetaFxClientId, marketingConsent: v.student.marketingConsent } : null,
    staff: v.staff,
    twoFactorRequired: v.twoFactorRequired,
    unreadNotifications: unread,
    homes: homesFor(v),
  };
}
