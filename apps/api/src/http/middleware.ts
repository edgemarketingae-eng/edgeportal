import { randomUUID, timingSafeEqual } from "node:crypto";
import { ApiError } from "@edge/contracts";
import { env, loadViewer } from "@edge/services";
import { fromNodeHeaders } from "better-auth/node";
import type { RequestHandler } from "express";
import type { Auth } from "../auth";

export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.header("x-request-id");
  req.requestId = incoming && /^[\w-]{6,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
};

/** /api/v1 (except /v1/auth) is only for the Next.js servers on the private network. */
export const internalOnly: RequestHandler = (req, _res, next) => {
  const given = Buffer.from(req.header("x-internal-token") ?? "");
  const expected = Buffer.from(env.INTERNAL_API_TOKEN);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return next(new ApiError(404, "NOT_FOUND", "Not found"));
  next();
};

/** Browser-facing POSTs must come from one of our app origins (CSRF guard). */
export const sameAppOrigin: RequestHandler = (req, _res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  const origin = req.header("origin");
  if (!origin || ![env.STUDENT_APP_URL, env.CONSOLE_APP_URL, env.CRM_APP_URL].includes(origin)) return next(new ApiError(403, "FORBIDDEN", "Invalid origin"));
  next();
};

/**
 * CORS for /api/public: the academy's own static sites (allowlisted origins) call these straight from the browser.
 * Any other browser origin is refused; requests without an Origin (servers, curl) pass, the rate limit still applies.
 */
export function publicCors(origins: readonly string[]): RequestHandler {
  return (req, res, next) => {
    const origin = req.header("origin");
    if (origin) {
      if (!origins.includes(origin)) return next(new ApiError(403, "FORBIDDEN", "Origin not allowed"));
      res.vary("Origin");
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    if (req.method !== "OPTIONS") return next();
    res.setHeader("Access-Control-Allow-Methods", "POST");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Access-Control-Max-Age", "600");
    res.status(204).end();
  };
}

/** Resolve the Better Auth session (without refreshing it) and the viewer. */
export function loadViewerMiddleware(auth: Auth): RequestHandler {
  return async (req, _res, next) => {
    try {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers), query: { disableRefresh: true } });
      if (!session) {
        req.viewer = null;
        return next();
      }
      const viewer = await loadViewer(session.user.id);
      req.viewer = viewer && !viewer.user.disabledAt ? viewer : null;
      req.sessionToken = session.session.token;
      next();
    } catch (e) {
      next(e);
    }
  };
}
