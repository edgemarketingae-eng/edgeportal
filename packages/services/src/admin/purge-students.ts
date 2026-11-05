import {
  AuthAccount,
  AuthSession,
  AuthTwoFactor,
  AuthUser,
  AuthVerification,
  Enrollment,
  EnrollmentEvent,
  InAppNotification,
  JoinLog,
  Lead,
  OdooSyncLog,
  Payment,
  RecordingView,
  StaffProfile,
  StudentProfile,
  type AuthUserDoc,
  type EnrollmentDoc,
  type PaymentDoc,
  type StudentProfileDoc,
  type Types,
} from "@edge/db";
import { now } from "@edge/domain/clock";
import { formatDateTime } from "@edge/domain/dates";
import { recordActivity } from "../crm/common";
import { NotFoundError } from "../errors";
import { oid } from "../ids";
import { auditDelete, consoleUrl, deleter, gather, Plan, plural, snapshot, type UserActor } from "../records/kit";

/**
 * Payments that hold or may still hold money block a delete: succeeded ones, authorized ones (captured later) and
 * checkouts still open. Failed, cancelled and expired attempts go with the record.
 */
export function paymentBlockers(p: Plan, payments: PaymentDoc[], href: string) {
  const at = now();
  const open = (x: PaymentDoc) => (x.status === "CREATED" || x.status === "PENDING") && (!x.expiresAt || x.expiresAt > at);
  const paid = payments.filter((x) => x.status === "SUCCEEDED");
  const authorized = payments.filter((x) => x.status === "AUTHORIZED");
  const checkouts = payments.filter(open);
  p.blockIf(paid.length, "payment received. Delete it first", "payments received. Delete them first", href);
  p.blockIf(authorized.length, "payment authorized at the gateway", "payments authorized at the gateway", href);
  for (const c of checkouts) p.block(`A checkout is open${c.expiresAt ? ` until ${formatDateTime(c.expiresAt)}` : ""}`, href);
  return payments.filter((x) => x.status !== "SUCCEEDED" && x.status !== "AUTHORIZED" && !open(x));
}

async function dropPayments(ids: Types.ObjectId[]) {
  if (!ids.length) return;
  await OdooSyncLog.deleteMany({ paymentId: { $in: ids } });
  await Payment.deleteMany({ _id: { $in: ids } });
}

/** Leads keep their history; only the link to the student goes, with a note on the timeline. */
async function unlinkLeads(filter: Record<string, unknown>, set: Record<string, null>, actor: UserActor, body: string) {
  const leads = await Lead.find(filter, { _id: 1 }).lean();
  for (const l of leads) {
    await Lead.updateOne({ _id: l._id }, { $set: set });
    await recordActivity(l._id, "SYSTEM", actor, { body });
  }
  return leads.length;
}

interface StudentRecord {
  user: AuthUserDoc;
  profile: StudentProfileDoc;
  isStaff: boolean;
  enrollments: EnrollmentDoc[];
  payments: PaymentDoc[];
}

async function loadStudent(id: string): Promise<StudentRecord> {
  const _id = oid(id, "Student");
  const [user, profile, isStaff, enrollments, payments] = await gather([
    () => AuthUser.findById(_id).lean(),
    () => StudentProfile.findById(_id).lean(),
    () => StaffProfile.exists({ _id }),
    () => Enrollment.find({ studentId: _id }).lean(),
    () => Payment.find({ studentId: _id }).lean(),
  ] as const);
  if (!user || !profile) throw new NotFoundError("Student");
  return {
    user: user as AuthUserDoc,
    profile,
    isStaff: !!isStaff,
    enrollments: enrollments as EnrollmentDoc[],
    payments: payments as PaymentDoc[],
  };
}

/**
 * A student account with no money on it: their enrollments, failed or expired payment attempts, class and recording
 * logs and notifications go too. A lead that became this student keeps its history and loses the link.
 */
