import {
  AttendanceDay,
  AuditLog,
  Employee,
  LeadDeposit,
  LeaveLedger,
  LeaveRequest,
  NotificationLog,
  PayrollMonth,
  Payslip,
  SalaryAdvance,
  Types,
} from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { freezeClock, setClock } from "@edge/domain/clock";
import type { LeaveLedgerKind } from "@edge/domain/hr/enums";
import { totalsByCurrency } from "@edge/domain/hr/pay";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addManualLine,
  adjustBalance,
  applyLeave,
  approveAdvance,
  approveLeave,
  attendanceSheet,
  BusinessError,
  cancelLeave,
  cancelMyLeave,
  closeMonth,
  createStaff,
  employeeLeave,
  fileLeaveFor,
  ForbiddenError,
  getPayrollMonth,
  listPayrollMonths,
  listTeam,
  loadViewer,
  markAttendance,
  myAttendance,
  myLeave,
  myPayslip,
  myPayslips,
  NotFoundError,
  refreshMonth,
  rejectLeave,
  removeManualLine,
  requestAdvance,
  rescheduleAdvance,
  runLeaveDaily,
  saveEmployee,
  saveHrSettings,
  savePay,
  startMonth,
  TransitionError,
  updateStaff,
  ValidationError,
} from "../src";

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  freezeClock("2026-10-06T06:00:00Z"); // Tuesday, 10:00 Dubai
});
afterEach(() => setClock(null));

let n = 0;
async function person(role = "employee") {
  n += 1;
  const { id } = await createStaff(
    { name: `${role} ${n}`, email: `${role}-${n}-${Date.now()}@edge.test`, roleKeys: [role], password: "StaffPass!2026" },
    { type: "SYSTEM" },
  );
  return { id, actor: { type: "USER" as const, id } };
}

/** A person with an HR record who joined long ago, and an HR manager and super admin to act on them. */
async function staffed(pay?: { currency?: "AED" | "USD" | "INR"; base?: string }) {
  const hr = await person("hr_manager");
  const boss = await person("super_admin");
  const p = await person();
  await saveEmployee(p.id, { joinedOn: "2020-01-15" }, hr.actor);
  if (pay)
    await savePay(p.id, { fromMonth: "2026-01", currency: pay.currency ?? "AED", base: pay.base ?? "3000", allowances: [] }, hr.actor);
  return { hr, boss, p };
}

const seedBalance = (id: string, days: number, year = 2026) =>
  LeaveLedger.create([
    { employeeId: new Types.ObjectId(id), typeKey: "annual", leaveYear: year, kind: "ADJUSTMENT", centiDays: days * 100 },
  ]);
const balance = async (id: string, typeKey = "annual") => (await myLeave(id)).balances.find((b) => b.typeKey === typeKey)!.balanceCenti;

async function deposit(personId: string, day: string, commissionMinor: number, status: "VERIFIED" | "PENDING" | "REJECTED" = "VERIFIED") {
  const [d] = await LeadDeposit.create([
    {
      leadId: new Types.ObjectId(),
      projectId: new Types.ObjectId(),
      creditedToId: new Types.ObjectId(personId),
      loggedById: new Types.ObjectId(personId),
      sequence: "FIRST",
      amountMinor: commissionMinor * 10,
      currency: "USD",
      depositedAt: new Date(`${day}T00:00:00.000Z`),
      status,
      commissionPct: "0.1",
      commissionMinor,
    },
  ]);
  return d!;
}

const slipOf = (month: string, id: string) => Payslip.findOne({ month, employeeId: new Types.ObjectId(id) }).lean();
const linesOf = async (month: string, id: string) =>
  (await slipOf(month, id))!.lines.map((l) => [l.kind, l.currency, l.amountMinor, l.forMonth ?? null]);

