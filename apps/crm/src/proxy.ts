import { redirectSignedOut } from "@edge/web/proxy";
import type { NextRequest } from "next/server";

/** Signed-out visitors to the CRM go to /login before anything renders; the layouts do the real check. */
export function proxy(req: NextRequest) {
  return redirectSignedOut(req, "/login");
}

export const config = {
  matcher: ["/", "/dashboard", "/leads/:path*", "/tasks/:path*", "/projects/:path*", "/team/:path*", "/import", "/settings", "/notifications"],
};
