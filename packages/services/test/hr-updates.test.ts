import { WorkUpdateInput } from "@edge/contracts";
import { AttendanceDay, Types, WorkUpdate } from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { freezeClock, setClock } from "@edge/domain/clock";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createStaff,
  hrHome,
  myWorkUpdates,
  NotFoundError,
  personWorkUpdates,
  saveEmployee,
  saveWorkUpdate,
  setStaffDisabled,
  ValidationError,
  workUpdatesDay,
} from "../src";

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  freezeClock("2026-10-06T06:00:00Z"); // Tuesday, 10:00 Dubai
});
afterEach(() => setClock(null));

let n = 0;
async function person(role = "employee", name?: string) {
  n += 1;
  const { id } = await createStaff(
    { name: name ?? `${role} ${n}`, email: `upd-${role}-${n}-${Date.now()}@edge.test`, roleKeys: [role], password: "StaffPass!2026" },
    { type: "SYSTEM" },
  );
  return { id, actor: { type: "USER" as const, id } };
}

describe("writing your own update", () => {
  it("works without an HR record, replaces the day, drops blank points and clears on an empty list", async () => {
    const p = await person("sales_executive");
    expect(await saveWorkUpdate(p.id, { day: "2026-10-06", items: ["Called 12 leads", "  ", "Demo for Acme  "] })).toEqual({
      cleared: false,
    });
    let mine = await myWorkUpdates(p.id);
    expect(mine).toMatchObject({
      today: "2026-10-06",
      day: "2026-10-06",
      earliest: "2026-09-05",
      items: ["Called 12 leads", "Demo for Acme"],
    });
    expect(mine.updatedAt).not.toBeNull();

    await saveWorkUpdate(p.id, { day: "2026-10-06", items: ["Only this"] });
    expect((await myWorkUpdates(p.id, "2026-10-06")).items).toEqual(["Only this"]);
    expect(await WorkUpdate.countDocuments({ userId: new Types.ObjectId(p.id) })).toBe(1);

    expect(await saveWorkUpdate(p.id, { day: "2026-10-06", items: ["", " "] })).toEqual({ cleared: true });
    mine = await myWorkUpdates(p.id);
    expect(mine.items).toEqual([]);
    expect(mine.updatedAt).toBeNull();
    expect(await WorkUpdate.countDocuments()).toBe(0);
  });

  it("allows back to 31 days ago, never a future day", async () => {
    const p = await person();
    await expect(saveWorkUpdate(p.id, { day: "2026-10-07", items: ["x"] })).rejects.toBeInstanceOf(ValidationError);
    await expect(saveWorkUpdate(p.id, { day: "2026-09-04", items: ["x"] })).rejects.toBeInstanceOf(ValidationError);
    await saveWorkUpdate(p.id, { day: "2026-09-05", items: ["Oldest allowed"] });
    await saveWorkUpdate(p.id, { day: "2026-10-01", items: ["Thursday"] });
    const mine = await myWorkUpdates(p.id);
    expect(mine.recent.map((r) => r.day)).toEqual(["2026-10-01", "2026-09-05"]);
    // A future day in the URL shows today instead.
    expect((await myWorkUpdates(p.id, "2026-12-01")).day).toBe("2026-10-06");
  });

  it("uses the Dubai day: 21:30 UTC is already tomorrow", async () => {
    freezeClock("2026-10-06T21:30:00Z");
    const p = await person();
    await saveWorkUpdate(p.id, { day: "2026-10-07", items: ["Late shift"] });
    expect((await myWorkUpdates(p.id)).today).toBe("2026-10-07");
  });

  it("limits points to 20 and each to 300 characters", () => {
    expect(WorkUpdateInput.safeParse({ day: "2026-10-06", items: Array(20).fill("x".repeat(300)) }).success).toBe(true);
    expect(WorkUpdateInput.safeParse({ day: "2026-10-06", items: Array(21).fill("x") }).success).toBe(false);
    expect(WorkUpdateInput.safeParse({ day: "2026-10-06", items: ["x".repeat(301)] }).success).toBe(false);
    // Surrounding spaces don't count.
    expect(WorkUpdateInput.safeParse({ day: "2026-10-06", items: [` ${"x".repeat(300)} `] }).success).toBe(true);
  });

  it("tells the dashboard whether today's update is written", async () => {
    const p = await person();
    expect((await hrHome(p.id, { manage: false, payroll: false })).workUpdateToday).toBe(false);
    await saveWorkUpdate(p.id, { day: "2026-10-05", items: ["Yesterday"] });
    expect((await hrHome(p.id, { manage: false, payroll: false })).workUpdateToday).toBe(false);
    await saveWorkUpdate(p.id, { day: "2026-10-06", items: ["Today"] });
    expect((await hrHome(p.id, { manage: false, payroll: false })).workUpdateToday).toBe(true);
  });
});

