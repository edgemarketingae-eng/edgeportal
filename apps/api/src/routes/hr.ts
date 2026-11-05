import { hrRoutes } from "@edge/contracts";
import type { Permission } from "@edge/domain/auth/permissions";
import {
  addManualLine,
  adjustBalance,
  applyLeave,
  approveAdvance,
  approveLeave,
  attendanceMonth,
  attendanceSheet,
  cancelLeave,
  cancelMyAdvance,
  cancelMyLeave,
  claimEmployeeDocument,
  closeMonth,
  createHrRequest,
  employeeLeave,
  fileLeaveFor,
  getHrSettings,
  getPayRevisions,
  getPayrollMonth,
  getTeamMember,
  hrHome,
  listAdvances,
  listHrRequests,
  listLeaveRequests,
  listPayrollMonths,
  listTeam,
  markAttendance,
  myAdvances,
  myAttendance,
  myLeave,
  myPayslip,
  myPayslips,
  myRequests,
  myWorkUpdates,
  personWorkUpdates,
  refreshMonth,
  rejectAdvance,
  rejectLeave,
  removeEmployeeDocument,
  removeManualLine,
  replyHrRequest,
  requestAdvance,
  rescheduleAdvance,
  saveEmployee,
  saveHrSettings,
  savePay,
  saveWorkUpdate,
  startMonth,
  workUpdatesDay,
} from "@edge/services";
import { Router, type Request } from "express";
import { actorOf, requirePermission, requireStaffUser } from "../http/guards";
import { register } from "../http/route";

const ok = (message: string) => ({ ok: true as const, message });

/** The viewer's own HR data: any staff account, whatever its roles. */
function self(req: Request) {
  const v = requireStaffUser(req);
  return { v, actor: actorOf(v), userId: v.userId };
}

function hr(req: Request, perm: Permission) {
  return actorOf(requirePermission(req, perm));
}

