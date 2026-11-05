import {
  AttendanceDay,
  AuditLog,
  AuthUser,
  ClassSession,
  CrmTask,
  Employee,
  EmployeePay,
  Enrollment,
  Lead,
  LeadDeposit,
  LeaveLedger,
  LeaveRequest,
  Payment,
  PayrollMonth,
  Payslip,
  Project,
  Recording,
  Role,
  StudentProfile,
  TaskComment,
  Types,
} from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { freezeClock, setClock } from "@edge/domain/clock";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  applyLeave,
  approveLeave,
  BusinessError,
  createStaff,
  deleterFor,
  ensureCurrentEnrollment,
  getDefaultProject,
  myLeave,
  recordManualPayment,
  saveEmployee,
  savePay,
  startMonth,
} from "../src";
import { createBatch, createStudent } from "./helpers";

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(async () => {
  await resetDb();
  freezeClock("2026-10-06T06:00:00Z"); // Tuesday, 10:00 Dubai
});
afterEach(() => setClock(null));

let n = 0;
async function person(role: string) {
  n += 1;
  const { id } = await createStaff(
    { name: `${role} ${n}`, email: `${role}-${n}-${Date.now()}@edge.test`, roleKeys: [role], password: "StaffPass!2026" },
    { type: "SYSTEM" },
  );
  return { id, actor: { type: "USER" as const, id } };
}
const check = (type: Parameters<typeof deleterFor>[0], id: string, actor: { type: "USER"; id: string }) =>
  deleterFor(type).check(id, actor);
const remove = (type: Parameters<typeof deleterFor>[0], id: string, actor: { type: "USER"; id: string }) =>
  deleterFor(type).remove(id, actor);
const messages = (plan: { blockers: { message: string }[] }) => plan.blockers.map((b) => b.message);

