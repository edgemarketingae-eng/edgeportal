import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/** Short-lived, user-bound media URL token so range requests skip session lookups. */
const TTL_SECONDS = 2 * 60 * 60;

function sig(recordingId: string, userId: string, exp: number) {
  return createHmac("sha256", env.MEDIA_SIGNING_SECRET).update(`${recordingId}.${userId}.${exp}`).digest("base64url");
}

export function signMediaToken(recordingId: string, userId: string, nowMs = Date.now()) {
  const exp = Math.floor(nowMs / 1000) + TTL_SECONDS;
  return Buffer.from(`${userId}.${exp}.${sig(recordingId, userId, exp)}`).toString("base64url");
}

export function verifyMediaToken(recordingId: string, token: string, nowMs = Date.now()): { userId: string } | null {
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const [userId, expStr, given] = decoded.split(".");
  const exp = Number(expStr);
  if (!userId || !given || !Number.isFinite(exp) || exp * 1000 < nowMs) return null;
  const expected = sig(recordingId, userId, exp);
  if (expected.length !== given.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return null;
  return { userId };
}

export function parseRange(header: string | null, size: number): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const m = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === "" && m[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}