export const studentDeleter = deleter<StudentRecord>({
  load: (id) => loadStudent(id),
  plan: async (s) => {
    const id = s.user._id;
    const p = new Plan(`the student ${s.user.name}`);
    const dead = paymentBlockers(p, s.payments, consoleUrl(`/admin/students/${id}`));
    p.remove(s.enrollments.length, "enrollment")
      .remove(dead.length, "unpaid payment attempt")
      .remove(await JoinLog.countDocuments({ userId: id }), "class join record")
      .remove(await RecordingView.countDocuments({ userId: id }), "recording view");
    const leads = await Lead.countDocuments({ studentId: id });
    if (leads) p.warn(`${plural(leads, "CRM lead stays", "CRM leads stay")} with its history; only the link to this account goes.`);
    if (s.profile.mailerliteSubscriberId) p.warn("They stay on the MailerLite list. Remove them there if needed.");
    if (s.profile.odooPartnerId) p.warn("Their Odoo contact stays.");
    if (s.isStaff) p.warn("They also have a staff account, which stays with its sign-in.");
    return p;
  },
  apply: async (s, actor, plan) => {
    const id = s.user._id;
    const dead = paymentBlockers(new Plan(plan.label), s.payments, "");
    const enrollmentIds = s.enrollments.map((e) => e._id);
    await EnrollmentEvent.deleteMany({ enrollmentId: { $in: enrollmentIds } });
    await dropPayments(dead.map((x) => x._id));
    await Enrollment.deleteMany({ _id: { $in: enrollmentIds } });
    await JoinLog.deleteMany({ userId: id });
    await RecordingView.deleteMany({ userId: id });
    await unlinkLeads(
      { studentId: id },
      { studentId: null, enrollmentId: null },
      actor,
      `The student account ${s.user.email} was deleted.`,
    );
    await StudentProfile.deleteOne({ _id: id });
    if (!s.isStaff) {
      await InAppNotification.deleteMany({ userId: id });
      await AuthSession.deleteMany({ userId: id });
      await AuthTwoFactor.deleteMany({ userId: id });
      await AuthVerification.deleteMany({ value: String(id) });
      await AuthAccount.deleteMany({ userId: id });
      await AuthUser.deleteOne({ _id: id });
    }
    await auditDelete({
      actor,
      action: "student.delete",
      entityType: "User",
      entityId: String(id),
      before: snapshot({
        user: { name: s.user.name, email: s.user.email, phoneNumber: s.user.phoneNumber ?? null, createdAt: s.user.createdAt },
        profile: s.profile,
        enrollments: s.enrollments,
        payments: dead,
      }),
      after: { keptStaffAccount: s.isStaff },
    });
  },
  done: (s) => `${s.user.name} deleted.`,
});

interface EnrollmentRecord {
  enrollment: EnrollmentDoc;
  payments: PaymentDoc[];
  studentName: string;
}

/** One enrollment with no money on it, with its history and unpaid payment attempts. */
export const enrollmentDeleter = deleter<EnrollmentRecord>({
  load: async (id) => {
    const enrollment = (await Enrollment.findById(oid(id, "Enrollment")).lean()) as EnrollmentDoc | null;
    if (!enrollment) throw new NotFoundError("Enrollment");
    const [payments, user] = await gather([
      () => Payment.find({ enrollmentId: enrollment._id }).lean(),
      () => AuthUser.findById(enrollment.studentId, { name: 1 }).lean(),
    ] as const);
    return { enrollment, payments: payments as PaymentDoc[], studentName: user?.name ?? "the student" };
  },
  plan: async (r) => {
    const p = new Plan(`${r.studentName}'s enrollment`);
    const dead = paymentBlockers(p, r.payments, consoleUrl(`/admin/students/${r.enrollment.studentId}`));
    p.remove(await EnrollmentEvent.countDocuments({ enrollmentId: r.enrollment._id }), "history entry", "history entries");
    p.remove(dead.length, "unpaid payment attempt");
    if (r.enrollment.isCurrent) p.warn("It's their current enrollment, so they'll have no batch until they enroll again.");
    return p;
  },
  apply: async (r, actor, plan) => {
    const dead = paymentBlockers(new Plan(plan.label), r.payments, "");
    await EnrollmentEvent.deleteMany({ enrollmentId: r.enrollment._id });
    await dropPayments(dead.map((x) => x._id));
    await Enrollment.deleteOne({ _id: r.enrollment._id });
    await unlinkLeads({ enrollmentId: r.enrollment._id }, { enrollmentId: null }, actor, "The student's enrollment was deleted.");
    await auditDelete({
      actor,
      action: "enrollment.delete",
      entityType: "Enrollment",
      entityId: String(r.enrollment._id),
      before: snapshot({ ...r.enrollment, payments: dead }),
    });
  },
  done: () => "Enrollment deleted.",
});
