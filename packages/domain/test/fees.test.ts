import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { gatewayCharge, quote, vatTreatmentFor } from "../src/payments/fees";

const TABBY = { pct: "0.0675", fixedMinor: 100 };
const CARD_INTL = { pct: "0.0397", fixedMinor: 100 };
const NOMOD_AE = { pct: "0.0237", fixedMinor: 80 };

describe("quote", () => {
  it("UAE student, full 5,000 AED via Tabby (client calculator example)", () => {
    const q = quote({ courseMinor: 500000, vatTreatment: "STANDARD", rate: TABBY });
    expect(q).toEqual({
      courseMinor: 500000,
      courseVatMinor: 25000,
      netMinor: 525000,
      processingFeeMinor: 38249,
      processingFeeVatMinor: 1912,
      surchargeMinor: 40161,
      totalMinor: 565161,
    });
  });

  it("KSA student, 300 AED advance by international card (zero-rated)", () => {
    const q = quote({ courseMinor: 30000, vatTreatment: "ZERO_RATED", rate: CARD_INTL });
    expect(q.courseVatMinor).toBe(0);
    expect(q.totalMinor).toBe(31415);
    expect(q.processingFeeMinor).toBe(1415);
    expect(q.processingFeeVatMinor).toBe(0);
  });

  it("UAE student, 300 AED advance via Nomod UAE card", () => {
    const q = quote({ courseMinor: 30000, vatTreatment: "ZERO_RATED", rate: NOMOD_AE });
    expect(q.totalMinor).toBe(30852);
  });

  it("rejects invalid input", () => {
    expect(() => quote({ courseMinor: 0, vatTreatment: "STANDARD", rate: TABBY })).toThrow();
    expect(() => quote({ courseMinor: 100, vatTreatment: "STANDARD", rate: { pct: "0.99", fixedMinor: 0 } })).toThrow();
  });

  it("invariants: lines sum to total and Edge never under-recovers", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5_000_000 }),
        fc.constantFrom<"STANDARD" | "ZERO_RATED">("STANDARD", "ZERO_RATED"),
        fc.integer({ min: 0, max: 1500 }), // pct in basis points (0 - 15%)
        fc.integer({ min: 0, max: 500 }),
        (courseMinor, vat, bps, fixedMinor) => {
          const rate = { pct: (bps / 10000).toString(), fixedMinor };
          const q = quote({ courseMinor, vatTreatment: vat, rate });
          expect(q.courseMinor + q.courseVatMinor).toBe(q.netMinor);
          expect(q.netMinor + q.processingFeeMinor + q.processingFeeVatMinor).toBe(q.totalMinor);
          const edgeReceives = gatewayCharge(q.totalMinor, rate).negated().plus(q.totalMinor);
          expect(edgeReceives.gte(q.netMinor - 1e-9)).toBe(true);
          // over-recovery is bounded to rounding (a couple of fils)
          expect(edgeReceives.minus(q.netMinor).lt(3)).toBe(true);
        },
      ),
      { numRuns: 2000 },
    );
  });
});

describe("vatTreatmentFor", () => {
  it("UAE is standard rated, others zero rated", () => {
    expect(vatTreatmentFor("AE")).toBe("STANDARD");
    expect(vatTreatmentFor("sa")).toBe("ZERO_RATED");
  });
});
