import { COUNTRY_ROWS } from "./countries-data";

export interface Country {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
}

const flag = (code: string) => String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

/** Every country with a phone numbering plan, sorted by English name. */
export const COUNTRIES: readonly Country[] = COUNTRY_ROWS.map(([code, name, dialCode]) => ({ code, name, dialCode, flag: flag(code) }));

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

/** The academy's home country: the default for pickers, never an assumption about a person. */
export const HOME_COUNTRY = "AE";

export function isCountryCode(code: string | null | undefined): code is string {
  return !!code && BY_CODE.has(code.toUpperCase());
}

export function countryByCode(code: string | null | undefined) {
  return code ? BY_CODE.get(code.toUpperCase()) : undefined;
}

export function countryName(code: string | null | undefined) {
  return countryByCode(code)?.name ?? code ?? "";
}