describe("super-admin deletes", () => {
  it("deletes a task with its comments and moves the lead's next follow-up", async () => {
    const boss = await person("super_admin");
    const project = await getDefaultProject();
    const lead = await Lead.create({ projectId: project._id, name: "Amy", source: "WEBSITE" });
    const [soon, later] = await CrmTask.create([
      { projectId: project._id, leadId: lead._id, title: "Call", dueAt: new Date("2026-10-07T06:00:00Z") },
      { projectId: project._id, leadId: lead._id, title: "Follow up", dueAt: new Date("2026-10-09T06:00:00Z") },
    ]);
    await Lead.updateOne({ _id: lead._id }, { $set: { nextFollowUpAt: soon!.dueAt } });
    await TaskComment.create({ taskId: soon!._id, body: "Left a voicemail", authorId: new Types.ObjectId(boss.id) });
    expect((await check("task", String(soon!._id), boss.actor)).removes).toEqual(["1 comment"]);
    await remove("task", String(soon!._id), boss.actor);
    expect(await TaskComment.countDocuments({ taskId: soon!._id })).toBe(0);
    expect((await Lead.findById(lead._id).lean())!.nextFollowUpAt).toEqual(later!.dueAt);
    const audit = await AuditLog.findOne({ action: "task.delete" }).lean();
    expect(audit!.before).toMatchObject({ title: "Call", comments: [{ body: "Left a voicemail" }] });
  });

  it("refuses built-in roles and roles someone holds", async () => {
    const boss = await person("super_admin");
    const builtIn = (await Role.findOne({ key: "mentor" }).lean())!;
    expect(messages(await check("role", String(builtIn._id), boss.actor))).toContain(
      "It's a built-in role: those come back with every update",
    );
    const [custom] = await Role.create([{ key: "trainer", name: "Trainer", permissions: ["staff.access"] }]);
    await remove("role", String(custom!._id), boss.actor);
    expect(await Role.exists({ _id: custom!._id })).toBeNull();
  });

  it("removes a manual payment from what the student has paid", async () => {
    const boss = await person("super_admin");
    await createBatch();
    const sid = await createStudent();
    await ensureCurrentEnrollment(sid, { type: "SYSTEM" });
    const pid = await recordManualPayment({ studentId: sid, kind: "FULL", method: "BANK_TRANSFER", reference: "T-1", actor: boss.actor });
    const before = (await Enrollment.findOne({ studentId: sid }).lean())!;
    expect(before).toMatchObject({ status: "PENDING_APPROVAL", paymentState: "PAID" });
    // The student can't go while money is on their account.
    expect(messages(await check("student", sid, boss.actor))).toEqual(["1 payment received. Delete it first"]);
    const plan = await check("payment", String(pid), boss.actor);
    expect(plan.blockers).toEqual([]);
    expect(plan.warnings.join(" ")).toContain("Return the money by hand");
    await remove("payment", String(pid), boss.actor);
    const after = (await Enrollment.findOne({ studentId: sid }).lean())!;
    expect(after).toMatchObject({ status: "PENDING_PAYMENT", paymentState: "UNPAID", paidCourseMinor: 0, firstPaidAt: null, lockAt: null });
    // An invoiced payment stays.
    const pid2 = await recordManualPayment({ studentId: sid, kind: "FULL", method: "CASH", reference: "T-2", actor: boss.actor });
    await Payment.updateOne({ _id: pid2 }, { $set: { "odoo.status": "SYNCED", "odoo.invoiceId": 7, "odoo.invoiceName": "INV/7" } });
    await expect(remove("payment", String(pid2), boss.actor)).rejects.toBeInstanceOf(BusinessError);
  });

  it("deletes a student with no money on the account and unlinks their lead", async () => {
    const boss = await person("super_admin");
    await createBatch();
    const sid = await createStudent();
    await ensureCurrentEnrollment(sid, { type: "SYSTEM" });
    const project = await getDefaultProject();
    const lead = await Lead.create({
      projectId: project._id,
      name: "Was a student",
      source: "WEBSITE",
      studentId: sid,
      stage: "CONVERTED",
    });
    const plan = await check("student", sid, boss.actor);
    expect(plan.blockers).toEqual([]);
    expect(plan.removes).toContain("1 enrollment");
    await remove("student", sid, boss.actor);
    expect(await AuthUser.exists({ _id: sid })).toBeNull();
    expect(await StudentProfile.exists({ _id: sid })).toBeNull();
    expect(await Enrollment.countDocuments({ studentId: sid })).toBe(0);
    expect(await Lead.findById(lead._id).lean()).toMatchObject({ studentId: null, stage: "CONVERTED" });
  });

  it("re-rates the month when a verified later deposit is deleted", async () => {
    const boss = await person("super_admin");
    const exec = await person("sales_executive");
    const lead = new Types.ObjectId();
    const project = new Types.ObjectId();
    const later = (amountMinor: number, pct: string) => ({
      leadId: lead,
      projectId: project,
      creditedToId: new Types.ObjectId(exec.id),
      loggedById: new Types.ObjectId(exec.id),
      sequence: "LATER" as const,
      amountMinor,
      currency: "USD",
      depositedAt: new Date("2026-10-02T00:00:00Z"),
      status: "VERIFIED" as const,
      commissionPct: pct,
      commissionMinor: 0,
      slabBaseMinor: 0,
    });
    const [big, small] = await LeadDeposit.create([later(900_000, "0.05"), later(200_000, "0.05")]);
    await remove("deposit", String(big!._id), boss.actor);
    const left = (await LeadDeposit.findById(small!._id).lean())!;
    expect(left.slabBaseMinor).toBe(200_000);
    expect(await LeadDeposit.exists({ _id: big!._id })).toBeNull();
  });

  it("gives approved leave back to the balance, but not on a closed month", async () => {
    const hr = await person("hr_manager");
    const boss = await person("super_admin");
    const p = await person("employee");
    await saveEmployee(p.id, { joinedOn: "2020-01-15" }, hr.actor);
    await LeaveLedger.create([
      { employeeId: new Types.ObjectId(p.id), typeKey: "annual", leaveYear: 2026, kind: "ADJUSTMENT", centiDays: 1000 },
    ]);
    const balance = async () => (await myLeave(p.id)).balances.find((b) => b.typeKey === "annual")!.balanceCenti;
    const id = await applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-12", toDay: "2026-10-13" }, p.actor);
    await approveLeave(id, {}, hr.actor);
    expect(await balance()).toBe(800);
    expect(await AttendanceDay.countDocuments({ leaveRequestId: id })).toBe(2);
    await remove("leave", id, boss.actor);
    expect(await balance()).toBe(1000);
    expect(await AttendanceDay.countDocuments({ leaveRequestId: id })).toBe(0);
    expect(await LeaveRequest.exists({ _id: id })).toBeNull();

    const old = await applyLeave(p.id, { typeKey: "annual", fromDay: "2026-10-14", toDay: "2026-10-14" }, p.actor);
    await PayrollMonth.create([{ month: "2026-10", status: "CLOSED", startedById: new Types.ObjectId(hr.id) }]);
    expect(messages(await check("leave", old, boss.actor))).toEqual(["October 2026 is closed. Cancel the leave instead"]);
  });

  it("discards a draft salary month but never a closed one, and keeps pay figures out of the audit log", async () => {
    const hr = await person("hr_manager");
    const boss = await person("super_admin");
    const p = await person("employee");
    await saveEmployee(p.id, { joinedOn: "2020-01-15" }, hr.actor);
    await savePay(p.id, { fromMonth: "2026-01", currency: "AED", base: "3000", allowances: [] }, boss.actor);
    await startMonth("2026-09", hr.actor);
    expect((await check("payrollMonth", "2026-09", boss.actor)).removes).toEqual(["1 payslip"]);
    await remove("payrollMonth", "2026-09", boss.actor);
    expect(await PayrollMonth.exists({ month: "2026-09" })).toBeNull();
    expect(await Payslip.countDocuments({ month: "2026-09" })).toBe(0);

    await PayrollMonth.create([{ month: "2026-08", status: "CLOSED", startedById: new Types.ObjectId(hr.id) }]);
    expect(messages(await check("payrollMonth", "2026-08", boss.actor))).toHaveLength(1);
    // The pay revision was used by the closed month; the HR record has none closed yet but deleting pay is blocked.
    const rev = (await EmployeePay.findOne({ employeeId: p.id }).lean())!;
    expect(messages(await check("payRevision", String(rev._id), boss.actor))[0]).toMatch(/^Closed salary months/);
    await Payslip.create({ month: "2026-08", employeeId: new Types.ObjectId(p.id), closedAt: new Date() });
    expect(messages(await check("employee", p.id, boss.actor))[0]).toMatch(/closed salary month \(August 2026\)/);

    await Payslip.deleteMany({});
    await PayrollMonth.deleteMany({});
    await remove("employee", p.id, boss.actor);
    expect(await Employee.exists({ _id: p.id })).toBeNull();
    const audit = (await AuditLog.findOne({ action: "hr.employee.delete" }).lean())!;
    expect(JSON.stringify(audit.before)).not.toContain("300000");
  });

  it("holds back a Meet recording while it can still be fetched again", async () => {
    const boss = await person("super_admin");
    const batch = await createBatch();
    const [cls] = await ClassSession.create([
      {
        batchId: batch._id,
        title: "Week 1",
        startsAt: new Date("2026-10-05T14:00:00Z"),
        endsAt: new Date("2026-10-05T15:00:00Z"),
        hostId: new Types.ObjectId(boss.id),
        createdById: new Types.ObjectId(boss.id),
        status: "COMPLETED",
      },
    ]);
    const [rec] = await Recording.create([
      { batchId: batch._id, classSessionId: cls!._id, title: "Week 1", source: "MEET_AUTO", driveFileId: "drive-1" },
    ]);
    expect(messages(await check("recording", String(rec!._id), boss.actor))[0]).toMatch(/^Meet recordings are fetched again for 48 hours/);
    freezeClock("2026-10-08T06:00:00Z");
    await remove("recording", String(rec!._id), boss.actor);
    // The class can go too; nothing else is tied to it.
    await remove("class", String(cls!._id), boss.actor);
    expect(await ClassSession.exists({ _id: cls!._id })).toBeNull();
  });

  it("keeps a batch new students join and a course with batches", async () => {
    const boss = await person("super_admin");
    const batch = await createBatch({ current: true });
    expect(messages(await check("batch", String(batch._id), boss.actor))).toContain(
      "New students join this batch. Make another batch current first",
    );
    expect(messages(await check("course", String(batch.courseId), boss.actor))).toEqual(["1 batch. Delete it first"]);
    await Project.create({ name: "Cohort", code: "COHORT", batchId: batch._id });
    await Enrollment.deleteMany({});
    await (await import("@edge/db")).Batch.updateOne({ _id: batch._id }, { $set: { isCurrentForEnrollment: false } });
    await remove("batch", String(batch._id), boss.actor);
    expect((await Project.findOne({ code: "COHORT" }).lean())!.batchId).toBeNull();
  });
});
