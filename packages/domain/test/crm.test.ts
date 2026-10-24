import { describe, expect, it } from "vitest";
import { csvToObjects, parseCsv } from "../src/csv";
import { fromDubaiLocal, startOfDubaiDay, toDubaiLocal } from "../src/dates";
import { canTransition, isStale, isUncontacted, nextStage, parseTags, stageIndex, whatsappDigits } from "../src/crm/machine";
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
      "crm.manage",
      "crm.staff.manage",
      "crm.roles.manage",
      "crm.leads.delete",
    ])
      expect(isPermission(p)).toBe(true);
    expect(CRM_PERMISSIONS.length).toBe(11);
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