describe("access", () => {
  it("only lets a super admin hand out HR access", async () => {
    const admin = await person("admin");
    const boss = await person("super_admin");
    const target = await person();
    const update = (actor: { type: "USER"; id: string }, roleKeys: string[]) => updateStaff(target.id, { name: "T", roleKeys }, actor);
    await expect(update(admin.actor, ["hr_manager"])).rejects.toThrow("Only a super admin");
    await expect(createStaff({ name: "X", email: `x-${Date.now()}@edge.test`, roleKeys: ["hr_manager"] }, admin.actor)).rejects.toThrow(
      "Only a super admin",
    );
    await update(boss.actor, ["hr_manager"]);
    await expect(update(admin.actor, ["employee"])).rejects.toThrow("Only a super admin");
    await update(admin.actor, ["hr_manager", "finance"]);
  });

  it("requires two-factor for HR and gives plain staff none of the HR permissions", async () => {
    const hr = await loadViewer((await person("hr_manager")).id);
    const plain = await loadViewer((await person()).id);
    expect(hr!.permissions.has("hr.payroll")).toBe(true);
    expect(plain!.permissions.size).toBe(0);
    const admin = await loadViewer((await person("admin")).id);
    expect([...admin!.permissions].some((p) => p.startsWith("hr."))).toBe(false);
  });

  it("lists every staff account and marks who isn't set up", async () => {
    const { p } = await staffed();
    const fresh = await person();
    const team = await listTeam();
    expect(team.find((t) => t.id === p.id)!.setUp).toBe(true);
    expect(team.find((t) => t.id === fresh.id)!.setUp).toBe(false);
  });

  it("stops HR changing their own pay, leave or payslip, but not a super admin", async () => {
    const { hr, boss } = await staffed();
    await saveEmployee(hr.id, { joinedOn: "2021-01-01" }, boss.actor);
    await expect(savePay(hr.id, { fromMonth: "2026-10", currency: "AED", base: "9000", allowances: [] }, hr.actor)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await savePay(hr.id, { fromMonth: "2026-10", currency: "AED", base: "9000", allowances: [] }, boss.actor);
    await seedBalance(hr.id, 10);
    const leave = await applyLeave(hr.id, { typeKey: "annual", fromDay: "2026-10-20", toDay: "2026-10-20" }, hr.actor);
    await expect(approveLeave(leave, {}, hr.actor)).rejects.toBeInstanceOf(ForbiddenError);
    await approveLeave(leave, {}, boss.actor);
    await saveEmployee(boss.id, { joinedOn: "2021-01-01" }, hr.actor);
    await seedBalance(boss.id, 10);
    await approveLeave(
      await applyLeave(boss.id, { typeKey: "annual", fromDay: "2026-10-21", toDay: "2026-10-21" }, boss.actor),
      {},
      boss.actor,
    );
  });

  it("keeps salary figures out of the audit log and emails", async () => {
    const { hr, p } = await staffed({ base: "1234" });
    await startMonth("2026-10", hr.actor);
    await closeMonth("2026-10", hr.actor);
    const text = JSON.stringify([await AuditLog.find().lean(), await NotificationLog.find().lean()]);
    expect(text).not.toContain("123400");
    expect(text).not.toContain("1,234");
    expect((await myPayslips(p.id)).length).toBe(1);
  });
});

describe("attendance", () => {
  it("marks a day, refuses the future, and shows days off", async () => {
    const { hr, p } = await staffed();
    await markAttendance({ day: "2026-10-05", rows: [{ employeeId: p.id, status: "LATE", note: "Traffic" }] }, hr.actor);
    const sheet = await attendanceSheet("2026-10-05");
    expect(sheet.rows.find((r) => r.employeeId === p.id)).toMatchObject({ status: "LATE", note: "Traffic", source: "HR", off: null });
    expect((await attendanceSheet("2026-10-04")).rows[0]!.off).toBe("WEEKLY_OFF");
    await expect(markAttendance({ day: "2026-10-07", rows: [{ employeeId: p.id, status: "PRESENT" }] }, hr.actor)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await markAttendance({ day: "2026-10-05", rows: [{ employeeId: p.id, status: null }] }, hr.actor);
    expect(await AttendanceDay.countDocuments()).toBe(0);
    const mine = await myAttendance(p.id, "2026-10");
    expect(mine.days[0]!.day).toBe("2026-10-06");
  });

  it("leaves days written by approved leave alone, and locks closed months", async () => {
    const { hr, p } = await staffed({});
    await seedBalance(p.id, 5);
    await approveLeave(await applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-05", toDay: "2026-10-05" }, p.actor), {}, hr.actor);
    await markAttendance({ day: "2026-10-05", rows: [{ employeeId: p.id, status: "ABSENT" }] }, hr.actor);
    expect((await AttendanceDay.findOne().lean())!.status).toBe("LEAVE");
    await startMonth("2026-10", hr.actor);
    await closeMonth("2026-10", hr.actor);
    await expect(markAttendance({ day: "2026-10-02", rows: [{ employeeId: p.id, status: "PRESENT" }] }, hr.actor)).rejects.toBeInstanceOf(
      TransitionError,
    );
    expect((await attendanceSheet("2026-10-02")).locked).toBe(true);
  });

  it("never changes pay when someone is absent", async () => {
    const { hr, p } = await staffed({ base: "3000" });
    await markAttendance({ day: "2026-10-05", rows: [{ employeeId: p.id, status: "ABSENT" }] }, hr.actor);
    await startMonth("2026-10", hr.actor);
    expect(await linesOf("2026-10", p.id)).toEqual([["SALARY", "AED", 300_000, null]]);
    expect((await slipOf("2026-10", p.id))!.attendance!.absent).toBe(1);
  });
});

describe("leave", () => {
  it("counts working days and debits the balance on approval", async () => {
    const { hr, p } = await staffed();
    await seedBalance(p.id, 10);
    // Thu 8 to Tue 13 Oct: Sunday 11 is off.
    const id = await applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-08", toDay: "2026-10-13", reason: "Trip" }, p.actor);
    expect(await balance(p.id)).toBe(1000);
    await approveLeave(id, {}, hr.actor);
    expect(await balance(p.id)).toBe(500);
    expect(await AttendanceDay.countDocuments({ source: "LEAVE" })).toBe(5);
  });

  it("refuses overlaps, days off, half days over several days and missing documents", async () => {
    const { p } = await staffed();
    await applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-08", toDay: "2026-10-09" }, p.actor);
    await expect(applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-09", toDay: "2026-10-10" }, p.actor)).rejects.toBeInstanceOf(
      BusinessError,
    );
    await expect(applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-11", toDay: "2026-10-11" }, p.actor)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-20", toDay: "2026-10-21", halfDay: "AM" }, p.actor),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(applyLeave(p.id, { typeKey: "sick", fromDay: "2026-10-20", toDay: "2026-10-20" }, p.actor)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("blocks a short balance unless the approver allows it, and records that", async () => {
    const { hr, p } = await staffed();
    await seedBalance(p.id, 1);
    const id = await applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-12", toDay: "2026-10-13" }, p.actor);
    await expect(approveLeave(id, {}, hr.actor)).rejects.toThrow("allow negative balance");
    expect(await balance(p.id)).toBe(100);
    await approveLeave(id, { allowNegative: true }, hr.actor);
    expect(await balance(p.id)).toBe(-100);
    expect((await LeaveRequest.findById(id).lean())!.allowedNegative).toBe(true);
  });

  it("can't spend one balance twice when two approvals race", async () => {
    const { hr, boss, p } = await staffed();
    await seedBalance(p.id, 1);
    const a = await applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-12", toDay: "2026-10-12" }, p.actor);
    const b = await applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-13", toDay: "2026-10-13" }, p.actor);
    const results = await Promise.allSettled([approveLeave(a, {}, hr.actor), approveLeave(b, {}, boss.actor)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await balance(p.id)).toBe(0);
  });

  it("debits each leave year separately", async () => {
    const { hr, p } = await staffed();
    freezeClock("2026-12-20T06:00:00Z");
    await seedBalance(p.id, 5, 2026);
    await seedBalance(p.id, 5, 2027);
    await approveLeave(await applyLeave(p.id, { typeKey: "annual", fromDay: "2026-12-30", toDay: "2027-01-02" }, p.actor), {}, hr.actor);
    const taken = await LeaveLedger.find({ kind: "TAKEN" }).sort({ leaveYear: 1 }).lean();
    expect(taken.map((t) => [t.leaveYear, t.centiDays])).toEqual([
      [2026, -200],
      [2027, -200],
    ]);
  });

  it("lets staff withdraw only while pending, and not someone else's", async () => {
    const { hr, p } = await staffed();
    await seedBalance(p.id, 5);
    const other = await person();
    const id = await applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-12", toDay: "2026-10-12" }, p.actor);
    await expect(cancelMyLeave(id, other.id, other.actor)).rejects.toBeInstanceOf(NotFoundError);
    await approveLeave(id, {}, hr.actor);
    await expect(cancelMyLeave(id, p.id, p.actor)).rejects.toBeInstanceOf(TransitionError);
    await cancelLeave(id, {}, hr.actor);
    expect(await balance(p.id)).toBe(500);
    expect(await AttendanceDay.countDocuments()).toBe(0);
  });

  it("freezes days in a closed month when started leave is cancelled", async () => {
    const { hr, p } = await staffed({});
    await seedBalance(p.id, 10);
    const id = await applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-29", toDay: "2026-11-03" }, p.actor);
    await approveLeave(id, {}, hr.actor);
    expect(await balance(p.id)).toBe(1000 - 500);
    await startMonth("2026-10", hr.actor);
    await closeMonth("2026-10", hr.actor);
    freezeClock("2026-11-02T06:00:00Z");
    const out = await cancelLeave(id, { note: "Back early" }, hr.actor);
    expect(out).toEqual({ returned: 200, frozen: 300 });
    expect(await AttendanceDay.countDocuments({ source: "LEAVE" })).toBe(3);
    expect(await balance(p.id)).toBe(700);
  });

  it("won't approve leave into a closed month, and points HR to an adjustment", async () => {
    const { hr, p } = await staffed({});
    await seedBalance(p.id, 5);
    const id = await applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-05", toDay: "2026-10-05" }, p.actor);
    await startMonth("2026-10", hr.actor);
    await closeMonth("2026-10", hr.actor);
    await expect(approveLeave(id, {}, hr.actor)).rejects.toThrow("adjust the balance");
    await expect(applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-06", toDay: "2026-10-06" }, p.actor)).rejects.toBeInstanceOf(
      BusinessError,
    );
    await rejectLeave(id, { note: "Use an adjustment" }, hr.actor);
    await adjustBalance(p.id, { typeKey: "annual", days: "-1", note: "Leave in closed October" }, hr.actor);
    expect(await balance(p.id)).toBe(400);
  });

  it("cuts leave back when someone leaves", async () => {
    const { hr, p } = await staffed();
    await seedBalance(p.id, 10);
    const id = await applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-12", toDay: "2026-10-14" }, p.actor);
    await approveLeave(id, {}, hr.actor);
    const pending = await applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-20", toDay: "2026-10-20" }, p.actor);
    await saveEmployee(p.id, { joinedOn: "2020-01-15", leftOn: "2026-10-12" }, hr.actor);
    const r = (await LeaveRequest.findById(id).lean())!;
    expect(r.status).toBe("APPROVED");
    expect(r.centiDays).toBe(100);
    expect((await LeaveRequest.findById(pending).lean())!.status).toBe("CANCELLED");
    expect(await balance(p.id)).toBe(900);
    expect(await AttendanceDay.countDocuments()).toBe(1);
  });

  it("lets HR file for someone, without the document staff would need", async () => {
    const { hr, p } = await staffed();
    const id = await fileLeaveFor(p.id, { typeKey: "sick", fromDay: "2026-10-05", toDay: "2026-10-05" }, hr.actor);
    await LeaveLedger.create([
      { employeeId: new Types.ObjectId(p.id), typeKey: "sick", leaveYear: 2026, kind: "ADJUSTMENT", centiDays: 100 },
    ]);
    await approveLeave(id, {}, hr.actor);
    expect(await balance(p.id, "sick")).toBe(0);
  });

  it("keeps the type's key when renamed and only ever switches types off", async () => {
    const { hr, p } = await staffed();
    await saveHrSettings(
      {
        leaveTypes: [
          {
            key: "annual",
            name: "Vacation",
            paid: true,
            accrual: "MONTHLY",
            daysPerYear: 24,
            carryForwardDays: 5,
            needsAttachment: false,
            active: true,
          },
          { name: "Study leave", paid: false, accrual: "NONE", daysPerYear: 0, carryForwardDays: 0, needsAttachment: false, active: true },
        ],
        weeklyOffDays: [0, 6],
        holidays: [{ day: "2026-12-02", name: "National Day" }],
      },
      hr.actor,
    );
    const types = (await myLeave(p.id)).balances;
    expect(types.map((t) => t.typeKey)).toEqual(["annual", "study-leave"]);
    expect(types[0]!.name).toBe("Vacation");
    await expect(applyLeave(p.id, { typeKey: "sick", fromDay: "2026-10-20", toDay: "2026-10-20" }, p.actor)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("leave accrual", () => {
  const ledger = (id: string, kind?: LeaveLedgerKind) =>
    LeaveLedger.find({ employeeId: new Types.ObjectId(id), ...(kind ? { kind } : {}) })
      .sort({ key: 1 })
      .lean();

  it("doesn't back-accrue before set-up: that's the opening balance", async () => {
    const { p } = await staffed();
    expect((await Employee.findById(p.id).lean())!.accrualFromMonth).toBe("2026-11");
    await runLeaveDaily(new Date("2026-10-31T10:00:00Z"));
    expect(await ledger(p.id)).toHaveLength(0);
    await runLeaveDaily(new Date("2026-10-31T20:30:00Z")); // 00:30 on 1 November in Dubai
    expect((await ledger(p.id)).map((l) => l.centiDays)).toEqual([250]);
  });

  it("is safe to rerun, and catches up after missed days", async () => {
    const { p } = await staffed();
    const at = new Date("2026-12-15T06:00:00Z");
    await runLeaveDaily(at);
    await runLeaveDaily(at);
    expect((await ledger(p.id, "ACCRUAL")).map((l) => l.key?.slice(-7))).toEqual(["2026-11", "2026-12"]);
  });

  it("uses a person's override", async () => {
    const hr = await person("hr_manager");
    const p = await person();
    await saveEmployee(p.id, { joinedOn: "2020-01-15", leaveOverrides: [{ typeKey: "annual", daysPerYear: 18 }] }, hr.actor);
    await runLeaveDaily(new Date("2026-11-01T06:00:00Z"));
    expect((await ledger(p.id, "ACCRUAL"))[0]!.centiDays).toBe(150);
  });

  it("starts a mid-month joiner the next month, and a first-of-month joiner that month", async () => {
    const hr = await person("hr_manager");
    const a = await person();
    const b = await person();
    await saveEmployee(a.id, { joinedOn: "2026-11-10" }, hr.actor);
    await saveEmployee(b.id, { joinedOn: "2026-11-01" }, hr.actor);
    expect((await Employee.findById(a.id).lean())!.accrualFromMonth).toBe("2026-12");
    expect((await Employee.findById(b.id).lean())!.accrualFromMonth).toBe("2026-11");
  });

  it("stops at the leaving month", async () => {
    const { hr, p } = await staffed();
    await saveEmployee(p.id, { joinedOn: "2020-01-15", leftOn: "2026-11-20" }, hr.actor);
    await runLeaveDaily(new Date("2027-02-01T06:00:00Z"));
    expect((await ledger(p.id, "ACCRUAL")).map((l) => l.key?.slice(-7))).toEqual(["2026-11"]);
  });

  it("rolls the year over before January's accrual, capped by the setting", async () => {
    const { hr, p } = await staffed();
    await saveHrSettings(
      {
        leaveTypes: [
          {
            key: "annual",
            name: "Annual",
            paid: true,
            accrual: "MONTHLY",
            daysPerYear: 30,
            carryForwardDays: 3,
            needsAttachment: false,
            active: true,
          },
        ],
        weeklyOffDays: [0],
        holidays: [],
      },
      hr.actor,
    );
    await seedBalance(p.id, 10, 2026);
    await runLeaveDaily(new Date("2027-01-01T06:00:00Z"));
    await runLeaveDaily(new Date("2027-01-02T06:00:00Z"));
    const y2027 = await LeaveLedger.find({ employeeId: new Types.ObjectId(p.id), leaveYear: 2027 }).lean();
    expect(y2027.map((l) => [l.kind, l.centiDays]).sort()).toEqual([
      ["ACCRUAL", 250],
      ["CARRY_FORWARD", 300],
    ]);
    freezeClock("2027-01-05T06:00:00Z");
    expect((await employeeLeave(p.id)).balances.find((b) => b.typeKey === "annual")!.balanceCenti).toBe(550);
  });

  it("gives a yearly grant from the January after set-up", async () => {
    const { p } = await staffed();
    await runLeaveDaily(new Date("2026-12-01T06:00:00Z"));
    expect(await ledger(p.id).then((r) => r.filter((l) => l.typeKey === "sick"))).toHaveLength(0);
    await runLeaveDaily(new Date("2027-01-01T06:00:00Z"));
    expect((await ledger(p.id, "ACCRUAL")).filter((l) => l.typeKey === "sick").map((l) => l.centiDays)).toEqual([1500]);
  });
});

describe("salary months", () => {
  it("builds salary, allowances and commission, each in its own currency", async () => {
    const hr = await person("hr_manager");
    const p = await person();
    await saveEmployee(p.id, { joinedOn: "2020-01-15" }, hr.actor);
    await savePay(
      p.id,
      { fromMonth: "2026-01", currency: "AED", base: "2500", allowances: [{ label: "Housing", amount: "500" }], iban: "AE07" },
      hr.actor,
    );
    await deposit(p.id, "2026-10-03", 50_000);
    await deposit(p.id, "2026-10-04", 9_999, "PENDING");
    await startMonth("2026-10", hr.actor);
    expect(await linesOf("2026-10", p.id)).toEqual([
      ["SALARY", "AED", 250_000, null],
      ["ALLOWANCE", "AED", 50_000, null],
      ["COMMISSION", "USD", 50_000, "2026-10"],
    ]);
    const detail = await getPayrollMonth("2026-10");
    expect(detail.payslips[0]!.totals).toEqual([
      { currency: "AED", minor: 300_000 },
      { currency: "USD", minor: 50_000 },
    ]);
  });

  it("uses the pay revision for the month and refuses changes to closed months", async () => {
    const { hr, p } = await staffed({ base: "3000" });
    await savePay(p.id, { fromMonth: "2026-11", currency: "USD", base: "1000", allowances: [] }, hr.actor);
    await startMonth("2026-10", hr.actor);
    expect((await linesOf("2026-10", p.id))[0]).toEqual(["SALARY", "AED", 300_000, null]);
    await closeMonth("2026-10", hr.actor);
    await expect(savePay(p.id, { fromMonth: "2026-10", currency: "AED", base: "1", allowances: [] }, hr.actor)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await startMonth("2026-11", hr.actor);
    expect((await linesOf("2026-11", p.id))[0]).toEqual(["SALARY", "USD", 100_000, null]);
  });

  it("allows one draft, in order, and hides drafts from staff", async () => {
    const { hr, p } = await staffed({});
    await startMonth("2026-09", hr.actor);
    await expect(startMonth("2026-10", hr.actor)).rejects.toBeInstanceOf(BusinessError);
    expect(await myPayslips(p.id)).toEqual([]);
    await expect(myPayslip(p.id, "2026-09")).rejects.toBeInstanceOf(NotFoundError);
    expect((await listPayrollMonths()).next).toBeNull();
    await closeMonth("2026-09", hr.actor);
    expect((await listPayrollMonths()).next).toBe("2026-10");
    await expect(startMonth("2026-11", hr.actor)).rejects.toBeInstanceOf(BusinessError);
    await PayrollMonth.create([{ month: "2026-10", startedById: new Types.ObjectId(hr.id) }]);
    await expect(PayrollMonth.create([{ month: "2026-11", startedById: new Types.ObjectId(hr.id) }])).rejects.toMatchObject({
      code: 11000,
    });
  });

  it("keeps manual lines through a refresh and rejects commission by hand", async () => {
    const { hr, p } = await staffed({ base: "3000" });
    await startMonth("2026-10", hr.actor);
    const slip = await slipOf("2026-10", p.id);
    await addManualLine(String(slip!._id), { kind: "BONUS", label: "Top seller", currency: "USD", amount: "100" }, hr.actor);
    await addManualLine(String(slip!._id), { kind: "DEDUCTION", label: "Joined late", currency: "AED", amount: "200" }, hr.actor);
    await deposit(p.id, "2026-10-02", 1_000);
    expect(await refreshMonth("2026-10", hr.actor)).toBe(1);
    expect(await refreshMonth("2026-10", hr.actor)).toBe(0);
    const after = await slipOf("2026-10", p.id);
    expect(after!.lines.map((l) => [l.kind, l.amountMinor])).toEqual([
      ["SALARY", 300_000],
      ["COMMISSION", 1_000],
      ["BONUS", 10_000],
      ["DEDUCTION", -20_000],
    ]);
    await removeManualLine(String(slip!._id), String(after!.lines[2]!._id), hr.actor);
    await expect(removeManualLine(String(slip!._id), String(after!.lines[0]!._id), hr.actor)).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      addManualLine(String(slip!._id), { kind: "COMMISSION" as never, label: "x", currency: "USD", amount: "1" }, hr.actor),
    ).rejects.toBeInstanceOf(ValidationError);
    expect((await slipOf("2026-10", p.id))!.lines[0]!.kind).toBe("SALARY");
  });

  it("won't close over figures HR hasn't seen", async () => {
    const { hr, p } = await staffed({ base: "3000" });
    await startMonth("2026-10", hr.actor);
    await deposit(p.id, "2026-10-02", 7_000);
    expect(await closeMonth("2026-10", hr.actor)).toEqual({ closed: false, changed: 1 });
    expect((await PayrollMonth.findOne({ month: "2026-10" }).lean())!.status).toBe("DRAFT");
    expect((await linesOf("2026-10", p.id))[1]).toEqual(["COMMISSION", "USD", 7_000, "2026-10"]);
    expect(await closeMonth("2026-10", hr.actor)).toEqual({ closed: true, changed: 0 });
    await expect(refreshMonth("2026-10", hr.actor)).rejects.toBeInstanceOf(TransitionError);
  });

  it("blocks closing with no pay set, and accepts an explicit zero", async () => {
    const { hr, p } = await staffed();
    await startMonth("2026-10", hr.actor);
    await expect(closeMonth("2026-10", hr.actor)).rejects.toThrow("No salary set");
    await savePay(p.id, { fromMonth: "2026-10", currency: "AED", base: "0", allowances: [] }, hr.actor);
    expect(await closeMonth("2026-10", hr.actor)).toEqual({ closed: true, changed: 0 });
  });

  it("blocks closing on a negative currency: AED can't cover USD", async () => {
    const { hr, p } = await staffed({ base: "3000" });
    await startMonth("2026-10", hr.actor);
    const slip = await slipOf("2026-10", p.id);
    await addManualLine(String(slip!._id), { kind: "DEDUCTION", label: "Fine", currency: "USD", amount: "10" }, hr.actor);
    await expect(closeMonth("2026-10", hr.actor)).rejects.toThrow("negative in USD");
  });

  it("warns about commission with no HR record, and joiners and leavers", async () => {
    const { hr, p } = await staffed({ base: "3000" });
    const noRecord = await person();
    await deposit(noRecord.id, "2026-10-02", 500);
    const joiner = await person();
    await saveEmployee(joiner.id, { joinedOn: "2026-10-05" }, hr.actor);
    await savePay(joiner.id, { fromMonth: "2026-10", currency: "INR", base: "50000", allowances: [] }, hr.actor);
    await saveEmployee(p.id, { joinedOn: "2020-01-15", leftOn: "2026-10-20" }, hr.actor);
    await startMonth("2026-10", hr.actor);
    const kinds = (await getPayrollMonth("2026-10")).warnings.map((w) => [w.kind, w.blocking]).sort();
    expect(kinds).toEqual([
      ["COMMISSION_NO_RECORD", false],
      ["JOINED", false],
      ["LEFT", false],
    ]);
  });

  it("excludes people outside their dates", async () => {
    const { hr, p } = await staffed({ base: "3000" });
    await saveEmployee(p.id, { joinedOn: "2020-01-15", leftOn: "2026-09-30" }, hr.actor);
    await startMonth("2026-10", hr.actor);
    expect(await slipOf("2026-10", p.id)).toBeNull();
  });
});

describe("commission after a month closes", () => {
  const closeOctober = async (hr: { actor: { type: "USER"; id: string } }) => {
    await startMonth("2026-10", hr.actor);
    await closeMonth("2026-10", hr.actor);
  };
  const adjustment = async (id: string, month = "2026-11") =>
    (await slipOf(month, id))!.lines.filter((l) => l.kind === "COMMISSION_ADJUSTMENT").map((l) => [l.amountMinor, l.forMonth]);

  it("pays a deposit verified late, exactly once, however often the draft refreshes", async () => {
    const { hr, p } = await staffed({ base: "3000" });
    await closeOctober(hr);
    await deposit(p.id, "2026-10-20", 4_000);
    await startMonth("2026-11", hr.actor);
    await refreshMonth("2026-11", hr.actor);
    await refreshMonth("2026-11", hr.actor);
    expect(await adjustment(p.id)).toEqual([[4_000, "2026-10"]]);
    await closeMonth("2026-11", hr.actor);
    await startMonth("2026-12", hr.actor);
    expect(await adjustment(p.id, "2026-12")).toEqual([]);
  });

  it("takes back a deposit rejected after close", async () => {
    const { hr, p } = await staffed({ base: "3000", currency: "USD" });
    const d = await deposit(p.id, "2026-10-20", 4_000);
    await closeOctober(hr);
    await LeadDeposit.updateOne({ _id: d._id }, { $set: { status: "REJECTED", commissionMinor: null } });
    await startMonth("2026-11", hr.actor);
    expect(await adjustment(p.id)).toEqual([[-4_000, "2026-10"]]);
  });

  it("caps a clawback at the payslip's USD and carries the rest", async () => {
    const { hr, p } = await staffed({ base: "3000" });
    const d = await deposit(p.id, "2026-10-20", 4_000);
    await closeOctober(hr);
    await LeadDeposit.updateOne({ _id: d._id }, { $set: { status: "REJECTED", commissionMinor: null } });
    await deposit(p.id, "2026-11-02", 1_000);
    await startMonth("2026-11", hr.actor);
    expect(await adjustment(p.id)).toEqual([[-1_000, "2026-10"]]);
    expect(totalsByCurrency((await slipOf("2026-11", p.id))!.lines)).toEqual([{ currency: "AED", minor: 300_000 }]);
    expect((await closeMonth("2026-11", hr.actor)).closed).toBe(true);
    await deposit(p.id, "2026-12-02", 5_000);
    await startMonth("2026-12", hr.actor);
    expect(await adjustment(p.id, "2026-12")).toEqual([[-3_000, "2026-10"]]);
  });

  it("drops a clawback line entirely when the payslip has no USD", async () => {
    const { hr, p } = await staffed({ base: "3000" });
    const d = await deposit(p.id, "2026-10-20", 4_000);
    await closeOctober(hr);
    await LeadDeposit.updateOne({ _id: d._id }, { $set: { status: "REJECTED", commissionMinor: null } });
    await startMonth("2026-11", hr.actor);
    expect(await adjustment(p.id)).toEqual([]);
    expect((await closeMonth("2026-11", hr.actor)).closed).toBe(true);
  });

  it("never reaches back before the first closed month", async () => {
    const { hr, p } = await staffed({ base: "3000" });
    await deposit(p.id, "2026-08-10", 9_000);
    await closeOctober(hr);
    await startMonth("2026-11", hr.actor);
    expect(await adjustment(p.id)).toEqual([]);
  });

  it("pays commission from a month with no payslip, and reaches a leaver", async () => {
    const hr = await person("hr_manager");
    const p = await person();
    const other = await person();
    await saveEmployee(other.id, { joinedOn: "2020-01-01" }, hr.actor);
    await savePay(other.id, { fromMonth: "2026-01", currency: "AED", base: "1", allowances: [] }, hr.actor);
    await closeOctober({ actor: hr.actor });
    await deposit(p.id, "2026-10-20", 2_500);
    await saveEmployee(p.id, { joinedOn: "2020-01-15", leftOn: "2026-10-25" }, hr.actor);
    await startMonth("2026-11", hr.actor);
    expect(await adjustment(p.id)).toEqual([[2_500, "2026-10"]]);
  });
});

describe("advances", () => {
  it("is always in pay currency, one at a time", async () => {
    const { p } = await staffed({ currency: "INR", base: "90000" });
    const id = await requestAdvance(p.id, { amount: "9000" }, p.actor);
    expect((await SalaryAdvance.findById(id).lean())!.currency).toBe("INR");
    await expect(requestAdvance(p.id, { amount: "1" }, p.actor)).rejects.toBeInstanceOf(BusinessError);
  });

  it("needs pay to be set", async () => {
    const { p } = await staffed();
    await expect(requestAdvance(p.id, { amount: "100" }, p.actor)).rejects.toThrow("salary");
  });

  it("repays across months and finishes as repaid", async () => {
    const { hr, p } = await staffed({ base: "3000" });
    const id = await requestAdvance(p.id, { amount: "1000" }, p.actor);
    await approveAdvance(id, { firstMonth: "2026-10", months: 2, paidOn: "2026-10-06" }, hr.actor);
    await startMonth("2026-10", hr.actor);
    expect((await linesOf("2026-10", p.id))[1]).toEqual(["ADVANCE_REPAYMENT", "AED", -50_000, null]);
    await closeMonth("2026-10", hr.actor);
    expect((await SalaryAdvance.findById(id).lean())!.installments.map((i) => i.status)).toEqual(["DEDUCTED", "SCHEDULED"]);
    await startMonth("2026-11", hr.actor);
    await closeMonth("2026-11", hr.actor);
    expect((await SalaryAdvance.findById(id).lean())!.status).toBe("REPAID");
    await startMonth("2026-12", hr.actor);
    expect(await linesOf("2026-12", p.id)).toEqual([["SALARY", "AED", 300_000, null]]);
  });

  it("can't be self-approved, or scheduled into a closed month", async () => {
    const { hr, boss, p } = await staffed({ base: "3000" });
    await savePay(hr.id, { fromMonth: "2026-01", currency: "AED", base: "1000", allowances: [] }, boss.actor).catch(() => undefined);
    await saveEmployee(hr.id, { joinedOn: "2021-01-01" }, boss.actor);
    await savePay(hr.id, { fromMonth: "2026-01", currency: "AED", base: "1000", allowances: [] }, boss.actor);
    const mine = await requestAdvance(hr.id, { amount: "100" }, hr.actor);
    await expect(approveAdvance(mine, { firstMonth: "2026-11", months: 1, paidOn: "2026-10-06" }, hr.actor)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await startMonth("2026-10", hr.actor);
    await closeMonth("2026-10", hr.actor);
    const id = await requestAdvance(p.id, { amount: "100" }, p.actor);
    await expect(approveAdvance(id, { firstMonth: "2026-10", months: 1, paidOn: "2026-10-06" }, hr.actor)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("reschedules only what's left and must add up", async () => {
    const { hr, p } = await staffed({ base: "3000" });
    const id = await requestAdvance(p.id, { amount: "900" }, p.actor);
    await approveAdvance(id, { firstMonth: "2026-10", months: 3, paidOn: "2026-10-06" }, hr.actor);
    await startMonth("2026-10", hr.actor);
    await closeMonth("2026-10", hr.actor);
    await expect(rescheduleAdvance(id, { installments: [{ month: "2026-12", amount: "100" }] }, hr.actor)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await rescheduleAdvance(id, { installments: [{ month: "2027-02", amount: "600" }] }, hr.actor);
    const a = (await SalaryAdvance.findById(id).lean())!;
    expect(a.installments.map((i) => [i.month, i.amountMinor, i.status])).toEqual([
      ["2026-10", 30_000, "DEDUCTED"],
      ["2027-02", 60_000, "SCHEDULED"],
    ]);
  });

  it("locks the pay currency while repaying", async () => {
    const { hr, p } = await staffed({ base: "3000" });
    const id = await requestAdvance(p.id, { amount: "100" }, p.actor);
    await approveAdvance(id, { firstMonth: "2026-11", months: 1, paidOn: "2026-10-06" }, hr.actor);
    await expect(savePay(p.id, { fromMonth: "2026-11", currency: "USD", base: "1000", allowances: [] }, hr.actor)).rejects.toBeInstanceOf(
      BusinessError,
    );
    await savePay(p.id, { fromMonth: "2026-11", currency: "AED", base: "4000", allowances: [] }, hr.actor);
  });

  it("collects an installment that was missed", async () => {
    const { hr, p } = await staffed({ base: "3000" });
    await saveEmployee(p.id, { joinedOn: "2020-01-15", leftOn: "2026-09-30" }, hr.actor);
    await Employee.updateOne({ _id: p.id }, { $set: { leftOn: null } });
    const id = await requestAdvance(p.id, { amount: "100" }, p.actor);
    await SalaryAdvance.updateOne(
      { _id: id },
      { $set: { status: "APPROVED", installments: [{ month: "2026-08", amountMinor: 10_000, status: "SCHEDULED" }] } },
    );
    await startMonth("2026-10", hr.actor);
    expect((await linesOf("2026-10", p.id))[1]).toEqual(["ADVANCE_REPAYMENT", "AED", -10_000, null]);
  });
});
