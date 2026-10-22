import "server-only";
import { studentRoutes } from "@edge/contracts";
import { api, getViewer, loader } from "@edge/web/server";
import { cache } from "react";
import { redirect } from "next/navigation";

export const ROUTES = { login: "/login", verifyPhone: "/verify-phone" };

/** Page data loader: API auth errors become redirects, 404 becomes notFound(). */
export const load = loader(ROUTES);

/** The signed-in student, or a redirect to where they need to go first. */
export async function requireStudent() {
  const v = await getViewer();
  if (!v) redirect("/login");
  if (!v.student) redirect(`/login?error=${v.staff ? "staff" : "no-access"}`);
  if (!v.user.phoneNumberVerified || v.student.pendingPhone) redirect("/verify-phone");
  return { ...v, student: v.student };
}

/** Portal state (enrollment, entitlements, banner), fetched once per request. */
export const getPortal = cache(() => load(() => api(studentRoutes.portal)));
