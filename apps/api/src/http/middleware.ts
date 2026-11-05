import { randomUUID, timingSafeEqual } from "node:crypto";
import { ApiError } from "@edge/contracts";
import { env, findDeviceByToken, loadViewer, markDeviceSeen } from "@edge/services";
import { fromNodeHeaders } from "better-auth/node";
import type { Request, RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import type { Auth } from "../auth";

export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.header("x-request-id");
  req.requestId = incoming && /^[\w-]{6,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
};

function hasInternalToken(req: Request) {
  const given = Buffer.from(req.header("x-internal-token") ?? "");
  const expected = Buffer.from(env.INTERNAL_API_TOKEN);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Paths a device token can even knock on. Hand-written routes such as /files skip `register`, so this has to come first. */
const PHONE_PATHS = /^\/(crm|mobile|me|notifications)(\/|$)/;

/**
 * /api/v1 (except /v1/auth) is for the Next.js servers on the private network, plus the CRM phone app with its device
 * token. A phone's identity comes only from that token, never from a cookie, and `register` keeps it to `deviceRoutes`.
 */
export function internalOrDevice(auth: Auth): RequestHandler {
  const fromSession = loadViewerMiddleware(auth);
  return async (req, res, next) => {
    if (hasInternalToken(req)) return fromSession(req, res, next);
    const [scheme, token] = (req.header("authorization") ?? "").split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token || !PHONE_PATHS.test(req.path))
      return next(new ApiError(404, "NOT_FOUND", "Not found"));
    try {
      const device = await findDeviceByToken(token);
      const viewer = device ? await loadViewer(String(device.userId)) : null;
      // 401, not 404: this is how the phone learns it has to sign in again.
      if (!device || !viewer || viewer.user.disabledAt) return next(new ApiError(401, "UNAUTHENTICATED", "Please sign in."));
      req.device = device;
      req.viewer = viewer;
      await markDeviceSeen(device);
      next();
    } catch (e) {
      next(e);
    }
  };
}

/** Stops one lost or misbehaving phone from hammering the API. The Next.js servers aren't limited here. */
export function phoneRateLimit() {
  return rateLimit({
    windowMs: 60_000,
    limit: 240,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: (req) => !req.device,
    keyGenerator: (req) => String(req.device?._id),
    message: { error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a minute." } },
  });
}

/** Browser-facing POSTs must come from one of our app origins (CSRF guard). */
export const sameAppOrigin: RequestHandler = (req, _res, next) => {
  if (req.method === "GET" || req.method === "HEAD") return next();
  const origin = req.header("origin");
  if (!origin || ![env.STUDENT_APP_URL, env.CONSOLE_APP_URL, env.CRM_APP_URL].includes(origin))
    return next(new ApiError(403, "FORBIDDEN", "Invalid origin"));
  next();
};

/**
 * CORS for /api/public: the academy's own sites (allowlisted origins) call these straight from the browser.
 * `allowed` is read per request (PUBLIC_FORM_ORIGINS plus the websites CRM admins allow in Settings).
 * Any other browser origin is refused; requests without an Origin (servers, curl) pass, the rate limit still applies.
 */
export function publicCors(allowed: () => Promise<ReadonlySet<string>> | ReadonlySet<string>): RequestHandler {
  return async (req, res, next) => {
    try {
      const origin = req.header("origin");
      if (origin) {
        if (!(await allowed()).has(origin)) return next(new ApiError(403, "FORBIDDEN", "Origin not allowed"));
        res.vary("Origin");
        res.setHeader("Access-Control-Allow-Origin", origin);
      }
      if (req.method !== "OPTIONS") return next();
      res.setHeader("Access-Control-Allow-Methods", "POST");
      res.setHeader("Access-Control-Allow-Headers", "content-type");
      res.setHeader("Access-Control-Max-Age", "600");
      res.status(204).end();
    } catch (e) {
      next(e);
    }
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
