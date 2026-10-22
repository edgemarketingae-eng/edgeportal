import { ApiError, fieldErrorsFromIssues } from "@edge/contracts";
import { APIError as BetterAuthError } from "better-auth/api";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

const FRIENDLY: Record<string, string> = {
  USER_ALREADY_EXISTS: "An account with this email already exists. Sign in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with this email already exists. Sign in instead.",
  INVALID_EMAIL_OR_PASSWORD: "Incorrect email or password.",
  INVALID_PHONE_NUMBER_OR_PASSWORD: "Incorrect mobile number or password.",
  INVALID_PHONE_NUMBER: "Enter a valid mobile number with country code.",
  INVALID_OTP: "That code is not correct or has expired.",
  OTP_EXPIRED: "That code has expired. Request a new one.",
  TOO_MANY_ATTEMPTS: "Too many attempts. Request a new code.",
  PHONE_NUMBER_EXIST: "This mobile number is already registered to another account.",
  PHONE_NUMBER_NOT_VERIFIED: "Verify your mobile number first, or sign in with your email.",
  INVALID_TOKEN: "This link is invalid or has expired.",
  INVALID_PASSWORD: "Current password is incorrect.",
  PASSWORD_TOO_SHORT: "Password must be at least 8 characters.",
  FAILED_TO_CREATE_SESSION: "This account is disabled. Contact the academy.",
};

/** Better Auth errors -> our ApiError with a user-safe message. */
export function fromAuthError(e: unknown, fallback = "Something went wrong. Please try again."): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof BetterAuthError) {
    const body = e.body as { code?: string; message?: string } | undefined;
    const status = e.statusCode ?? 400;
    if (status === 429) return new ApiError(429, "RATE_LIMITED", body?.message ?? "Too many attempts. Please wait a minute and try again.");
    const message = (body?.code && FRIENDLY[body.code]) || body?.message || fallback;
    if (status === 401) return new ApiError(401, "UNAUTHENTICATED", message);
    if (status === 403) return new ApiError(403, "FORBIDDEN", message);
    return new ApiError(status >= 400 && status < 500 ? status : 400, "VALIDATION", message);
  }
  return new ApiError(500, "INTERNAL", fallback);
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let e: ApiError;
  if (err instanceof ApiError) e = err;
  else if (err instanceof ZodError) e = new ApiError(400, "VALIDATION", "Please fix the highlighted fields.", fieldErrorsFromIssues(err.issues));
  else if (err?.name === "CastError") e = new ApiError(404, "NOT_FOUND", "Not found");
  else if (err?.code === 11000) e = new ApiError(409, "CONFLICT", "That conflicts with an existing record.");
  else if (err instanceof BetterAuthError) e = fromAuthError(err);
  else if (err?.type === "entity.parse.failed") e = new ApiError(400, "VALIDATION", "Malformed JSON body");
  else {
    req.log?.error({ err }, "unhandled error");
    e = new ApiError(500, "INTERNAL", "Something went wrong. Please try again.");
  }
  e.requestId = req.requestId;
  if (e.status >= 500) req.log?.error({ code: e.code, message: e.message }, "request failed");
  res.status(e.status).json(e.toBody());
};
