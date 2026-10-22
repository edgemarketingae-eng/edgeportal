import { ApiError, authRoutes } from "@edge/contracts";
import { AuthSession, AuthUser, StudentProfile, Types } from "@edge/db";
import { parsePhone } from "@edge/domain/phone";
import { assertOtpAllowed, ensureCurrentEnrollment, env, homesFor, loadViewer } from "@edge/services";
import { fromNodeHeaders } from "better-auth/node";
import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { OTP_CHANNEL_HEADER, POLICY_HEADER, type Auth } from "../auth";
import { clientIp } from "../http/context";
import { fromAuthError } from "../http/errors";
import { requireViewer } from "../http/guards";
import { loadViewerMiddleware, sameAppOrigin } from "../http/middleware";
import { register } from "../http/route";

/** Headers for internal Better Auth calls: the browser's cookies/origin plus our policy marker. */
function policyHeaders(req: Request, channel?: string) {
  const h = fromNodeHeaders(req.headers);
  h.set(POLICY_HEADER, env.INTERNAL_API_TOKEN);
  if (channel) h.set(OTP_CHANNEL_HEADER, channel);
  return h;
}

/** Copy Better Auth's Set-Cookie headers onto our response (they flow through the app rewrite). */
function forwardCookies(res: Response, headers: Headers | undefined) {
  for (const c of headers?.getSetCookie() ?? []) res.append("Set-Cookie", c);
}

const wrongApp = (app: "student" | "console") =>
  new ApiError(
    403,
    "FORBIDDEN",
    app === "console" ? "This is the staff console. Students sign in at the student portal." : `Staff accounts sign in at the staff console (${env.CONSOLE_APP_URL}).`,
  );

