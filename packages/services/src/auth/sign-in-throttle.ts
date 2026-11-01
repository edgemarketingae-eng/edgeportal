import { createHash } from "node:crypto";
import { OtpThrottle } from "@edge/db";
import { now } from "@edge/domain/clock";
import { RateLimitedError } from "../errors";

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;

/** Hashed so the throttle table holds no email addresses. */
const keyFor = (email: string) => `sign-in:${createHash("sha256").update(email).digest("hex")}`;

/** Direct `auth.api` calls skip Better Auth's limiter, so password guessing against one account is limited here. */
export async function assertSignInAllowed(email: string) {
  const since = new Date(now().getTime() - WINDOW_MS);
  if ((await OtpThrottle.countDocuments({ key: keyFor(email), createdAt: { $gte: since } })) >= MAX_FAILURES)
    throw new RateLimitedError("Too many attempts. Wait 15 minutes and try again, or reset your password.");
}

export async function recordSignInFailure(email: string) {
  await OtpThrottle.create([{ key: keyFor(email) }]);
}

export async function clearSignInFailures(email: string) {
  await OtpThrottle.deleteMany({ key: keyFor(email) });
}
