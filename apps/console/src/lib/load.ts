import "server-only";
import type { ViewerDto } from "@edge/contracts";
import type { Permission } from "@edge/domain/auth/permissions";
import { getViewer, loader } from "@edge/web/server";
import { redirect } from "next/navigation";

export const ROUTES = { login: "/login", changePassword: "/change-password", security: "/security" };

/** Page data loader: API auth errors become redirects, 404 becomes notFound(). */
export const load = loader(ROUTES);

export function can(v: Pick<ViewerDto, "permissions">, ...perms: Permission[]) {
  return perms.every((p) => v.permissions.includes(p));
}

/**
 * The signed-in staff member with every permission in `perms`, or a redirect: sign-in,
 * temporary password, mandatory 2FA for admin permissions, or the area they can open.
 */
export async function requireStaff(...perms: Permission[]) {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (!v.staff) redirect("/login?error=student");
  if (v.user.mustChangePassword) redirect("/change-password");
  if (v.twoFactorRequired && !v.user.twoFactorEnabled) redirect("/security?required=1");
  if (!can(v, ...perms)) redirect(v.homes.console ? `${v.homes.console}?error=forbidden` : "/login?error=no-access");
  return { ...v, staff: v.staff };
}
