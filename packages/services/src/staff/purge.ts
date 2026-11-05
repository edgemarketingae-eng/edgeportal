import {
  AttendanceDay,
  AuthAccount,
  AuthSession,
  AuthTwoFactor,
  AuthUser,
  AuthVerification,
  Batch,
  ClassSession,
  CrmDevice,
  CrmProduct,
  CrmTask,
  Employee,
  EmployeePay,
  Enrollment,
  FeeRate,
  FileAsset,
  HrRequest,
  InAppNotification,
  JoinLog,
  Lead,
  LeadCall,
  LeadConversion,
  LeadDeposit,
  LeaveLedger,
  LeaveRequest,
  Payment,
  PayrollMonth,
  Payslip,
  Project,
  RecordingView,
  Role,
  SalaryAdvance,
  Setting,
  StaffProfile,
  StudentProfile,
  TaskComment,
  WorkUpdate,
  type AuthUserDoc,
  type RoleDoc,
  type StaffProfileDoc,
  type Types,
} from "@edge/db";
import { invalidateRoleCache } from "../auth/viewer";
import { NotFoundError } from "../errors";
import { oid } from "../ids";
import { auditDelete, consoleUrl, crmUrl, deleter, gather, Plan, snapshot, type UserActor } from "../records/kit";
import { assertPureCrmUser } from "./crm-team";
import { isSuperAdmin } from "./service";

interface StaffRecord {
  _id: Types.ObjectId;
  user: AuthUserDoc;
  profile: StaffProfileDoc;
  roles: RoleDoc[];
  hasStudent: boolean;
}

async function loadStaff(id: string): Promise<StaffRecord> {
  const _id = oid(id, "Staff member");
  const [user, profile, hasStudent] = await gather([
    () => AuthUser.findById(_id).lean(),
    () => StaffProfile.findById(_id).lean(),
    () => StudentProfile.exists({ _id }),
  ] as const);
  if (!user || !profile) throw new NotFoundError("Staff member");
  const roles = await Role.find({ _id: { $in: profile.roleIds } }).lean();
  return { _id, user: user as AuthUserDoc, profile, roles: roles as RoleDoc[], hasStudent: !!hasStudent };
}

const either = (fields: string[], id: Types.ObjectId) => ({ $or: fields.map((f) => ({ [f]: id })) });
/** Records about someone else that this person acted on. */
const actedOn = (fields: string[], id: Types.ObjectId) => ({ ...either(fields, id), employeeId: { $ne: id } });

async function hasHrRecord(id: Types.ObjectId): Promise<boolean> {
  const found = await gather([
    () => Employee.exists({ _id: id }),
    () => Payslip.exists({ employeeId: id }),
    () => LeaveRequest.exists({ employeeId: id }),
    () => AttendanceDay.exists({ employeeId: id }),
  ] as const);
  return found.some(Boolean);
}

/** HR entries this person made about other people (attendance marked, leave decided, salary months run…). */
async function hrEntriesFor(id: Types.ObjectId): Promise<number> {
  const counts = await gather([
    () => EmployeePay.countDocuments(actedOn(["createdById"], id)),
    () => AttendanceDay.countDocuments(actedOn(["markedById"], id)),
    () => LeaveRequest.countDocuments(actedOn(["filedById", "decidedById"], id)),
    () => LeaveLedger.countDocuments(actedOn(["byId"], id)),
    () => HrRequest.countDocuments(actedOn(["handledById"], id)),
    () => SalaryAdvance.countDocuments(actedOn(["decidedById"], id)),
    () => PayrollMonth.countDocuments(either(["startedById", "closedById"], id)),
  ] as const);
  return counts.reduce((a, b) => a + b, 0);
}

/**
 * Only an account with nothing to its name can go: anything it owns or did stays attributed to it, so those block.
 * Sessions, phones, notifications and team places go with the account.
 */
