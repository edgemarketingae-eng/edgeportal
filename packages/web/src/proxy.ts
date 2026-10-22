import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic sign-in check for an app's proxy.ts: a page load without a session cookie goes
 * straight to `login` instead of rendering a portal layout only to redirect from it. Only the
 * cookie's presence is checked, so the layouts still verify the viewer (expired session, wrong
 * account type, pending security steps). Server Actions (POST) keep their own auth handling.
 */
export function redirectSignedOut(req: NextRequest, login: string) {
  if (req.method !== "GET" || getSessionCookie(req)) return;
  return NextResponse.redirect(new URL(login, req.url));
}
