import {
  AttendanceDay,
  AuthUser,
  Employee,
  EmployeePay,
  FileAsset,
  HrRequest,
  LeaveLedger,
  LeaveRequest,
  lockForUpdate,
  PayrollMonth,
  Payslip,
  SalaryAdvance,
  WorkUpdate,
  type EmployeeDoc,
  type EmployeePayDoc,
  type HrRequestDoc,
  type LeaveRequestDoc,
  type PayrollMonthDoc,
  type SalaryAdvanceDoc,
  type Types,
  type WorkUpdateDoc,
} from "@edge/db";
import { formatDate } from "@edge/domain/dates";
import { formatMonth, isMonth, monthOf, type Month } from "@edge/domain/hr/calendar";
import { NotFoundError } from "../errors";
import { oid } from "../ids";
import { auditDelete, consoleUrl, deleter, dropFiles, gather, PAY_FIELDS, Plan, plural, snapshot, unlinkFiles } from "../records/kit";
import { assertMonthOpen, closedMonthsIn, draftMonth, lastClosedMonth, lockDraftMonth } from "./common";

const nameOf = async (id: Types.ObjectId) => (await AuthUser.findById(id, { name: 1 }).lean())?.name ?? "Deleted user";
const REFRESH = "Refresh the salary month in progress so its payslips catch up.";

/** An HR request with its attachment and HR's reply file. */
export const hrRequestDeleter = deleter<HrRequestDoc>({
  load: async (id) => {
    const r = await HrRequest.findById(oid(id, "Request")).lean();
    if (!r) throw new NotFoundError("Request");
    return r as HrRequestDoc;
  },
  plan: async (r) => {
    const p = new Plan(`the request "${r.subject}"`);
    p.remove([r.attachmentId, r.replyFileId].filter(Boolean).length, "attached file");
    return p;
  },
  apply: async (r, actor) => {
    await HrRequest.deleteOne({ _id: r._id });
    await unlinkFiles([r.attachmentId, r.replyFileId]);
    await auditDelete({ actor, action: "hr.request.delete", entityType: "HrRequest", entityId: String(r._id), before: snapshot(r) });
  },
  after: (r) => dropFiles([r.attachmentId, r.replyFileId]),
  done: () => "Request deleted.",
});

/** One person's work update for one day (they can clear their own; this is for anyone's). */
export const workUpdateDeleter = deleter<WorkUpdateDoc & { name: string }>({
  load: async (id) => {
    const u = await WorkUpdate.findById(oid(id, "Work update")).lean();
    if (!u) throw new NotFoundError("Work update");
    const user = await AuthUser.findById(u.userId, { name: 1 }).lean();
    return { ...(u as WorkUpdateDoc), name: user?.name ?? "Deleted user" };
  },
  plan: async (u) => new Plan(`${u.name}'s work update for ${formatDate(u.day, "UTC")}`),
  apply: async (u, actor) => {
    await WorkUpdate.deleteOne({ _id: u._id });
    await auditDelete({ actor, action: "hr.workUpdate.delete", entityType: "WorkUpdate", entityId: String(u._id), before: snapshot(u) });
  },
  done: () => "Work update deleted.",
});

interface EmployeeRecord {
  employee: EmployeeDoc;
  name: string;
}

/**
 * Someone's HR record and everything under it: pay, attendance, leave, requests, open advances, draft payslips and
 * documents. Their login stays. Anyone already on a closed salary month keeps their record: set a leaving date.
 */
