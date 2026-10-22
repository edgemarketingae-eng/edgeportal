import { createHmac } from "node:crypto";
import type { Page } from "@playwright/test";
import { E2E } from "../config";

export async function studentSignIn(page: Page, identifier: string, password: string) {
  await page.goto(`${E2E.student}/login`);
  await page.getByLabel("Email or mobile number").fill(identifier);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function staffSignIn(page: Page, email: string, password = E2E.staffPassword) {
  await page.goto(`${E2E.console}/login`);
  await page.getByLabel("Work email").fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Date and time fields for "now + minutes" in Dubai (UTC+4, no DST). */
export function dubaiNowPlus(minutes: number) {
  const d = new Date(Date.now() + minutes * 60_000 + 4 * 3600_000).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}

function base32Decode(s: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits), as authenticator apps compute it. */
export function totp(secret: string, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, "0");
}
