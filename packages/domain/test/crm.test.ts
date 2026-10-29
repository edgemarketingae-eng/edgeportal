import { describe, expect, it } from "vitest";
import { csvToObjects, parseCsv } from "../src/csv";
import { fromDubaiLocal, startOfDubaiDay, toDubaiLocal } from "../src/dates";
import {
  canTransition,
  isStale,
  isUncontacted,
  nextStage,
  normalizeLanguage,
  parseTags,
  stageIndex,
  whatsappDigits,
} from "../src/crm/machine";
import { commissionFor, depositMonthRange, fractionToPercent, nextSlab, percentToFraction, rateFor } from "../src/crm/commission";
import { ALL_PERMISSIONS, CRM_PERMISSIONS, isCrmRole, isPermission, RETIRED_SYSTEM_ROLES, SYSTEM_ROLES } from "../src/auth/permissions";
import { CLOSED_TASK_STATUSES, CRM_TASK_STATUSES, OPEN_TASK_STATUSES } from "../src/crm/enums";

describe("lead stage machine", () => {
  it("allows open <-> open, open -> LOST and LOST -> open, never into or out of CONVERTED", () => {
    expect(canTransition("NEW", "CONTACTED")).toBe(true);
    expect(canTransition("NEGOTIATION", "QUALIFIED")).toBe(true);
    expect(canTransition("QUALIFIED", "LOST")).toBe(true);
    expect(canTransition("LOST", "NEW")).toBe(true);
    expect(canTransition("NEW", "NEW")).toBe(false);
    expect(canTransition("NEW", "CONVERTED")).toBe(false);
    expect(canTransition("CONVERTED", "LOST")).toBe(false);
  });

  it("walks the funnel", () => {
    expect(nextStage("NEW")).toBe("CONTACTED");
    expect(nextStage("NEGOTIATION")).toBeNull();
    expect(nextStage("LOST")).toBeNull();
    expect(stageIndex("NEW")).toBe(0);
    expect(stageIndex("CONVERTED")).toBe(5);
    expect(stageIndex("LOST")).toBe(-1);
  });

  it("flags uncontacted and stale leads", () => {
    const created = new Date("2026-10-06T10:00:00Z");
    expect(isUncontacted({ stage: "NEW", firstContactedAt: null, createdAt: created }, new Date("2026-10-06T20:00:00Z"), 24)).toBe(false);
    expect(isUncontacted({ stage: "NEW", firstContactedAt: null, createdAt: created }, new Date("2026-10-08T10:00:01Z"), 24)).toBe(true);
    expect(isUncontacted({ stage: "CONTACTED", firstContactedAt: created, createdAt: created }, new Date("2026-10-08T10:00:01Z"), 24)).toBe(
      false,
    );
    expect(isStale({ stage: "QUALIFIED", lastActivityAt: created, createdAt: created }, new Date("2026-10-14T10:00:01Z"), 7)).toBe(true);
    expect(isStale({ stage: "LOST", lastActivityAt: created, createdAt: created }, new Date("2026-12-01T00:00:00Z"), 7)).toBe(false);
  });

  it("parses tags and whatsapp digits", () => {
    expect(parseTags(" Hot, webinar ,hot\nvip ")).toEqual(["hot", "webinar", "vip"]);
    expect(parseTags(null)).toEqual([]);
    expect(whatsappDigits("+971 50 123 4567")).toBe("971501234567");
  });
});