export const employeeDeleter = deleter<EmployeeRecord>({
  load: async (id) => {
    const employee = (await Employee.findById(oid(id, "Employee")).lean()) as EmployeeDoc | null;
    if (!employee) throw new NotFoundError("Employee");
    return { employee, name: await nameOf(employee._id) };
  },
  plan: async ({ employee: e, name }) => {
    const p = new Plan(`${name}'s HR record`);
    const id = e._id;
    const [closedSlip, activeAdvances, pay, attendance, leave, ledger, requests, advances, drafts, docs] = await gather([
      () =>
        Payslip.findOne({ employeeId: id, closedAt: { $ne: null } }, { month: 1 })
          .sort({ month: -1 })
          .lean(),
      () => SalaryAdvance.countDocuments({ employeeId: id, status: { $in: ["APPROVED", "REPAID"] } }),
      () => EmployeePay.countDocuments({ employeeId: id }),
      () => AttendanceDay.countDocuments({ employeeId: id }),
      () => LeaveRequest.countDocuments({ employeeId: id }),
      () => LeaveLedger.countDocuments({ employeeId: id }),
      () => HrRequest.countDocuments({ employeeId: id }),
      () => SalaryAdvance.countDocuments({ employeeId: id }),
      () => Payslip.countDocuments({ employeeId: id, closedAt: null }),
      () => FileAsset.countDocuments({ linkedType: "EmployeeDocument", linkedId: id }),
    ] as const);
    if (closedSlip) p.block(`They're on a closed salary month (${formatMonth(closedSlip.month as Month)}). Set a leaving date instead`);
    p.blockIf(activeAdvances, "salary advance approved or repaid", "salary advances approved or repaid", consoleUrl("/staff/hr/advances"));
    p.remove(pay, "pay revision")
      .remove(attendance, "attendance day")
      .remove(leave, "leave request")
      .remove(ledger, "leave balance entry", "leave balance entries")
      .remove(requests, "HR request")
      .remove(advances, "salary advance request")
      .remove(drafts, "draft payslip")
      .remove(docs, "document");
    p.warn("Their sign-in and staff account stay. Remove those from Staff & roles.");
    return p;
  },
  apply: async ({ employee: e }, actor) => {
    const id = e._id;
    await lockDraftMonth();
    await lockForUpdate(Employee, { _id: id });
    const [leave, requests, docs] = await gather([
      () => LeaveRequest.find({ employeeId: id }, { attachmentId: 1 }).lean(),
      () => HrRequest.find({ employeeId: id }, { attachmentId: 1, replyFileId: 1 }).lean(),
      () => FileAsset.find({ linkedType: "EmployeeDocument", linkedId: id }, { _id: 1 }).lean(),
    ] as const);
    await unlinkFiles([
      ...leave.map((l) => l.attachmentId),
      ...requests.flatMap((r) => [r.attachmentId, r.replyFileId]),
      ...docs.map((d) => d._id),
    ]);
    await EmployeePay.deleteMany({ employeeId: id });
    await AttendanceDay.deleteMany({ employeeId: id });
    await LeaveLedger.deleteMany({ employeeId: id });
    await LeaveRequest.deleteMany({ employeeId: id });
    await HrRequest.deleteMany({ employeeId: id });
    await SalaryAdvance.deleteMany({ employeeId: id });
    await Payslip.deleteMany({ employeeId: id, closedAt: null });
    await Employee.deleteOne({ _id: id });
    await auditDelete({
      actor,
      action: "hr.employee.delete",
      entityType: "Employee",
      entityId: String(id),
      before: snapshot(e, PAY_FIELDS),
    });
  },
  after: async ({ employee: e }) => {
    const files = await FileAsset.find({ ownerId: e._id, linkedAt: null }, { _id: 1 }).lean();
    await dropFiles(files.map((f) => f._id));
  },
  done: ({ name }) => `${name}'s HR record deleted.`,
});

/** A pay revision that no closed salary month has used yet. */
export const payRevisionDeleter = deleter<EmployeePayDoc & { name: string }>({
  load: async (id) => {
    const r = (await EmployeePay.findById(oid(id, "Pay revision")).lean()) as EmployeePayDoc | null;
    if (!r) throw new NotFoundError("Pay revision");
    return { ...r, name: await nameOf(r.employeeId) };
  },
  plan: async (r) => {
    const p = new Plan(`${r.name}'s pay from ${formatMonth(r.fromMonth as Month)}`);
    const closed = await lastClosedMonth();
    if (closed && r.fromMonth <= closed) p.block(`Closed salary months up to ${formatMonth(closed)} were paid with it`);
    const draft = await draftMonth();
    if (draft && r.fromMonth <= draft.month) p.warn(REFRESH);
    return p;
  },
  apply: async (r, actor) => {
    await lockDraftMonth();
    await EmployeePay.deleteOne({ _id: r._id });
    await auditDelete({
      actor,
      action: "hr.pay.delete",
      entityType: "EmployeePay",
      entityId: String(r._id),
      before: snapshot(r, PAY_FIELDS),
    });
  },
  done: () => "Pay revision deleted.",
});

const monthsOf = (r: Pick<LeaveRequestDoc, "days" | "fromDay" | "toDay">) =>
  [...new Set((r.days.length ? r.days.map((d) => d.day) : [r.fromDay, r.toDay]).map(monthOf))].sort();

/**
 * A leave request. Approved leave also loses its attendance marks and balance entries, so the days come back to the
 * balance. Leave on a closed salary month stays (cancel it instead).
 */
