import { AuthUser, StaffProfile, nativeDb } from "@edge/db";
import { isValidE164 } from "@edge/domain/phone";
import { env, flushOutbox, queueEmail, runtime } from "@edge/services";
import type { OtpChannel } from "@edge/integrations/twilio/verify";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { twoFactor } from "better-auth/plugins/two-factor";

/** Header our own /api/v1/auth/* policy endpoints add when calling Better Auth internally. */
export const POLICY_HEADER = "x-edge-auth-policy";
export const OTP_CHANNEL_HEADER = "x-otp-channel";

/** Endpoints browsers may not call directly: they must go through our policy endpoints. */
const POLICY_ONLY = new Set([
  "/sign-up/email",
  "/sign-in/email",
  "/sign-in/phone-number",
  "/phone-number/send-otp",
  "/phone-number/verify",
]);
/** Phone-based password reset bypasses Twilio Verify; email reset is used instead. */
const BLOCKED = new Set(["/phone-number/request-password-reset", "/phone-number/reset-password"]);

export function createAuth() {
  const { db, client } = nativeDb();
  const prod = env.NODE_ENV === "production";
  const appHosts = [new URL(env.STUDENT_APP_URL).host, new URL(env.CONSOLE_APP_URL).host, new URL(env.CRM_APP_URL).host];

  return betterAuth({
    appName: "Edge Trading Academy",
    secret: env.BETTER_AUTH_SECRET,
    // Requests arrive through each app's rewrite; links (e.g. password reset) point back at that app.
    baseURL: { allowedHosts: appHosts, fallback: env.STUDENT_APP_URL, protocol: prod ? "https" : "http" },
    trustedOrigins: [env.STUDENT_APP_URL, env.CONSOLE_APP_URL, env.CRM_APP_URL],
    database: mongodbAdapter(db, { client }),
    advanced: { trustedProxyHeaders: true, useSecureCookies: prod },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/two-factor/verify-totp": { window: 60, max: 10 },
        "/two-factor/verify-backup-code": { window: 60, max: 10 },
        "/request-password-reset": { window: 300, max: 5 },
      },
    },
    user: {
      additionalFields: {
        mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
        disabledAt: { type: "date", required: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await queueEmail({ to: user.email, userId: user.id, template: "auth.resetPassword", data: { name: user.name, url } });
        await flushOutbox();
      },
      // A self-service reset replaces the temporary password, so it must stop being shown.
      onPasswordReset: async ({ user }) => {
        await StaffProfile.updateOne({ _id: user.id }, { $set: { tempPasswordEnc: null } });
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const u = await AuthUser.findById(session.userId, { disabledAt: 1 }).lean();
            if (u?.disabledAt) return false;
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (BLOCKED.has(ctx.path)) throw new APIError("FORBIDDEN", { message: "Use email to reset your password." });
        if (POLICY_ONLY.has(ctx.path) && ctx.headers?.get(POLICY_HEADER) !== env.INTERNAL_API_TOKEN) {
          throw new APIError("FORBIDDEN", { message: "Not allowed." });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/change-password" && !(ctx.context.returned instanceof Error)) {
          const userId = ctx.context.session?.user.id;
          if (userId) {
            await AuthUser.updateOne({ _id: userId }, { $set: { mustChangePassword: false } });
            await StaffProfile.updateOne({ _id: userId }, { $set: { tempPasswordEnc: null } });
          }
        }
      }),
    },
    plugins: [
      phoneNumber({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        requireVerification: true,
        phoneNumberValidator: (p) => isValidE164(p),
        // Better Auth generates its own code; Twilio Verify sends and checks the real one.
        sendOTP: async ({ phoneNumber: phone }, ctx) => {
          const channel = (ctx?.headers?.get(OTP_CHANNEL_HEADER) === "whatsapp" ? "whatsapp" : "sms") as OtpChannel;
          await runtime().otp.start(phone, channel);
        },
        verifyOTP: async ({ phoneNumber: phone, code }) => runtime().otp.check(phone, code),
      }),
      twoFactor({ issuer: "Edge Trading Academy" }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
