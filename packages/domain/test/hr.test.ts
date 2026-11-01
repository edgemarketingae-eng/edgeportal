import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, HR_PERMISSIONS, isCrmRole, SYSTEM_ROLES } from "../src/auth/permissions";
import { addMonths, daysBetween, formatMonth, isMonth, monthOf, monthRange, monthsBetween, type WorkCalendar } from "../src/hr/calendar";
import { carryForward, centiByYear, formatDays, leaveDays, monthlyAccrual, sumCenti } from "../src/hr/leave";
import { formatPayAmount, formatPayTotal, negativeTotals, netIn, splitInstallments, totalsByCurrency } from "../src/hr/pay";

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const cal: WorkCalendar = { weeklyOffDays: [0], holidays: ["2026-12-02"] };

describe("HR roles", () => {
  const role = (key: string) => SYSTEM_ROLES.find((r) => r.key === key)!;

  it("keeps pay with HR and super admins: the admin role holds no hr.* key", () => {
    expect(HR_PERMISSIONS).toEqual(["hr.manage", "hr.payroll", "hr.settings"]);
    expect(role("hr_manager").permissions).toEqual(HR_PERMISSIONS);
    for (const p of HR_PERMISSIONS) expect(role("super_admin").permissions).toContain(p);
    for (const p of HR_PERMISSIONS) expect(role("admin").permissions).not.toContain(p);
    expect(role("admin").permissions.length).toBe(ALL_PERMISSIONS.length - 2 - HR_PERMISSIONS.length);
  });

  it("gives the employee role nothing and leaves CRM roles pure", () => {
    expect(role("employee").permissions).toEqual([]);
    expect(isCrmRole(role("employee"))).toBe(false);
    for (const key of ["crm_admin", "crm_manager", "project_manager", "sales_executive"]) expect(isCrmRole(role(key))).toBe(true);
  });
});

describe("months", () => {
  it("walks across year ends", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2027-01", -1)).toBe("2026-12");
    expect(monthsBetween("2026-11", "2027-02")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("gives half-open ranges of UTC-midnight days", () => {
    const { from, to } = monthRange("2026-12");
    expect(from.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(monthOf(day("2026-02-28"))).toBe("2026-02");
    expect(formatMonth("2026-10")).toBe("October 2026");
    expect(isMonth("2026-13")).toBe(false);
  });
});

describe("leave day counting", () => {
  it("skips weekly offs and holidays", () => {
    // Mon 30 Nov to Sun 6 Dec 2026: Sunday off, Wed 2 Dec a holiday.
    const days = leaveDays(day("2026-11-30"), day("2026-12-06"), cal);
    expect(days.map((d) => d.day.toISOString().slice(0, 10))).toEqual([
      "2026-11-30",
      "2026-12-01",
      "2026-12-03",
      "2026-12-04",
      "2026-12-05",
    ]);
    expect(sumCenti(days)).toBe(500);
  });

  it("counts half a day and nothing for a day off", () => {
    expect(sumCenti(leaveDays(day("2026-11-30"), day("2026-11-30"), cal, true))).toBe(50);
    expect(leaveDays(day("2026-12-06"), day("2026-12-06"), cal)).toEqual([]);
  });

  it("splits a request across leave years", () => {
    const days = leaveDays(day("2026-12-30"), day("2027-01-02"), { weeklyOffDays: [], holidays: [] });
    expect([...centiByYear(days)]).toEqual([
      [2026, 200],
      [2027, 200],
    ]);
  });

  it("includes both ends of a range", () => {
    expect(daysBetween(day("2026-10-30"), day("2026-11-01"))).toHaveLength(3);
  });

  it("formats days", () => {
    expect(formatDays(100)).toBe("1 day");
    expect(formatDays(250)).toBe("2.5 days");
    expect(formatDays(-50)).toBe("-0.5 days");
  });
});

describe("accrual", () => {
  it("adds up to exactly the yearly allowance, however it divides", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 73_200 }), (centiYear) => {
        const days = centiYear / 100;
        const sum = Array.from({ length: 12 }, (_, i) => monthlyAccrual(days, i + 1)).reduce((a, b) => a + b, 0);
        expect(sum).toBe(centiYear);
      }),
    );
  });

  it("gives 2.5 days a month on 30 days a year", () => {
    expect(monthlyAccrual(30, 1)).toBe(250);
    expect(monthlyAccrual(30, 12)).toBe(250);
  });

  it("caps carry forward but keeps a negative balance with the person", () => {
    expect(carryForward(1000, 5)).toBe(500);
    expect(carryForward(300, 5)).toBe(300);
    expect(carryForward(-150, 5)).toBe(-150);
    expect(carryForward(1000, 0)).toBe(0);
  });
});

describe("pay totals", () => {
  const lines = [
    { currency: "AED", amountMinor: 300_000 },
    { currency: "AED", amountMinor: 50_000 },
    { currency: "AED", amountMinor: -50_000 },
    { currency: "USD", amountMinor: 50_000 },
  ];

  it("never adds currencies together", () => {
    expect(totalsByCurrency(lines)).toEqual([
      { currency: "AED", minor: 300_000 },
      { currency: "USD", minor: 50_000 },
    ]);
  });

  it("reads like 3,000 AED + 500 USD", () => {
    expect(formatPayTotal(totalsByCurrency(lines))).toBe("3,000 AED + 500 USD");
    expect(formatPayTotal([])).toBe("0");
    expect(formatPayAmount(125_050, "USD")).toBe("1,250.50 USD");
    expect(
      formatPayTotal([
        { currency: "AED", minor: 100_000 },
        { currency: "USD", minor: -2_500 },
      ]),
    ).toBe("1,000 AED - 25 USD");
  });

  it("drops a currency that nets to zero", () => {
    expect(
      totalsByCurrency([
        { currency: "USD", amountMinor: 100 },
        { currency: "USD", amountMinor: -100 },
      ]),
    ).toEqual([]);
  });

  it("finds what a negative adjustment can take, and what can't be paid", () => {
    expect(netIn(lines, "AED")).toBe(300_000);
    expect(netIn(lines, "USD")).toBe(50_000);
    expect(netIn(lines, "INR")).toBe(0);
    expect(
      negativeTotals([
        { currency: "USD", amountMinor: -100 },
        { currency: "AED", amountMinor: 100 },
      ]),
    ).toEqual([{ currency: "USD", minor: -100 }]);
  });
});

describe("advance installments", () => {
  it("always adds up to the amount", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000_000 }), fc.integer({ min: 1, max: 24 }), (amount, n) => {
        const months = Array.from({ length: n }, (_, i) => addMonths("2026-10", i));
        const parts = splitInstallments(amount, months);
        expect(parts.reduce((sum, p) => sum + p.amountMinor, 0)).toBe(amount);
        expect(parts.map((p) => p.month)).toEqual(months);
      }),
    );
  });

  it("puts the remainder on the last one", () => {
    expect(splitInstallments(100_00, ["a", "b", "c"]).map((p) => p.amountMinor)).toEqual([3333, 3333, 3334]);
  });
});
