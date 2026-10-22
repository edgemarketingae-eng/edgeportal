import { OtpThrottle } from "@edge/db";
import { now } from "@edge/domain/clock";
import { RateLimitedError } from "../errors";

/** Limits OTP sends to protect against SMS pumping and cost abuse. Old rows expire via a TTL index. */
const LIMITS = [
  { scope: "phone", windowMin: 10, max: 3 },
  { scope: "phone", windowMin: 24 * 60, max: 10 },
  { scope: "ip", windowMin: 10, max: 10 },
  { scope: "ip", windowMin: 24 * 60, max: 40 },
] as const;

export async function assertOtpAllowed(phone: string, ip: string | null) {
  const t = now();
  for (const l of LIMITS) {
    const key = l.scope === "phone" ? `phone:${phone}` : `ip:${ip ?? "unknown"}`;
    const count = await OtpThrottle.countDocuments({ key, createdAt: { $gte: new Date(t.getTime() - l.windowMin * 60_000) } });
    if (count >= l.max) throw new RateLimitedError("Too many verification codes requested. Please wait and try again.");
  }
  await OtpThrottle.create([{ key: `phone:${phone}` }, { key: `ip:${ip ?? "unknown"}` }]);
}
