import { claudeRoutes, crmRoutes, mcpRoutes, type RouteDef } from "@edge/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TOOLS, toolAnnotations } from "../src/mcp/tools";

/** Routes Claude must never reach: staff accounts and passwords, roles, CSV files, public intake, its own switch. */
const NEVER: RouteDef[] = [
  crmRoutes.team,
  crmRoutes.staff,
  crmRoutes.createStaff,
  crmRoutes.updateStaff,
  crmRoutes.setStaffDisabled,
  crmRoutes.setStaffAvailable,
  crmRoutes.changeStaffEmail,
  crmRoutes.resetStaffPassword,
  crmRoutes.roles,
  crmRoutes.saveRole,
  crmRoutes.leadsCsv,
  crmRoutes.importPreview,
  crmRoutes.importCsv,
  crmRoutes.saveFormOrigins,
  ...Object.values(claudeRoutes),
];

describe("Claude tool registry", () => {
  it("calls exactly the routes in mcpRoutes", () => {
    const used = new Set(TOOLS.flatMap((t) => t.routes));
    const missing = [...used].filter((r) => !mcpRoutes.has(r)).map((r) => r.path);
    const unused = [...mcpRoutes].filter((r) => !used.has(r)).map((r) => r.path);
    expect(missing).toEqual([]);
    expect(unused).toEqual([]);
  });

  it("never reaches staff, passwords, roles, CSV, form origins or the Claude switch", () => {
    for (const r of NEVER) expect(mcpRoutes.has(r), r.path).toBe(false);
  });

  it("has unique, valid names and schemas that convert to JSON Schema", () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z][a-z0-9_]{2,63}$/);
      expect(t.description.length).toBeGreaterThan(20);
      expect(() => z.toJSONSchema(z.object(t.input), { io: "input" })).not.toThrow();
    }
  });

  it("marks deletes and bulk changes destructive, and reads read-only", () => {
    for (const t of TOOLS) {
      const a = toolAnnotations(t);
      expect(a.readOnlyHint).toBe(t.kind === "read");
      expect(a.destructiveHint).toBe(t.kind === "destructive");
      if (/^(delete|bulk|merge|remove|reject)_/.test(t.name)) expect(t.kind, t.name).toBe("destructive");
      // A read tool only ever GETs.
      if (t.kind === "read") for (const r of t.routes) expect(r.method, t.name).toBe("GET");
    }
  });
});
