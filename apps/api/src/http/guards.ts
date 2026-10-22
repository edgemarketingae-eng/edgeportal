import { ApiError } from "@edge/contracts";
import type { Permission } from "@edge/domain/auth/permissions";
import { can, type Viewer } from "@edge/services";
import type { Request } from "express";

export function requireViewer(req: Request, opts: { allowMustChangePassword?: boolean } = {}): Viewer {
  const v = req.viewer;
  if (!v) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in.");
  if (v.user.mustChangePassword && !opts.allowMustChangePassword) throw new ApiError(403, "MUST_CHANGE_PASSWORD", "Choose a new password to continue.");
  return v;
}

export function requireStudent(req: Request) {
  const v = requireViewer(req);
  if (!v.student) throw new ApiError(403, "FORBIDDEN", "This area is for students.");
  if (!v.user.phoneNumberVerified || v.student.pendingPhone) throw new ApiError(403, "PHONE_NOT_VERIFIED", "Verify your mobile number first.");
  return { ...v, student: v.student };
}

export function requirePermission(req: Request, ...perms: Permission[]) {
  const v = requireViewer(req);
  if (!can(v.permissions, ...perms)) throw new ApiError(403, "FORBIDDEN", "You do not have permission to do that.");
  if (v.twoFactorRequired && !v.user.twoFactorEnabled) throw new ApiError(403, "TWO_FACTOR_REQUIRED", "Turn on two-factor authentication to continue.");
  return v;
}

export function actorOf(v: Viewer) {
  return { type: "USER" as const, id: v.userId };
}

/** At least one of `perms` (for areas shared by mentors and admins). */
export function requireAnyPermission(req: Request, ...perms: Permission[]) {
  const v = requireViewer(req);
  if (!perms.some((p) => can(v.permissions, p))) throw new ApiError(403, "FORBIDDEN", "You do not have permission to do that.");
  if (v.twoFactorRequired && !v.user.twoFactorEnabled) throw new ApiError(403, "TWO_FACTOR_REQUIRED", "Turn on two-factor authentication to continue.");
  return v;
}