export const leaveDeleter = deleter<LeaveRequestDoc & { name: string }>({
  load: async (id) => {
    const r = (await LeaveRequest.findById(oid(id, "Leave request")).lean()) as LeaveRequestDoc | null;
    if (!r) throw new NotFoundError("Leave request");
    return { ...r, name: await nameOf(r.employeeId) };
  },
  plan: async (r) => {
    const p = new Plan(`${r.name}'s ${r.typeName.toLowerCase()} (${formatDate(r.fromDay, "UTC")})`);
    const closed = await closedMonthsIn(monthsOf(r));
    if (closed.length)
      p.block(
        `${closed.map((m) => formatMonth(m as Month)).join(", ")} ${closed.length === 1 ? "is" : "are"} closed. Cancel the leave instead`,
      );
    const [marks, ledger] = await gather([
      () => AttendanceDay.countDocuments({ leaveRequestId: r._id }),
      () => LeaveLedger.countDocuments({ leaveRequestId: r._id }),
    ] as const);
    p.remove(marks, "attendance mark");
    if (ledger) p.removes.push("Its leave balance entries (the days go back to the balance)");
    if (r.attachmentId) p.remove(1, "attached file");
    if (r.status === "APPROVED" && (await draftMonth())) p.warn(REFRESH);
    return p;
  },
  apply: async (r, actor) => {
    await lockForUpdate(Employee, { _id: r.employeeId });
    for (const m of monthsOf(r)) await assertMonthOpen(m as Month);
    await AttendanceDay.deleteMany({ leaveRequestId: r._id });
    await LeaveLedger.deleteMany({ leaveRequestId: r._id });
    await LeaveRequest.deleteOne({ _id: r._id });
    await unlinkFiles([r.attachmentId]);
    const { name: _name, ...doc } = r;
    await auditDelete({ actor, action: "hr.leave.delete", entityType: "LeaveRequest", entityId: String(r._id), before: snapshot(doc) });
  },
  after: (r) => dropFiles([r.attachmentId]),
  done: () => "Leave request deleted.",
});

/** An advance nothing has been repaid on yet. An approved one that's deleted is simply no longer owed. */
export const advanceDeleter = deleter<SalaryAdvanceDoc & { name: string }>({
  load: async (id) => {
    const a = (await SalaryAdvance.findById(oid(id, "Advance")).lean()) as SalaryAdvanceDoc | null;
    if (!a) throw new NotFoundError("Advance");
    return { ...a, name: await nameOf(a.employeeId) };
  },
  plan: async (a) => {
    const p = new Plan(`${a.name}'s salary advance`);
    const deducted = a.installments.filter((i) => i.status === "DEDUCTED").length;
    if (a.status === "REPAID" || deducted) p.block("Part of it was repaid through closed salary months");
    if (a.status === "APPROVED" && !deducted) {
      p.warn(`It was paid out${a.paidOn ? ` on ${formatDate(a.paidOn, "UTC")}` : ""}. Once deleted, nothing more is deducted for it.`);
      if (await draftMonth()) p.warn(REFRESH);
    }
    return p;
  },
  apply: async (a, actor) => {
    await lockDraftMonth();
    await SalaryAdvance.deleteOne({ _id: a._id });
    const { name: _name, ...doc } = a;
    await auditDelete({
      actor,
      action: "hr.advance.delete",
      entityType: "SalaryAdvance",
      entityId: String(a._id),
      before: snapshot(doc, PAY_FIELDS),
    });
  },
  done: () => "Advance deleted.",
});

/** The salary month in progress, discarded with its payslips. Closed months are final. Its id is the month, "2026-10". */
export const payrollMonthDeleter = deleter<PayrollMonthDoc>({
  load: async (id) => {
    if (!isMonth(id)) throw new NotFoundError("Salary month");
    const m = (await PayrollMonth.findOne({ month: id }).lean()) as PayrollMonthDoc | null;
    if (!m) throw new NotFoundError("Salary month");
    return m;
  },
  plan: async (m) => {
    const p = new Plan(`the ${formatMonth(m.month as Month)} salary month`);
    if (m.status === "CLOSED") p.block("Closed months are final: later commission differences are worked out from them");
    const slips = await Payslip.find({ month: m.month }, { lines: 1 }).lean();
    p.remove(slips.length, "payslip");
    const manual = slips.reduce((n, s) => n + s.lines.filter((l) => l.source === "MANUAL").length, 0);
    if (manual) p.warn(`${plural(manual, "line added by hand is", "lines added by hand are")} lost.`);
    return p;
  },
  apply: async (m, actor) => {
    await lockForUpdate(PayrollMonth, { _id: m._id, status: "DRAFT" });
    await Payslip.deleteMany({ month: m.month });
    await PayrollMonth.deleteOne({ _id: m._id });
    await auditDelete({ actor, action: "hr.payroll.delete", entityType: "PayrollMonth", entityId: m.month, before: snapshot(m) });
  },
  done: (m) => `${formatMonth(m.month as Month)} discarded.`,
});
