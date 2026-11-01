import "server-only";
import { ApiError, createClient, meRoutes, type ViewerDto } from "@edge/contracts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

/** Read at request time (not build time) so one image works in every environment. */
function apiConfig() {
  const token = process.env.INTERNAL_API_TOKEN ?? (process.env.NODE_ENV === "production" ? "" : "dev-internal-token-change-me-0123456789");
  if (!token) throw new Error("INTERNAL_API_TOKEN is not set");
  return { url: process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000", token };
}

/** Raw fetch to the internal API with the browser's session forwarded (for non-JSON responses such as CSV). */
export async function apiFetch(
  path: string,
  init: { method?: string; body?: string | Uint8Array<ArrayBuffer>; headers?: Record<string, string> } = {},
) {
  const h = await headers(); // request data first: marks the caller dynamic before any work happens
  const { url, token } = apiConfig();
  const forward: Record<string, string> = { "x-internal-token": token };
  const pass = (from: string, to = from) => {
    const v = h.get(from);
    if (v) forward[to] = v;
  };
  pass("cookie");
  pass("host", "x-forwarded-host");
  pass("x-forwarded-proto");
  pass("x-forwarded-for");
  pass("x-request-id");
  pass("user-agent", "x-forwarded-user-agent");
  return fetch(`${url}${path}`, { ...init, headers: { ...init.headers, ...forward }, cache: "no-store" });
}

/**
 * Server-side API client for Server Components and Server Actions. Calls the internal API
 * with the shared token, forwarding the browser's cookie, host and client details so the API
 * resolves the same session and logs the real client.
 */
export const api = createClient((path, init) => apiFetch(path, init));

/** Sends a file from a Server Action to the API's storage route. Returns the stored file's id, for the feature route to claim. */
export async function apiUpload(file: File, target: { module: string; area: string; ownerId?: string }) {
  const qs = new URLSearchParams({
    module: target.module,
    area: target.area,
    name: file.name,
    ...(target.ownerId ? { ownerId: target.ownerId } : {}),
  });
  const res = await apiFetch(`/api/v1/files?${qs}`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream" },
    body: new Uint8Array(await file.arrayBuffer()),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw ApiError.fromBody(res.status, json);
  return json as { id: string; name: string };
}

/** The signed-in viewer (or null), fetched once per request. */
export const getViewer = cache(async (): Promise<ViewerDto | null> => {
  try {
    return await api(meRoutes.me);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
});

/** Turn auth-related API errors into redirects; anything else propagates to error.tsx. */
export function redirectOnAuthError(
  e: unknown,
  routes: { login: string; verifyPhone?: string; changePassword?: string; security?: string },
): never {
  if (e instanceof ApiError) {
    if (e.status === 401) redirect(routes.login);
    if (e.code === "PHONE_NOT_VERIFIED" && routes.verifyPhone) redirect(routes.verifyPhone);
    if (e.code === "MUST_CHANGE_PASSWORD" && routes.changePassword) redirect(routes.changePassword);
    if (e.code === "TWO_FACTOR_REQUIRED" && routes.security) redirect(`${routes.security}?required=1`);
  }
  throw e;
}

/** Use in pages: call the API and redirect on auth errors (404s become notFound()). */
export function loader(routes: Parameters<typeof redirectOnAuthError>[1]) {
  return async function load<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound();
      return redirectOnAuthError(e, routes);
    }
  };
}
