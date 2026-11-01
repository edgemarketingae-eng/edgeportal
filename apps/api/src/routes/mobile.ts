import { ApiError, mobileRoutes, type MobileAuthResult, type MobileSignInInput } from "@edge/contracts";
import { AuthSession, AuthUser } from "@edge/db";
import {
  assertSignInAllowed,
  clearSignInFailures,
  getMobileToday,
  homesFor,
  loadViewer,
  recordDeviceSync,
  recordSignInFailure,
  registerDevice,
  saveCallSheet,
  saveDeviceFcmToken,
  signOutDevice,
  syncCalls,
} from "@edge/services";
import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import type { Auth } from "../auth";
import { fromAuthError } from "../http/errors";
import { actorOf, requirePermission } from "../http/guards";
import { register } from "../http/route";
import { policyHeaders, wrongApp } from "./auth";
import { crm } from "./crm";

type Verified = { status: "verified"; userId: string; sessionToken: string | null; cookie: string } | { status: "totp_required" };

/** Better Auth's response cookies, as a request Cookie header for the next call in the same sign-in. */
function cookieHeader(headers: Headers | undefined) {
  return (headers?.getSetCookie() ?? [])
    .filter((c) => !/max-age=0/i.test(c))
    .map((c) => c.split(";")[0])
    .join("; ");
}

/**
 * Password plus, when the account has one, its authenticator code. A phone has no cookie jar, so both steps of Better
 * Auth's two-step sign-in run inside this one request and the app just sends the password again with the code.
 */
async function verifyPassword(auth: Auth, req: Request, { email, password, totp }: MobileSignInInput): Promise<Verified> {
  await assertSignInAllowed(email);
  try {
    const out = await auth.api.signInEmail({ body: { email, password }, headers: policyHeaders(req), returnHeaders: true });
    const body = out.response as { twoFactorRedirect?: boolean; token?: string; user?: { id: string } };
    if (!body.twoFactorRedirect)
      return { status: "verified", userId: body.user!.id, sessionToken: body.token ?? null, cookie: cookieHeader(out.headers) };
    if (!totp) return { status: "totp_required" };
    const headers = policyHeaders(req);
    headers.set("cookie", cookieHeader(out.headers));
    const verified = await auth.api.verifyTOTP({ body: { code: totp }, headers, returnHeaders: true });
    const session = verified.response as { token?: string; user?: { id: string } };
    return { status: "verified", userId: session.user!.id, sessionToken: session.token ?? null, cookie: cookieHeader(verified.headers) };
  } catch (e) {
    const err = fromAuthError(e);
    if (err.status === 401) await recordSignInFailure(email);
    throw err;
  }
}

/** The Better Auth session was only a way to check the password: a phone keeps its device token, never a session. */
async function issueToken(v: Extract<Verified, { status: "verified" }>, input: MobileSignInInput): Promise<MobileAuthResult> {
  if (v.sessionToken) await AuthSession.deleteOne({ token: v.sessionToken });
  await clearSignInFailures(input.email);
  const viewer = await loadViewer(v.userId);
  const homes = viewer ? homesFor(viewer) : null;
  if (!viewer || !homes?.crm) throw wrongApp("crm", homes);
  if (viewer.user.mustChangePassword) return { status: "must_change_password" };
  if (viewer.twoFactorRequired && !viewer.user.twoFactorEnabled)
    throw new ApiError(403, "TWO_FACTOR_REQUIRED", "Turn on two-factor authentication in the CRM on a computer first.");
  const user = await AuthUser.findById(v.userId, { name: 1, email: 1 }).lean();
  const token = await registerDevice(v.userId, input.device);
  return { status: "ok", token, user: { id: v.userId, name: user?.name ?? "", email: user?.email ?? input.email } };
}

/** Sign-in for the CRM phone app. Mounted before the /api/v1 gate because it's how a phone gets its token. */
export function mobileAuthRouter(auth: Auth) {
  const r = Router();
  r.use(
    "/api/v1/mobile/auth",
    rateLimit({
      windowMs: 60_000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a minute." } },
    }),
  );

  register(r, mobileRoutes.signIn, async (req) => {
    const v = await verifyPassword(auth, req, req.valid.body);
    return v.status === "verified" ? issueToken(v, req.valid.body) : v;
  });

  register(r, mobileRoutes.changePassword, async (req) => {
    const v = await verifyPassword(auth, req, req.valid.body);
    if (v.status !== "verified") return v;
    const headers = policyHeaders(req);
    headers.set("cookie", v.cookie);
    try {
      await auth.api.changePassword({
        body: { currentPassword: req.valid.body.password, newPassword: req.valid.body.newPassword },
        headers,
      });
    } catch (e) {
      throw fromAuthError(e);
    }
    return issueToken(v, req.valid.body);
  });

  return r;
}

function requireDevice(req: { device?: Request["device"] }) {
  if (!req.device) throw new ApiError(404, "NOT_FOUND", "Not found");
  return req.device;
}

/** Everything a signed-in phone does beyond the shared CRM routes. */
export function mobileRouter() {
  const r = Router();

  register(r, mobileRoutes.signOut, async (req) => {
    const v = requirePermission(req, "crm.access");
    await signOutDevice(requireDevice(req)._id, actorOf(v));
    return { ok: true as const };
  });

  register(r, mobileRoutes.device, async (req) => {
    requirePermission(req, "crm.access");
    await saveDeviceFcmToken(requireDevice(req)._id, req.valid.body.fcmToken);
    return { ok: true as const };
  });

  register(r, mobileRoutes.syncCalls, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    const device = requireDevice(req);
    const { calls, trackingOn, appVersion } = req.valid.body;
    const result = await syncCalls(calls, actor, scope);
    await recordDeviceSync(device._id, { trackingOn, appVersion });
    return result;
  });

  register(r, mobileRoutes.saveCallSheet, async (req) => {
    const { actor, scope } = await crm(req, "crm.write");
    requireDevice(req);
    await saveCallSheet(req.valid.body, actor, scope);
    return { ok: true as const };
  });

  register(r, mobileRoutes.today, async (req) => {
    const { scope } = await crm(req, "crm.read");
    requireDevice(req);
    return getMobileToday(scope);
  });

  return r;
}
