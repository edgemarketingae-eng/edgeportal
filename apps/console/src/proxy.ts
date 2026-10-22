import { redirectSignedOut } from "@edge/web/proxy";
import type { NextRequest } from "next/server";

/** Signed-out visitors to the console go to /login before anything renders; the layouts do the real check. */
export function proxy(req: NextRequest) {
  return redirectSignedOut(req, "/login");
}

export const config = {
  matcher: ["/", "/admin/:path*", "/staff/:path*"],
};
