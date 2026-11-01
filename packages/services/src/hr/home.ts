import type { HrHome } from "@edge/contracts";
import { Employee, HrRequest, LeaveRequest, Payslip, SalaryAdvance, StaffProfile, type EmployeeDoc, type PayslipDoc } from "@edge/db";
import { totalsByCurrency } from "@edge/domain/hr/pay";
import { oid } from "../ids";
import { myBalances } from "./leave";

const lineDto = (l: PayslipDoc["lines"][number]) => ({
  id: String(l._id),
  kind: l.kind,
  label: l.label,
  currency: l.currency,
  amountMinor: l.amountMinor,
  source: l.source,
  forMonth: l.forMonth ?? null,
});

/** The staff portal dashboard: the person's own numbers, plus HR's queues for those who can act on them. */
export async function hrHome(userId: string, can: { manage: boolean; payroll: boolean }): Promise<HrHome> {
  const _id = oid(userId);
  const e = (await Employee.findById(_id).lean()) as EmployeeDoc | null;
  const [balances, slip, pendingLeave, openRequests, repayingAdvances, queue] = await Promise.all([
    e ? myBalances(e) : [],
    Payslip.findOne({ employeeId: _id, closedAt: { $ne: null } })
      .sort({ month: -1 })
      .lean(),
    LeaveRequest.countDocuments({ employeeId: _id, status: "PENDING" }),
    HrRequest.countDocuments({ employeeId: _id, status: { $in: ["OPEN", "IN_PROGRESS"] } }),
    SalaryAdvance.countDocuments({ employeeId: _id, status: "APPROVED" }),
    can.manage || can.payroll ? queues(can) : null,
  ]);
  return {
    setUp: !!e,
    balances,
    latestPayslip: slip ? { month: slip.month, totals: totalsByCurrency(slip.lines), lines: slip.lines.map(lineDto) } : null,
    pendingLeave,
    openRequests,
    repayingAdvances,
    queue,
  };
}

async function queues(can: { manage: boolean; payroll: boolean }) {
  const [leave, requests, advances, staff, records] = await Promise.all([
    can.manage ? LeaveRequest.countDocuments({ status: "PENDING" }) : 0,
    can.manage ? HrRequest.countDocuments({ status: { $in: ["OPEN", "IN_PROGRESS"] } }) : 0,
    can.payroll ? SalaryAdvance.countDocuments({ status: "PENDING" }) : 0,
    can.manage ? StaffProfile.countDocuments() : 0,
    can.manage ? Employee.countDocuments() : 0,
  ]);
  return { leave, requests, advances, notSetUp: Math.max(0, staff - records) };
}
