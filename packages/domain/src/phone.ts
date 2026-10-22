import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export interface ParsedPhone {
  e164: string;
  country: string | undefined;
}

/** Normalises user input to E.164. Defaults to UAE for local numbers like 050 123 4567. */
export function parsePhone(input: string, defaultCountry: CountryCode = "AE"): ParsedPhone | null {
  const p = parsePhoneNumberFromString(input.trim(), defaultCountry);
  if (!p || !p.isValid()) return null;
  return { e164: p.number, country: p.country };
}

export function isValidE164(phone: string) {
  const p = parsePhoneNumberFromString(phone);
  return !!p && p.isValid() && p.number === phone;
}

export function maskPhone(phone: string) {
  return phone.length > 6 ? `${phone.slice(0, 4)}•••${phone.slice(-3)}` : phone;
}