export function authRouter(auth: Auth) {
  const router = Router();
  // Mounted at the root with full contract paths; middleware is scoped to the prefix.
  router.use("/api/v1/auth", loadViewerMiddleware(auth), sameAppOrigin);
  router.use("/api/v1/auth", rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a minute." } } }));

  register(router, authRoutes.studentSignup, async (req, res) => {
    const d = req.valid.body;
    const phone = parsePhone(d.phone);
    if (!phone) throw new ApiError(400, "VALIDATION", "Please fix the highlighted fields.", { phone: "Enter a valid mobile number, e.g. +971 50 123 4567" });
    if (await AuthUser.exists({ phoneNumber: phone.e164 })) {
      throw new ApiError(409, "CONFLICT", "This mobile number is already registered.", { phone: "This mobile number is already registered. Sign in instead." });
    }
    let result;
    try {
      result = await auth.api.signUpEmail({ body: { name: d.name, email: d.email, password: d.password }, headers: policyHeaders(req), returnHeaders: true });
    } catch (e) {
      throw fromAuthError(e);
    }
    const userId = result.response.user.id;
    try {
      await StudentProfile.create({
        _id: new Types.ObjectId(userId),
        country: phone.country ?? "AE",
        pendingPhone: phone.e164,
        jetaFxClientId: d.jetaFxClientId || null,
        marketingConsent: d.marketingConsent,
        marketingConsentAt: d.marketingConsent ? new Date() : null,
      });
    } catch (e) {
      await AuthUser.deleteOne({ _id: userId }); // keep sign-up atomic from the user's point of view
      throw e;
    }
    forwardCookies(res, result.headers);
    try {
      await assertOtpAllowed(phone.e164, clientIp(req));
      await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: phone.e164 }, headers: policyHeaders(req, d.channel) });
    } catch (e) {
      req.log?.warn({ err: e }, "signup OTP send failed");
    }
    return { ok: true as const };
  });

  register(router, authRoutes.verifyPhone, async (req, res) => {
    const viewer = requireViewer(req, { allowMustChangePassword: true });
    const pending = viewer.student?.pendingPhone;
    if (!pending) return { ok: true as const, home: homesFor(viewer).student ?? "/" };
    try {
      const out = await auth.api.verifyPhoneNumber({ body: { phoneNumber: pending, code: req.valid.body.code, updatePhoneNumber: true }, headers: policyHeaders(req), returnHeaders: true });
      forwardCookies(res, out.headers);
    } catch (e) {
      throw fromAuthError(e);
    }
    await StudentProfile.updateOne({ _id: new Types.ObjectId(viewer.userId) }, { $set: { pendingPhone: null } });
    await ensureCurrentEnrollment(viewer.userId, { type: "USER", id: viewer.userId });
    return { ok: true as const, home: "/dashboard" };
  });

  register(router, authRoutes.resendPhoneOtp, async (req) => {
    const viewer = requireViewer(req, { allowMustChangePassword: true });
    if (!viewer.student?.pendingPhone) throw new ApiError(409, "BUSINESS_RULE", "Your mobile number is already verified.");
    let phone = viewer.student.pendingPhone;
    const { newPhone, channel } = req.valid.body;
    if (newPhone) {
      const parsed = parsePhone(newPhone);
      if (!parsed) throw new ApiError(400, "VALIDATION", "Please fix the highlighted fields.", { newPhone: "Enter a valid mobile number" });
      if (await AuthUser.exists({ phoneNumber: parsed.e164 })) throw new ApiError(409, "CONFLICT", "This number is already registered.", { newPhone: "This number is already registered" });
      phone = parsed.e164;
      await StudentProfile.updateOne({ _id: new Types.ObjectId(viewer.userId) }, { $set: { pendingPhone: phone, country: parsed.country ?? viewer.student.country } });
    }
    await assertOtpAllowed(phone, clientIp(req));
    try {
      await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: phone }, headers: policyHeaders(req, channel) });
    } catch (e) {
      throw fromAuthError(e);
    }
    return { ok: true as const, phone, message: `We sent a new code to ${phone}.` };
  });

  register(router, authRoutes.sendLoginOtp, async (req) => {
    const phone = parsePhone(req.valid.body.phone);
    if (!phone) throw new ApiError(400, "VALIDATION", "Please fix the highlighted fields.", { phone: "Enter a valid mobile number" });
    const user = await AuthUser.findOne({ phoneNumber: phone.e164 }, { phoneNumberVerified: 1, disabledAt: 1, twoFactorEnabled: 1 }).lean();
    const student = user ? await StudentProfile.exists({ _id: user._id }) : null;
    // Same answer whether or not the number exists; no OTP login for 2FA, disabled or staff accounts.
    if (user?.phoneNumberVerified && !user.disabledAt && !user.twoFactorEnabled && student) {
      await assertOtpAllowed(phone.e164, clientIp(req));
      try {
        await auth.api.sendPhoneNumberOTP({ body: { phoneNumber: phone.e164 }, headers: policyHeaders(req, req.valid.body.channel) });
      } catch (e) {
        throw fromAuthError(e);
      }
    }
    return { ok: true as const, phone: phone.e164, message: `If ${phone.e164} is registered, a 6-digit code is on its way.` };
  });

  register(router, authRoutes.verifyLoginOtp, async (req, res) => {
    const { phone, code } = req.valid.body;
    const user = await AuthUser.findOne({ phoneNumber: phone }, { phoneNumberVerified: 1, twoFactorEnabled: 1, disabledAt: 1 }).lean();
    if (!user?.phoneNumberVerified || user.twoFactorEnabled || user.disabledAt) throw new ApiError(400, "VALIDATION", "That code is not correct or has expired.");
    try {
      const out = await auth.api.verifyPhoneNumber({ body: { phoneNumber: phone, code }, headers: policyHeaders(req), returnHeaders: true });
      forwardCookies(res, out.headers);
    } catch (e) {
      throw fromAuthError(e);
    }
    return { ok: true as const, home: "/" };
  });

  register(router, authRoutes.signInPassword, async (req, res) => {
    const { identifier, password, app } = req.valid.body;
    let out;
    try {
      if (identifier.includes("@")) {
        out = await auth.api.signInEmail({ body: { email: identifier.toLowerCase(), password }, headers: policyHeaders(req), returnHeaders: true });
      } else {
        const phone = parsePhone(identifier);
        if (!phone) throw new ApiError(400, "VALIDATION", "Enter a valid email or mobile number.");
        out = await auth.api.signInPhoneNumber({ body: { phoneNumber: phone.e164, password }, headers: policyHeaders(req), returnHeaders: true });
      }
    } catch (e) {
      throw fromAuthError(e);
    }
    const body = out.response as { twoFactorRedirect?: boolean; token?: string; user?: { id: string } };
    if (body.twoFactorRedirect) {
      forwardCookies(res, out.headers);
      return { ok: true as const, twoFactorRedirect: true };
    }
    const viewer = body.user ? await loadViewer(body.user.id) : null;
    const home = viewer ? homesFor(viewer)[app] : null;
    if (!home) {
      if (body.token) await AuthSession.deleteOne({ token: body.token }); // do not leave a session for the wrong app
      throw wrongApp(app);
    }
    forwardCookies(res, out.headers);
    return { ok: true as const, home };
  });

  return router;
}
