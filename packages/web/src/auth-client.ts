import { ApiError, buildPath, type RouteDef } from "@edge/contracts";
import { phoneNumberClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { z } from "zod";

/**
 * Browser-side auth. Everything that sets or clears the session cookie runs here, same-origin
 * through the app's /api/auth and /api/v1/auth rewrites, so cookies land on the app's own host.
 */
export const authClient = createAuthClient({ plugins: [twoFactorClient(), phoneNumberClient()] });

/** POST to a composite /api/v1/auth/* policy endpoint from the browser. */
export async function postAuth<R extends z.ZodType>(def: RouteDef<z.ZodType, z.ZodType, z.ZodType, R>, body: unknown, params?: Record<string, string>): Promise<z.output<R>> {
  const res = await fetch(buildPath(def.path, params), { method: def.method, headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw ApiError.fromBody(res.status, json);
  return json as z.output<R>;
}

/** A readable message from a Better Auth client error result. */
export function authErrorMessage(error: { message?: string; code?: string } | null | undefined, fallback = "Something went wrong. Please try again.") {
  return error?.message || fallback;
}

/**
 * Full page load after the session cookie changes (sign-in, sign-up, password reset). A client
 * navigation could reuse router-cache entries rendered for the previous session. The returned
 * promise never settles, so pending buttons stay disabled until the page unloads.
 */
export function hardNavigate(path: string): Promise<never> {
  window.location.assign(path);
  return new Promise<never>(() => undefined);
}
