import { createHash, randomBytes } from "node:crypto";

/** sha256 hex of a bearer token or code: only this is stored, so a database leak hands out nothing usable. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** 32 random bytes, base64url, optionally prefixed so the token's kind shows at a glance. */
export const newToken = (prefix = "") => `${prefix}${randomBytes(32).toString("base64url")}`;