describe("permissions and CRM roles", () => {
  const role = (key: string) => SYSTEM_ROLES.find((r) => r.key === key)!;

  it("defines the crm keys and only known permissions on system roles", () => {
    for (const p of [
      "crm.access",
      "crm.read",
      "crm.write",
      "crm.assign",
      "crm.convert",
      "crm.all",
      "crm.projects.manage",
      "crm.projects.delete",
      "crm.manage",
      "crm.staff.manage",
      "crm.roles.manage",
      "crm.leads.delete",
      "crm.commission.manage",
    ])
      expect(isPermission(p)).toBe(true);
    expect(CRM_PERMISSIONS.length).toBe(13);
    expect(CRM_PERMISSIONS.every((p) => p.startsWith("crm."))).toBe(true);
    for (const r of SYSTEM_ROLES) for (const p of r.permissions) expect(ALL_PERMISSIONS).toContain(p);
  });

  it("ships four CRM-only roles, from admin down to executive", () => {
    for (const key of ["crm_admin", "crm_manager", "project_manager", "sales_executive"]) expect(isCrmRole(role(key)), key).toBe(true);
    expect([...role("crm_admin").permissions].sort()).toEqual([...CRM_PERMISSIONS].sort());
    expect(role("crm_manager").permissions).toEqual(expect.arrayContaining(["crm.all", "crm.projects.manage", "crm.manage"]));
    expect(role("crm_manager").permissions).not.toContain("crm.staff.manage");
    // Deleting leads is for admins and CRM admins only.
    for (const key of ["super_admin", "admin", "crm_admin"]) expect(role(key).permissions, key).toContain("crm.leads.delete");
    for (const key of ["crm_manager", "project_manager", "sales_executive"])
      expect(role(key).permissions, key).not.toContain("crm.leads.delete");
    // Deleting (empty) projects likewise: CRM managers create and archive them.
    for (const key of ["super_admin", "admin", "crm_admin"]) expect(role(key).permissions, key).toContain("crm.projects.delete");
    for (const key of ["crm_manager", "project_manager", "sales_executive"])
      expect(role(key).permissions, key).not.toContain("crm.projects.delete");
    // Commission (rates, verifying deposits, everyone's totals) likewise.
    for (const key of ["super_admin", "admin", "crm_admin"]) expect(role(key).permissions, key).toContain("crm.commission.manage");
    for (const key of ["crm_manager", "project_manager", "sales_executive"])
      expect(role(key).permissions, key).not.toContain("crm.commission.manage");
    expect(role("project_manager").permissions).toContain("crm.assign");
    expect(role("project_manager").permissions).not.toContain("crm.all");
    expect(role("sales_executive").permissions).toEqual(expect.arrayContaining(["crm.access", "crm.read", "crm.write", "crm.convert"]));
    expect(role("sales_executive").permissions).not.toContain("crm.assign");
  });

  it("keeps academy roles out of the CRM's own staff management and retires the old sales role", () => {
    expect(isCrmRole(role("admissions"))).toBe(false);
    expect(isCrmRole(role("admin"))).toBe(false);
    expect(isCrmRole({ permissions: [] })).toBe(false);
    expect(role("admissions").permissions.some((p) => p.startsWith("crm."))).toBe(false);
    expect(SYSTEM_ROLES.some((r) => r.key === "sales")).toBe(false);
    expect(RETIRED_SYSTEM_ROLES).toContainEqual({ key: "sales", replacedBy: "sales_executive" });
  });

  it("splits task statuses into open and closed", () => {
    expect([...OPEN_TASK_STATUSES, ...CLOSED_TASK_STATUSES].sort()).toEqual([...CRM_TASK_STATUSES].sort());
    expect(OPEN_TASK_STATUSES).toContain("TODO");
    expect(CLOSED_TASK_STATUSES).toEqual(expect.arrayContaining(["DONE", "CANCELLED"]));
  });
});

describe("csv parsing", () => {
  it("reads quoted cells, escaped quotes and CRLF", () => {
    const rows = parseCsv('name,phone,notes\r\n"Doe, Jane",+971501234567,"Said ""maybe"""\nBob,,\n\n');
    expect(rows).toEqual([
      ["name", "phone", "notes"],
      ["Doe, Jane", "+971501234567", 'Said "maybe"'],
      ["Bob", "", ""],
    ]);
    const { headers, rows: objs } = csvToObjects("\uFEFFName,Mobile\nAmy,050 123 4567");
    expect(headers).toEqual(["name", "mobile"]);
    expect(objs[0]).toEqual({ name: "Amy", mobile: "050 123 4567" });
  });
});

describe("dubai local date helpers", () => {
  it("round-trips datetime-local values in Dubai time", () => {
    const d = fromDubaiLocal("2026-10-23T09:30")!;
    expect(d.toISOString()).toBe("2026-10-23T05:30:00.000Z");
    expect(toDubaiLocal(d)).toBe("2026-10-23T09:30");
    expect(fromDubaiLocal("nope")).toBeNull();
    expect(startOfDubaiDay(new Date("2026-10-23T05:30:00Z")).toISOString()).toBe("2026-10-22T20:00:00.000Z");
  });
});

