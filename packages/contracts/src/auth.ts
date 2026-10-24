import { z } from "zod";
import { route } from "./route";
import { zCountry, zEmail, zOk } from "./common";

/** Composite auth endpoints (policy lives in the API, cookies flow through the app rewrite). */
export const StudentSignupInput = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80),
  email: zEmail(),
  phone: z.string().trim().min(6, "Enter your mobile number"),
  /** Country of residence: decides VAT and which payment methods are offered. */
  country: zCountry.optional(),
  password: z.string().min(8, "At least 8 characters").max(128),
  jetaFxClientId: z.string().trim().max(50).optional(),
  marketingConsent: z.boolean(),
  terms: z.literal(true, { error: "Please accept the terms to continue" }),
  channel: z.enum(["sms", "whatsapp"]).default("sms"),
});

export const OtpChannel = z.enum(["sms", "whatsapp"]);

export const authRoutes = {
  studentSignup: route({ method: "POST", path: "/api/v1/auth/student-signup", body: StudentSignupInput, response: zOk }),
  sendLoginOtp: route({
    method: "POST",
    path: "/api/v1/auth/otp/send",
    body: z.object({ phone: z.string().trim().min(6, "Enter a valid mobile number"), channel: OtpChannel.default("sms") }),
    response: z.object({ ok: z.literal(true), phone: z.string(), message: z.string() }),
  }),
  verifyLoginOtp: route({
    method: "POST",
    path: "/api/v1/auth/otp/verify",
    body: z.object({ phone: z.string(), code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") }),
    response: z.object({ ok: z.literal(true), home: z.string() }),
  }),
  verifyPhone: route({
    method: "POST",
    path: "/api/v1/auth/phone/verify",
    body: z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") }),
    response: z.object({ ok: z.literal(true), home: z.string() }),
  }),
  resendPhoneOtp: route({
    method: "POST",
    path: "/api/v1/auth/phone/resend",
    body: z.object({ newPhone: z.string().trim().optional(), channel: OtpChannel.default("sms") }),
    response: z.object({ ok: z.literal(true), phone: z.string(), message: z.string() }),
  }),
  signInPassword: route({
    method: "POST",
    path: "/api/v1/auth/sign-in",
    body: z.object({
      identifier: z.string().trim().min(3, "Enter your email or mobile number"),
      password: z.string().min(1, "Enter your password"),
      app: z.enum(["student", "console", "crm"]),
    }),
    response: z.object({ ok: z.literal(true), home: z.string().optional(), twoFactorRedirect: z.boolean().optional() }),
  }),
};
