import { describe, expect, it } from "vitest";
import { COUNTRIES, countryByCode, isCountryCode } from "../src/countries";
import { parsePhone } from "../src/phone";

describe("phone numbers from any country", () => {
  it("parses international input without a default country", () => {
    expect(parsePhone("+971 50 123 4567")).toEqual({ e164: "+971501234567", country: "AE" });
    expect(parsePhone("+91 98765 43210")).toEqual({ e164: "+919876543210", country: "IN" });
    expect(parsePhone("+966 50 123 4567")).toEqual({ e164: "+966501234567", country: "SA" });
    expect(parsePhone("0044 7400 123456")?.e164).toBe("+447400123456");
  });

  it("never assumes the UAE for a local number", () => {
    expect(parsePhone("050 123 4567")).toBeNull();
    expect(parsePhone("050 123 4567", "AE")?.e164).toBe("+971501234567");
    expect(parsePhone("050 123 4567", "SA")?.e164).toBe("+966501234567");
    expect(parsePhone("98765 43210", "in")?.e164).toBe("+919876543210");
    expect(parsePhone("07400 123456", "GB")?.e164).toBe("+447400123456");
  });

  it("ignores an unknown default country and rejects junk", () => {
    expect(parsePhone("050 123 4567", "UK")).toBeNull();
    expect(parsePhone("+971 50 123 4567", "XX")?.country).toBe("AE");
    expect(parsePhone("notaphone", "AE")).toBeNull();
    expect(parsePhone("   ")).toBeNull();
  });

  it("knows every country with a dial code", () => {
    expect(COUNTRIES.length).toBeGreaterThan(200);
    expect(countryByCode("in")).toMatchObject({ name: "India", dialCode: "91", flag: "🇮🇳" });
    expect(isCountryCode("AE")).toBe(true);
    expect(isCountryCode("UK")).toBe(false);
    expect(isCountryCode("")).toBe(false);
  });
});