describe("lead language", () => {
  it("maps free text onto the dropdown values", () => {
    expect(normalizeLanguage("English")).toBe("ENGLISH");
    expect(normalizeLanguage(" malayalam ")).toBe("MALAYALAM");
    expect(normalizeLanguage("TAMIL")).toBe("TAMIL");
    expect(normalizeLanguage("hindi")).toBe("HINDI");
    expect(normalizeLanguage("Arabic")).toBe("OTHER");
    expect(normalizeLanguage("")).toBeNull();
    expect(normalizeLanguage(null)).toBeNull();
  });
});

describe("commission", () => {
  // The slab.png rates: 4% first deposit; later deposits 1% base, 2% from $10k, 2.5% from $25k, 3% from $40k (unsorted on purpose).
  const rates = {
    firstPct: "0.04",
    slabs: [
      { fromMinor: 2_500_000, pct: "0.025" },
      { fromMinor: 0, pct: "0.01" },
      { fromMinor: 4_000_000, pct: "0.03" },
      { fromMinor: 1_000_000, pct: "0.02" },
    ],
  };

  it("rates a first deposit at the first-deposit rate, whatever its amount", () => {
    expect(rateFor(rates, "FIRST", 500_000)).toBe("0.04");
    expect(rateFor(rates, "FIRST", 5_000_000)).toBe("0.04");
  });

  it("rates later deposits by the highest slab the month's later-deposit total reaches", () => {
    expect(rateFor(rates, "LATER", 500_000)).toBe("0.01"); // $5,000 this month: base
    expect(rateFor(rates, "LATER", 999_999)).toBe("0.01");
    expect(rateFor(rates, "LATER", 1_000_000)).toBe("0.02"); // exactly $10,000
    expect(rateFor(rates, "LATER", 3_000_000)).toBe("0.025"); // $30,000
    expect(rateFor(rates, "LATER", 4_000_000)).toBe("0.03");
    expect(rateFor(rates, "LATER", 10_000_000)).toBe("0.03");
    // $8k + $6k + $15k = $29k in the month: every one of them earns 2.5% on its whole amount.
    const pct = rateFor(rates, "LATER", 800_000 + 600_000 + 1_500_000);
    expect(pct).toBe("0.025");
    expect([800_000, 600_000, 1_500_000].map((a) => commissionFor(a, pct))).toEqual([20_000, 15_000, 37_500]);
    expect(rateFor({ firstPct: "0.04", slabs: [{ fromMinor: 1_000_000, pct: "0.02" }] }, "LATER", 500_000)).toBe("0"); // no base slab
  });

  it("finds the next slab above a month total", () => {
    expect(nextSlab(rates, 0)).toEqual({ fromMinor: 1_000_000, pct: "0.02" });
    expect(nextSlab(rates, 1_000_000)).toEqual({ fromMinor: 2_500_000, pct: "0.025" });
    expect(nextSlab(rates, 2_900_000)).toEqual({ fromMinor: 4_000_000, pct: "0.03" });
    expect(nextSlab(rates, 4_000_000)).toBeNull();
  });

  it("puts a deposit in the calendar month of its date", () => {
    const oct = depositMonthRange(new Date("2026-10-31T00:00:00.000Z"));
    expect(oct.from.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(oct.to.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(depositMonthRange(new Date("2026-11-01T00:00:00.000Z")).from.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(depositMonthRange(new Date("2026-12-15T00:00:00.000Z")).to.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("rounds half up to a whole cent", () => {
    expect(commissionFor(100_000, "0.1")).toBe(10_000);
    expect(commissionFor(12_345, "0.025")).toBe(309); // 308.625
    expect(commissionFor(10, "0.05")).toBe(1); // 0.5
    expect(commissionFor(100_000, "0")).toBe(0);
    expect(() => commissionFor(100, "1.5")).toThrow();
    expect(() => commissionFor(-1, "0.1")).toThrow();
  });

  it("converts admin percentages to stored fractions and back", () => {
    expect(percentToFraction(10)).toBe("0.100000");
    expect(percentToFraction(2.5)).toBe("0.025000");
    expect(fractionToPercent("0.025000")).toBe(2.5);
    expect(fractionToPercent("0")).toBe(0);
  });
});
