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

/** Where the other apps live (read at request time; the root .env is loaded by next.config.ts). */
export const CONSOLE_URL = () => process.env.CONSOLE_APP_URL ?? "http://console.localhost:3001";

/**
 * The signed-in CRM user with every permission in `perms`, or a redirect: sign-in, temporary
 * password, mandatory 2FA for CRM admins, or the dashboard with a "forbidden" notice.
 */
export async function requireCrm(...perms: Permission[]) {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (!v.staff) redirect("/login?error=student");
  if (v.user.mustChangePassword) redirect("/change-password");
  if (v.twoFactorRequired && !v.user.twoFactorEnabled) redirect("/security?required=1");
  if (!v.homes.crm) redirect("/login?error=no-access");
  if (!can(v, ...perms)) redirect("/dashboard?error=forbidden");
  return { ...v, staff: v.staff };
}
