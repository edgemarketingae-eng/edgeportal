import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { isCountryCode } from "./countries";

export interface ParsedPhone {
  e164: string;
  country: string | undefined;
}

/**
 * Normalises user input to E.164. International input (+44…, 0044…) always works; a local number such as
 * 050 123 4567 only parses when `defaultCountry` says which country it belongs to. There is no implicit country.
 */
export function parsePhone(input: string, defaultCountry?: string | null): ParsedPhone | null {
  const raw = input.trim().replace(/^00(?=[1-9])/, "+");
  if (!raw) return null;
  const dc = isCountryCode(defaultCountry) ? (defaultCountry.toUpperCase() as CountryCode) : undefined;
  const p = dc ? parsePhoneNumberFromString(raw, dc) : raw.startsWith("+") ? parsePhoneNumberFromString(raw) : undefined;
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