async function staffPlan(s: StaffRecord, actor: UserActor, crm: boolean) {
  const id = s._id;
  const p = new Plan(s.user.name);
  const isSuper = s.roles.some((r) => r.key === "super_admin");
  if (String(id) === actor.id) p.block("You can't delete your own account");
  if (isSuper && !(await isSuperAdmin(actor.id))) p.block("Only a super admin can delete another super admin");
  if (isSuper) {
    const superRole = s.roles.find((r) => r.key === "super_admin")!;
    const others = await StaffProfile.find({ _id: { $ne: id }, roleIds: superRole._id }, { _id: 1 }).lean();
    const enabled = await AuthUser.countDocuments({ _id: { $in: others.map((o) => o._id) }, disabledAt: null });
    if (!enabled) p.block("They're the last super admin");
  }
  if (!s.user.disabledAt) p.block("Disable the account first, so nothing new reaches them while you delete it");

  const leadsHref = crmUrl(`/leads?owner=${id}&view=all`);
  const [
    leads,
    deposits,
    conversions,
    calls,
    tasks,
    comments,
    employee,
    hrActions,
    mentoring,
    classes,
    enrollments,
    payments,
    files,
    updates,
    projects,
  ] = await gather([
    () => Lead.countDocuments(either(["ownerId", "convertedById", "createdById"], id)),
    () => LeadDeposit.countDocuments(either(["creditedToId", "loggedById", "reviewedById"], id)),
    () => LeadConversion.countDocuments(either(["creditedToId", "convertedById"], id)),
    () => LeadCall.countDocuments({ userId: id }),
    () => CrmTask.countDocuments(either(["assigneeId", "createdById", "completedById"], id)),
    () => TaskComment.countDocuments({ authorId: id }),
    () => hasHrRecord(id),
    () => hrEntriesFor(id),
    () => Batch.countDocuments({ "mentors.userId": id }),
    () => ClassSession.countDocuments(either(["hostId", "createdById"], id)),
    () => Enrollment.countDocuments(either(["lockedById", "approvedById", "rejectedById"], id)),
    () => Payment.countDocuments({ recordedById: id }),
    () => FileAsset.countDocuments(either(["uploadedById", "ownerId"], id)),
    () => WorkUpdate.countDocuments({ userId: id }),
    () => Project.countDocuments(either(["managerIds", "memberIds"], id)),
  ] as const);
  p.blockIf(leads, "lead they own, converted or created", "leads they own, converted or created", leadsHref)
    .blockIf(deposits, "deposit", "deposits", crmUrl("/deposits"))
    .blockIf(conversions, "product conversion")
    .blockIf(calls, "logged call")
    .blockIf(tasks, "task", "tasks", crmUrl("/tasks"))
    .blockIf(comments, "task comment");
  if (employee) p.block("Their HR record (attendance, leave, salary)", crm ? null : consoleUrl(`/staff/hr/team/${id}`));
  p.blockIf(hrActions, "HR entry they made for others", "HR entries they made for others")
    .blockIf(mentoring, "batch they mentor", "batches they mentor")
    .blockIf(classes, "class they hosted or scheduled", "classes they hosted or scheduled")
    .blockIf(enrollments, "enrollment they approved, rejected or locked", "enrollments they approved, rejected or locked")
    .blockIf(payments, "payment they recorded", "payments they recorded")
    .blockIf(files, "file", "files")
    .blockIf(updates, "work update", "work updates");
  p.remove(projects, "project team place", "project team places");
  p.removes.push("Their sign-in, sessions, phones and notifications");
  if (s.hasStudent) p.warn("They also have a student account. It stays, and they can sign in to the student portal again.");
  return p;
}

async function applyStaffDelete(s: StaffRecord, actor: UserActor) {
  const id = s._id;
  // Sequential on purpose: one transaction runs one operation at a time.
  await AuthSession.deleteMany({ userId: id });
  await AuthTwoFactor.deleteMany({ userId: id });
  await AuthVerification.deleteMany({ value: String(id) });
  await CrmDevice.deleteMany({ userId: id });
  await InAppNotification.deleteMany({ userId: id });
  await JoinLog.deleteMany({ userId: id });
  await RecordingView.deleteMany({ userId: id });
  await Project.updateMany(either(["managerIds", "memberIds"], id), { $pull: { managerIds: id, memberIds: id } });
  await Project.updateMany({ roundRobinLastId: id }, { $set: { roundRobinLastId: null } });
  await Project.updateMany({ createdById: id }, { $set: { createdById: null } });
  await CrmProduct.updateMany({ createdById: id }, { $set: { createdById: null } });
  await Setting.updateMany({ updatedById: id }, { $set: { updatedById: null } });
  await FeeRate.updateMany({ updatedById: id }, { $set: { updatedById: null } });
  await StaffProfile.deleteOne({ _id: id });
  if (s.hasStudent) await AuthUser.updateOne({ _id: id }, { $set: { disabledAt: null } });
  else {
    await AuthAccount.deleteMany({ userId: id });
    await AuthUser.deleteOne({ _id: id });
  }
  const { tempPasswordEnc: _secret, ...profile } = s.profile;
  await auditDelete({
    actor,
    action: "staff.delete",
    entityType: "User",
    entityId: String(id),
    before: snapshot({
      user: { name: s.user.name, email: s.user.email, phoneNumber: s.user.phoneNumber ?? null, createdAt: s.user.createdAt },
      profile,
      roles: s.roles.map((r) => r.key),
    }),
    after: { keptStudentAccount: s.hasStudent },
  });
}

/** Console: Staff & roles (`staff.manage`). */
export const staffDeleter = deleter<StaffRecord>({
  permissions: ["staff.manage"],
  load: (id) => loadStaff(id),
  plan: (s, actor) => staffPlan(s, actor, false),
  apply: (s, actor) => applyStaffDelete(s, actor),
  done: (s) => `${s.user.name}'s account deleted.`,
});

/** CRM Team: only people whose every role is a CRM role (404 for anyone else). */
export const crmStaffDeleter = deleter<StaffRecord>({
  permissions: ["crm.access", "crm.staff.manage"],
  load: async (id) => {
    await assertPureCrmUser(id);
    return loadStaff(id);
  },
  plan: (s, actor) => staffPlan(s, actor, true),
  apply: (s, actor) => applyStaffDelete(s, actor),
  done: (s) => `${s.user.name}'s account deleted.`,
});

/** Custom roles nobody holds. System roles come back with every deploy, so they never go. */
export const roleDeleter = deleter<RoleDoc>({
  load: async (id) => {
    const role = await Role.findById(oid(id, "Role")).lean();
    if (!role) throw new NotFoundError("Role");
    return role as RoleDoc;
  },
  plan: async (role) => {
    const p = new Plan(`the ${role.name} role`);
    if (role.isSystem) p.block("It's a built-in role: those come back with every update");
    const holders = await StaffProfile.countDocuments({ roleIds: role._id });
    p.blockIf(holders, "person holds it. Take it off them first", "people hold it. Take it off them first", consoleUrl("/admin/staff"));
    return p;
  },
  apply: async (role, actor) => {
    await Role.deleteOne({ _id: role._id });
    await auditDelete({ actor, action: "role.delete", entityType: "Role", entityId: String(role._id), before: snapshot(role) });
  },
  after: async () => invalidateRoleCache(),
  done: (role) => `${role.name} role deleted.`,
});
