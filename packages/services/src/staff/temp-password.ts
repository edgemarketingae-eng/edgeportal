import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { env } from "../env";

/**
 * Temporary passwords stay readable to staff managers until the person sets their own password,
 * so they can be handed over in person. Encrypted at rest with a key derived from the auth secret.
 */
const key = () => `${env.BETTER_AUTH_SECRET}:staff-temp-password`;

export function encryptTempPassword(password: string) {
  return symmetricEncrypt({ key: key(), data: password });
}

/** Null when the value cannot be read (e.g. the auth secret was rotated). */
export async function decryptTempPassword(value: string | null | undefined) {
  if (!value) return null;
  try {
    return await symmetricDecrypt({ key: key(), data: value });
  } catch {
    return null;
  }
}