export function hrRouter() {
  const r = Router();

  register(r, hrRoutes.home, async (req) => {
    const { v, userId } = self(req);
    return hrHome(userId, { manage: v.permissions.has("hr.manage"), payroll: v.permissions.has("hr.payroll") });
  });

  // Work updates: anyone with a staff account writes their own, without an HR record; HR reads everyone's.
  register(r, hrRoutes.myUpdates, async (req) => myWorkUpdates(self(req).userId, req.valid.query.day));
  register(r, hrRoutes.saveMyUpdate, async (req) => {
    const { cleared } = await saveWorkUpdate(self(req).userId, req.valid.body);
    return ok(cleared ? "Update cleared." : "Update saved.");
  });
  register(r, hrRoutes.updatesDay, async (req) => (hr(req, "hr.manage"), workUpdatesDay(req.valid.query.day)));
  register(r, hrRoutes.personUpdates, async (req) => (hr(req, "hr.manage"), personWorkUpdates(req.valid.params.id, req.valid.query)));

  register(r, hrRoutes.team, async (req) => (hr(req, "hr.manage"), listTeam()));
  register(r, hrRoutes.member, async (req) => (hr(req, "hr.manage"), getTeamMember(req.valid.params.id)));
  register(r, hrRoutes.saveEmployee, async (req) => {
    await saveEmployee(req.valid.params.id, req.valid.body, hr(req, "hr.manage"));
    return ok("Saved.");
  });
  register(r, hrRoutes.pay, async (req) => (hr(req, "hr.payroll"), getPayRevisions(req.valid.params.id)));
  register(r, hrRoutes.savePay, async (req) => {
    await savePay(req.valid.params.id, req.valid.body, hr(req, "hr.payroll"));
    return ok("Pay saved.");
  });
  register(r, hrRoutes.memberLeave, async (req) => (hr(req, "hr.manage"), employeeLeave(req.valid.params.id)));
  register(r, hrRoutes.adjustBalance, async (req) => {
    await adjustBalance(req.valid.params.id, req.valid.body, hr(req, "hr.manage"));
    return ok("Balance adjusted.");
  });
  register(r, hrRoutes.addDocument, async (req) => {
    await claimEmployeeDocument(req.valid.params.id, req.valid.body.fileId, hr(req, "hr.manage"));
    return ok("Document added.");
  });
  register(r, hrRoutes.removeDocument, async (req) => {
    await removeEmployeeDocument(req.valid.params.id, req.valid.params.fileId, hr(req, "hr.manage"));
    return ok("Document removed.");
  });

  register(r, hrRoutes.myAttendance, async (req) => myAttendance(self(req).userId, req.valid.query.month));
  register(r, hrRoutes.attendanceDay, async (req) => (hr(req, "hr.manage"), attendanceSheet(req.valid.query.day)));
  register(r, hrRoutes.attendanceMonth, async (req) => (hr(req, "hr.manage"), attendanceMonth(req.valid.query.month)));
  register(r, hrRoutes.markAttendance, async (req) => {
    await markAttendance(req.valid.body, hr(req, "hr.manage"));
    return ok("Attendance saved.");
  });

  register(r, hrRoutes.myLeave, async (req) => myLeave(self(req).userId));
  register(r, hrRoutes.applyLeave, async (req) => {
    const { actor, userId } = self(req);
    return { id: await applyLeave(userId, req.valid.body, actor) };
  });
  register(r, hrRoutes.cancelMyLeave, async (req) => {
    const { actor, userId } = self(req);
    await cancelMyLeave(req.valid.params.id, userId, actor);
    return ok("Leave request withdrawn.");
  });
  register(r, hrRoutes.leaveRequests, async (req) => (hr(req, "hr.manage"), listLeaveRequests(req.valid.query)));
  register(r, hrRoutes.fileLeave, async (req) => ({ id: await fileLeaveFor(req.valid.params.id, req.valid.body, hr(req, "hr.manage")) }));
  register(r, hrRoutes.approveLeave, async (req) => {
    await approveLeave(req.valid.params.id, req.valid.body, hr(req, "hr.manage"));
    return ok("Leave approved.");
  });
  register(r, hrRoutes.rejectLeave, async (req) => {
    await rejectLeave(req.valid.params.id, req.valid.body, hr(req, "hr.manage"));
    return ok("Leave rejected.");
  });
  register(r, hrRoutes.cancelLeave, async (req) => {
    const { returned, frozen } = await cancelLeave(req.valid.params.id, req.valid.body, hr(req, "hr.manage"));
    return ok(
      frozen ? `Leave cancelled. ${returned / 100} days returned; ${frozen / 100} stay because their month is closed.` : "Leave cancelled.",
    );
  });

  register(r, hrRoutes.myRequests, async (req) => myRequests(self(req).userId));
  register(r, hrRoutes.createRequest, async (req) => {
    const { actor, userId } = self(req);
    return { id: await createHrRequest(userId, req.valid.body, actor) };
  });
  register(r, hrRoutes.requests, async (req) => (hr(req, "hr.manage"), listHrRequests(req.valid.query)));
  register(r, hrRoutes.replyRequest, async (req) => {
    await replyHrRequest(req.valid.params.id, req.valid.body, hr(req, "hr.manage"));
    return ok("Saved.");
  });

  register(r, hrRoutes.myAdvances, async (req) => myAdvances(self(req).userId));
  register(r, hrRoutes.requestAdvance, async (req) => {
    const { actor, userId } = self(req);
    return { id: await requestAdvance(userId, req.valid.body, actor) };
  });
  register(r, hrRoutes.cancelMyAdvance, async (req) => {
    const { actor, userId } = self(req);
    await cancelMyAdvance(req.valid.params.id, userId, actor);
    return ok("Request withdrawn.");
  });
  register(r, hrRoutes.advances, async (req) => (hr(req, "hr.payroll"), listAdvances(req.valid.query)));
  register(r, hrRoutes.approveAdvance, async (req) => {
    await approveAdvance(req.valid.params.id, req.valid.body, hr(req, "hr.payroll"));
    return ok("Advance approved.");
  });
  register(r, hrRoutes.rejectAdvance, async (req) => {
    await rejectAdvance(req.valid.params.id, req.valid.body, hr(req, "hr.payroll"));
    return ok("Advance rejected.");
  });
  register(r, hrRoutes.rescheduleAdvance, async (req) => {
    await rescheduleAdvance(req.valid.params.id, req.valid.body, hr(req, "hr.payroll"));
    return ok("Repayment updated.");
  });

  register(r, hrRoutes.myPayslips, async (req) => myPayslips(self(req).userId));
  register(r, hrRoutes.myPayslip, async (req) => myPayslip(self(req).userId, req.valid.params.month));
  register(r, hrRoutes.payrollMonths, async (req) => (hr(req, "hr.payroll"), listPayrollMonths()));
  register(r, hrRoutes.startMonth, async (req) => {
    await startMonth(req.valid.body.month, hr(req, "hr.payroll"));
    return ok("Month started.");
  });
  register(r, hrRoutes.payrollMonth, async (req) => (hr(req, "hr.payroll"), getPayrollMonth(req.valid.params.month)));
  register(r, hrRoutes.refreshMonth, async (req) => {
    const changed = await refreshMonth(req.valid.params.month, hr(req, "hr.payroll"));
    return ok(changed ? `Updated ${changed} payslip${changed === 1 ? "" : "s"}.` : "Already up to date.");
  });
  register(r, hrRoutes.closeMonth, async (req) => closeMonth(req.valid.params.month, hr(req, "hr.payroll")));
  register(r, hrRoutes.addLine, async (req) => {
    await addManualLine(req.valid.params.id, req.valid.body, hr(req, "hr.payroll"));
    return ok("Line added.");
  });
  register(r, hrRoutes.removeLine, async (req) => {
    await removeManualLine(req.valid.params.id, req.valid.params.lineId, hr(req, "hr.payroll"));
    return ok("Line removed.");
  });

  register(r, hrRoutes.settings, async (req) => (hr(req, "hr.settings"), getHrSettings()));
  register(r, hrRoutes.saveSettings, async (req) => {
    await saveHrSettings(req.valid.body, hr(req, "hr.settings"));
    return ok("HR settings saved.");
  });

  return r;
}
