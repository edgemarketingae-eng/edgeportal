import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic sign-in check for an app's proxy.ts: a page load without a session cookie goes
 * straight to `login` instead of rendering a portal layout only to redirect from it. Only the
 * cookie's presence is checked, so the layouts still verify the viewer (expired session, wrong
 * account type, pending security steps). Server Actions (POST) keep their own auth handling. With `next`, the login page
 * gets ?next=<this path> so it can send the person back once they're in.
 */
export function redirectSignedOut(req: NextRequest, login: string, opts: { next?: boolean } = {}) {
  if (req.method !== "GET" || getSessionCookie(req)) return;
  const to = new URL(login, req.url);
  // Come back here after signing in (e.g. the CRM's Claude consent page).
  if (opts.next && req.nextUrl.pathname !== "/") to.searchParams.set("next", `${req.nextUrl.pathname}${req.nextUrl.search}`);
  return NextResponse.redirect(to);
}
