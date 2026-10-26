import { adminRoutes, catalogRoutes, enrollmentRoutes, settingsRoutes, staffRoutes } from "@edge/contracts";
import {
  approveEnrollment,
  assignStudentToBatch,
  changeBatch,
  countPendingApprovals,
  createStaff,
  extendDueDate,
  getBatch,
  getDashboard,
  getSettingsDto,
  getStaff,
  getStudentDetail,
  listApprovals,
  listAudit,
  listBalances,
  listBatches,
  listCourses,
  listMentors,
  listRoles,
  listStaff,
  listStudents,
  lockEnrollment,
  rejectEnrollment,
  setStudentCountry,
  resetStaffPassword,
  saveBatch,
  saveCourse,
  saveFeeRate,
  saveFreeClassSettings,
  saveGeneralSettings,
  saveOdooMapping,
  saveRole,
  setStaffDisabled,
  studentsCsv,
  unlockEnrollment,
  updateStaff,
} from "@edge/services";
import { Router } from "express";
import { actorOf, requirePermission, requireViewer } from "../http/guards";
import { register } from "../http/route";
import { ApiError } from "@edge/contracts";
import { can } from "@edge/services";

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

export function adminRouter() {
  const r = Router();

  register(r, adminRoutes.dashboard, async (req) => (requirePermission(req, "admin.access"), getDashboard()));
  register(
    r,
    adminRoutes.pendingApprovals,
    async (req) => (requirePermission(req, "admin.access"), { count: await countPendingApprovals() }),
  );
  register(r, adminRoutes.students, async (req) => (requirePermission(req, "student.read"), listStudents(req.valid.query)));
  register(r, adminRoutes.studentsCsv, async (req, res) => {
    requirePermission(req, "student.read");
    const csv = await studentsCsv(req.valid.query);
    res.setHeader("content-type", "text/csv; charset=utf-8");
    res.setHeader("content-disposition", `attachment; filename="students-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(`\uFEFF${csv}`); // BOM so Excel opens UTF-8 correctly
  });
  register(r, adminRoutes.student, async (req) => (requirePermission(req, "student.read"), getStudentDetail(req.valid.params.id)));
  register(r, adminRoutes.setStudentCountry, async (req) => {
    const v = requirePermission(req, "student.update");
    await setStudentCountry(req.valid.params.id, req.valid.body.country, actorOf(v));
    return { ok: true as const, message: "Country updated." };
  });
  register(r, adminRoutes.approvals, async (req) => (requirePermission(req, "enrollment.approve"), listApprovals(req.valid.query)));
  register(r, adminRoutes.balances, async (req) => (requirePermission(req, "enrollment.read"), listBalances(req.valid.query)));
  register(r, adminRoutes.audit, async (req) => (requirePermission(req, "audit.read"), listAudit(req.valid.query)));

  // Enrollment actions
  register(r, enrollmentRoutes.approve, async (req) => {
    await approveEnrollment(req.valid.params.id, actorOf(requirePermission(req, "enrollment.approve")));
    return { ok: true as const, message: "Approved. The student has been emailed." };
  });
  register(r, enrollmentRoutes.reject, async (req) => {
    await rejectEnrollment(req.valid.params.id, actorOf(requirePermission(req, "enrollment.approve")), req.valid.body.reason);
    return { ok: true as const, message: "Rejected. The student has been emailed." };
  });
  register(r, enrollmentRoutes.lock, async (req) => {
    await lockEnrollment(req.valid.params.id, actorOf(requirePermission(req, "enrollment.lock")), req.valid.body.note);
    return { ok: true as const, message: "Access locked." };
  });
  register(r, enrollmentRoutes.unlock, async (req) => {
    const d = req.valid.body.newDueDate;
    await unlockEnrollment(req.valid.params.id, actorOf(requirePermission(req, "enrollment.lock")), d ? day(d) : undefined);
    return { ok: true as const, message: "Access restored." };
  });
  register(r, enrollmentRoutes.extendDue, async (req) => {
    await extendDueDate(req.valid.params.id, actorOf(requirePermission(req, "enrollment.editTerms")), day(req.valid.body.newDueDate));
    return { ok: true as const, message: "Due date updated." };
  });
  register(r, enrollmentRoutes.changeBatch, async (req) => {
    await changeBatch(req.valid.params.id, actorOf(requirePermission(req, "enrollment.assignBatch")), req.valid.body.batchId);
    return { ok: true as const, message: "Batch changed." };
  });
  register(r, enrollmentRoutes.assignBatch, async (req) => {
    await assignStudentToBatch(req.valid.params.id, req.valid.body.batchId, actorOf(requirePermission(req, "enrollment.assignBatch")));
    return { ok: true as const, message: "Student assigned to batch." };
  });

  // Catalog
  register(r, catalogRoutes.listCourses, async (req) => (requirePermission(req, "catalog.manage"), listCourses()));
  register(r, catalogRoutes.listBatches, async (req) => (requirePermission(req, "admin.access"), listBatches()));
  register(r, catalogRoutes.getBatch, async (req) => (requirePermission(req, "catalog.manage"), getBatch(req.valid.params.id)));
  register(r, catalogRoutes.listMentors, async (req) => (requirePermission(req, "admin.access"), listMentors()));
  register(r, catalogRoutes.saveCourse, async (req) => {
    const v = requirePermission(req, "catalog.manage");
    const { id, ...input } = req.valid.body;
    return { id: await saveCourse(id ?? null, input, actorOf(v)) };
  });
  register(r, catalogRoutes.saveBatch, async (req) => {
    const v = requirePermission(req, "catalog.manage");
    const { id, ...input } = req.valid.body as typeof req.valid.body & { id?: string };
    return { id: await saveBatch(id ?? null, input as never, actorOf(v)) };
  });

  // Staff & roles
  register(r, staffRoutes.list, async (req) => (requirePermission(req, "staff.manage"), listStaff()));
  register(r, staffRoutes.get, async (req) => (requirePermission(req, "staff.manage"), getStaff(req.valid.params.id)));
  register(r, staffRoutes.create, async (req) => {
    const v = requirePermission(req, "staff.manage");
    const b = req.valid.body;
    return createStaff({ ...b, workspaceEmail: b.workspaceEmail || undefined }, actorOf(v));
  });
  register(r, staffRoutes.update, async (req) => {
    const v = requirePermission(req, "staff.manage");
    const b = req.valid.body;
    await updateStaff(req.valid.params.id, { ...b, workspaceEmail: b.workspaceEmail || undefined }, actorOf(v));
    return { ok: true as const, message: "Saved." };
  });
  register(r, staffRoutes.setDisabled, async (req) => {
    await setStaffDisabled(req.valid.params.id, req.valid.body.disabled, actorOf(requirePermission(req, "staff.manage")));
    return { ok: true as const, message: req.valid.body.disabled ? "Account disabled and signed out." : "Account enabled." };
  });
  register(r, staffRoutes.resetPassword, async (req) => ({
    ok: true as const,
    tempPassword: await resetStaffPassword(req.valid.params.id, actorOf(requirePermission(req, "staff.manage"))),
  }));
  register(r, staffRoutes.roles, async (req) => (requirePermission(req, "staff.manage"), listRoles()));
  register(r, staffRoutes.saveRole, async (req) => ({
    id: await saveRole(req.valid.body, actorOf(requirePermission(req, "roles.manage"))),
  }));

  // Settings
  register(r, settingsRoutes.get, async (req) => {
    const v = requireViewer(req);
    if (!can(v.permissions, "settings.fees") && !can(v.permissions, "settings.integrations"))
      throw new ApiError(403, "FORBIDDEN", "You do not have permission to view settings.");
    requirePermission(req, "admin.access");
    return getSettingsDto();
  });
  register(r, settingsRoutes.saveFeeRate, async (req) => {
    await saveFeeRate(req.valid.body, actorOf(requirePermission(req, "settings.fees")));
    return { ok: true as const, message: `${req.valid.body.label} saved.` };
  });
  register(r, settingsRoutes.saveGeneral, async (req) => {
    await saveGeneralSettings(req.valid.body, actorOf(requirePermission(req, "settings.fees")));
    return { ok: true as const, message: "Settings saved." };
  });
  register(r, settingsRoutes.saveFreeClass, async (req) => {
    await saveFreeClassSettings(req.valid.body, actorOf(requirePermission(req, "settings.fees")));
    return { ok: true as const, message: "Free class saved." };
  });
  register(r, settingsRoutes.saveOdoo, async (req) => {
    await saveOdooMapping(req.valid.body, actorOf(requirePermission(req, "settings.integrations")));
    return { ok: true as const, message: "Odoo mapping saved." };
  });

  return r;
}
