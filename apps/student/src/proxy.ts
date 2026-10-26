import { redirectSignedOut } from "@edge/web/proxy";
import type { NextRequest } from "next/server";

/** Signed-out visitors to the portal go to /login before anything renders; the layout does the real check. `/` is the public landing page. */
export function proxy(req: NextRequest) {
  return redirectSignedOut(req, "/login");
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/batch/:path*",
    "/classes/:path*",
    "/recordings/:path*",
    "/payments/:path*",
    "/checkout/:path*",
    "/notifications/:path*",
    "/profile/:path*",
    "/change-password/:path*",
    "/docs/:path*",
  ],
};