describe("HR's view", () => {
  it("lists the day's updates by name and who hasn't logged, leaving out disabled, left and not-yet-joined staff", async () => {
    const hr = await person("hr_manager", "Hana HR");
    const zed = await person("employee", "Zed Writer");
    const amy = await person("employee", "Amy Writer");
    const quiet = await person("employee", "Quiet Person");
    const off = await person("employee", "Disabled Person");
    const left = await person("employee", "Left Person");
    const later = await person("employee", "Later Joiner");
    const away = await person("employee", "Away Person");
    await setStaffDisabled(off.id, true, hr.actor);
    await saveEmployee(left.id, { joinedOn: "2020-01-01", leftOn: "2026-10-01" }, hr.actor);
    await saveEmployee(later.id, { joinedOn: "2026-11-01" }, hr.actor);
    await saveEmployee(away.id, { joinedOn: "2020-01-01" }, hr.actor);
    await AttendanceDay.create([
      { employeeId: new Types.ObjectId(away.id), day: new Date("2026-10-06T00:00:00Z"), status: "LEAVE", source: "LEAVE" },
    ]);
    await saveWorkUpdate(zed.id, { day: "2026-10-06", items: ["Z point"] });
    await saveWorkUpdate(amy.id, { day: "2026-10-06", items: ["A point", "Another"] });
    await saveWorkUpdate(quiet.id, { day: "2026-10-05", items: ["Yesterday only"] });

    const d = await workUpdatesDay();
    expect(d.day).toBe("2026-10-06");
    expect(d.rows.map((r) => [r.person.name, r.items])).toEqual([
      ["Amy Writer", ["A point", "Another"]],
      ["Zed Writer", ["Z point"]],
    ]);
    expect(d.missing.map((m) => [m.name, m.off])).toEqual([
      ["Away Person", "LEAVE"],
      ["Hana HR", null],
      ["Quiet Person", null],
    ]);

    // Sunday is the company's weekly off.
    const sunday = await workUpdatesDay("2026-10-04");
    expect(sunday.rows).toEqual([]);
    expect(sunday.missing.find((m) => m.name === "Quiet Person")?.off).toBe("WEEKLY_OFF");
  });

  it("pages one person's updates, newest first", async () => {
    const p = await person("employee", "Paged Person");
    for (const day of ["2026-10-01", "2026-10-02", "2026-10-03"]) await saveWorkUpdate(p.id, { day, items: [`On ${day}`] });
    const page = await personWorkUpdates(p.id, { page: 1, pageSize: 2 });
    expect(page.person).toMatchObject({ id: p.id, name: "Paged Person" });
    expect(page.total).toBe(3);
    expect(page.rows.map((r) => r.day)).toEqual(["2026-10-03", "2026-10-02"]);
    await expect(personWorkUpdates(new Types.ObjectId().toHexString(), {})).rejects.toBeInstanceOf(NotFoundError);
  });
});
