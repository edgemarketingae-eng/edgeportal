import type { StudentFilters, StudentListItem } from "@edge/contracts";
import { AuditLog, AuthUser, Batch, ClassSession, Course, Enrollment, EnrollmentEvent, Lead, Payment, Project, StudentProfile, Types } from "@edge/db";
import { env } from "../env";
import { now } from "@edge/domain/clock";
import { dubaiDateOnly, formatDate } from "@edge/domain/dates";
import { toCsv } from "@edge/domain/csv";
import { remainingMinor } from "@edge/domain/enrollment/machine";
import { NotFoundError } from "../errors";
import { oid } from "../ids";
import { day, iso, toEnrollmentDto } from "../mappers";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface StudentRow {
  _id: Types.ObjectId;
  country?: string;
  pendingPhone?: string | null;
  jetaFxClientId?: string | null;
  createdAt: Date;
  u: { name: string; email: string; phoneNumber?: string | null };
  e?: { _id: Types.ObjectId; status: string; paymentState: string; lockReason?: string | null; batchId: Types.ObjectId; currency?: string; feeMinor: number; firstPaidAt?: Date | null; paidCourseMinor?: number; balanceDueOn?: Date | null };
  b?: { name: string; feeMinor: number };
}

export async function listStudents(filters: StudentFilters & { page?: number; pageSize?: number }) {
  const match: Record<string, unknown> = {};
  if (filters.q) {
    const rx = new RegExp(escapeRegex(filters.q.trim()), "i");
    const digits = filters.q.replace(/\s/g, "");
    match.$or = [{ "u.name": rx }, { "u.email": rx }, { "u.phoneNumber": new RegExp(escapeRegex(digits)) }, { jetaFxClientId: rx }];
  }
  if (filters.status === "NONE") match.e = { $exists: false };
  else if (filters.status) match["e.status"] = filters.status;
  if (filters.payment) match["e.paymentState"] = filters.payment;
  if (filters.batch && Types.ObjectId.isValid(filters.batch)) match["e.batchId"] = new Types.ObjectId(filters.batch);
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 100;
  const [out] = await StudentProfile.aggregate<{ rows: StudentRow[]; total: { n: number }[] }>([
    { $lookup: { from: "user", localField: "_id", foreignField: "_id", as: "u" } },
    { $unwind: "$u" },
    { $lookup: { from: "enrollments", let: { sid: "$_id" }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$studentId", "$$sid"] }, { $eq: ["$isCurrent", true] }] } } }], as: "e" } },
    { $unwind: { path: "$e", preserveNullAndEmptyArrays: true } },
    { $lookup: { from: "batches", localField: "e.batchId", foreignField: "_id", as: "b" } },
    { $unwind: { path: "$b", preserveNullAndEmptyArrays: true } },
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $facet: { rows: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }], total: [{ $count: "n" }] } },
  ]);
  const rows: StudentListItem[] = (out?.rows ?? []).map((r) => ({
    id: String(r._id),
    name: r.u.name,
    email: r.u.email,
    phoneNumber: r.u.phoneNumber ?? null,
    pendingPhone: r.pendingPhone ?? null,
    country: r.country ?? "AE",
    jetaFxClientId: r.jetaFxClientId ?? null,
    createdAt: iso(r.createdAt)!,
    enrollment:
      r.e && r.b
        ? {
            id: String(r.e._id),
            status: r.e.status as never,
            paymentState: r.e.paymentState as never,
            lockReason: (r.e.lockReason as never) ?? null,
            batchId: String(r.e.batchId),
            batchName: r.b.name,
            currency: r.e.currency ?? "AED",
            feeMinor: r.e.firstPaidAt ? r.e.feeMinor : r.b.feeMinor,
            paidCourseMinor: r.e.paidCourseMinor ?? 0,
            balanceDueOn: day(r.e.balanceDueOn),
          }
        : null,
  }));
  return { rows, total: out?.total[0]?.n ?? 0 };
}

export async function studentsCsv(filters: StudentFilters) {
  const { rows } = await listStudents({ ...filters, page: 1, pageSize: 10_000 });
  return toCsv(
    ["Name", "Email", "Mobile", "Country", "Jeta FX ID", "Batch", "Status", "Payment", "Fee (AED)", "Paid (AED)", "Balance due", "Joined"],
    rows.map((s) => [
      s.name,
      s.email,
      s.phoneNumber ?? s.pendingPhone,
      s.country,
      s.jetaFxClientId,
      s.enrollment?.batchName,
      s.enrollment?.status,
      s.enrollment?.paymentState,
      s.enrollment ? (s.enrollment.feeMinor / 100).toFixed(2) : null,
      s.enrollment ? (s.enrollment.paidCourseMinor / 100).toFixed(2) : null,
      s.enrollment?.balanceDueOn ? formatDate(s.enrollment.balanceDueOn) : null,
      formatDate(s.createdAt),
    ]),
  );
}

async function userNames(ids: (string | null | undefined)[]) {
  const valid = [...new Set(ids.filter((x): x is string => !!x && Types.ObjectId.isValid(x)))].map((x) => new Types.ObjectId(x));
  const users = await AuthUser.find({ _id: { $in: valid } }, { name: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), u.name]));
}

export async function getStudentDetail(id: string) {
  const _id = oid(id, "Student");
  const [profile, user] = await Promise.all([StudentProfile.findById(_id).lean(), AuthUser.findById(_id).lean()]);
  if (!profile || !user) throw new NotFoundError("Student");
  const e = await Enrollment.findOne({ studentId: _id, isCurrent: true }).lean();
  let enrollment = null;
  let events: { id: string; type: string; fromStatus: string | null; toStatus: string | null; data: Record<string, unknown>; actorType: string; actorName: string | null; createdAt: string }[] = [];
  if (e) {
    const batch = await Batch.findById(e.batchId).lean();
    const course = batch ? await Course.findById(batch.courseId).lean() : null;
    if (batch && course) enrollment = toEnrollmentDto(e, batch, course);
    const evs = await EnrollmentEvent.find({ enrollmentId: e._id }).sort({ createdAt: -1 }).limit(50).lean();
    const names = await userNames(evs.map((x) => x.actorId));
    events = evs.map((x) => ({
      id: String(x._id),
      type: x.type,
      fromStatus: x.fromStatus ?? null,
      toStatus: x.toStatus ?? null,
      data: (x.data ?? {}) as Record<string, unknown>,
      actorType: x.actorType,
      actorName: x.actorId ? (names.get(x.actorId) ?? null) : null,
      createdAt: iso(x.createdAt)!,
    }));
  }
  const batches = await Batch.find({ status: { $ne: "ARCHIVED" } }).sort({ startDate: -1 }).lean();
  const leadDoc = await Lead.findOne({ studentId: _id, mergedIntoId: null }).lean();
  const [leadOwner, leadProject] = leadDoc ? await Promise.all([leadDoc.ownerId ? AuthUser.findById(leadDoc.ownerId, { name: 1 }).lean() : null, Project.findById(leadDoc.projectId, { name: 1 }).lean()]) : [null, null];
  const lead = leadDoc
    ? {
        id: String(leadDoc._id),
        href: `${env.CRM_APP_URL}/leads/${leadDoc._id}`,
        source: leadDoc.source,
        sourceDetail: leadDoc.sourceDetail ?? null,
        campaign: leadDoc.utm?.campaign ?? null,
        ownerName: leadOwner?.name ?? null,
        projectName: leadProject?.name ?? null,
        createdAt: iso(leadDoc.createdAt)!,
        convertedAt: iso(leadDoc.convertedAt),
      }
    : null;
  return {
    lead,
    student: {
      id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber ?? null,
      pendingPhone: profile.pendingPhone ?? null,
      country: profile.country ?? "AE",
      jetaFxClientId: profile.jetaFxClientId ?? null,
      jetaHistory: (profile.jetaFxHistory ?? []).map((h) => ({ oldValue: h.oldValue ?? null, newValue: h.newValue ?? null, changedAt: iso(h.changedAt)! })).reverse(),
      marketingConsent: !!profile.marketingConsent,
      marketingConsentAt: iso(profile.marketingConsentAt),
      createdAt: iso((profile as { createdAt?: Date }).createdAt)!,
    },
    enrollment,
    events,
    batches: batches.map((b) => ({ id: String(b._id), label: `${b.name} (${b.code})` })),
  };
}

export async function getDashboard() {
  const at = now();
  const todayStart = new Date(dubaiDateOnly(at).getTime() - 4 * 3600_000); // Dubai midnight
  const ymd = todayStart.toISOString().slice(0, 7);
  const monthStart = new Date(new Date(`${ymd}-01T00:00:00Z`).getTime() - 4 * 3600_000);
  const soon = new Date(at.getTime() + 7 * 86_400_000);
  const sum = (from: Date) => Payment.aggregate<{ totalMinor: number; count: number }>([{ $match: { status: "SUCCEEDED", succeededAt: { $gte: from } } }, { $group: { _id: null, totalMinor: { $sum: "$totalMinor" }, count: { $sum: 1 } } }]);
  const [byStatus, dueSoon, today, month, odooFailures, upcoming] = await Promise.all([
    Enrollment.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    Enrollment.countDocuments({ status: "ACTIVE", paymentState: "PARTIALLY_PAID", lockAt: { $lte: soon } }),
    sum(todayStart),
    sum(monthStart),
    Payment.countDocuments({ status: "SUCCEEDED", "odoo.status": "FAILED" }),
    ClassSession.find({ status: "SCHEDULED", startsAt: { $gte: at } }).sort({ startsAt: 1 }).limit(5).lean(),
  ]);
  const batchNames = new Map((await Batch.find({ _id: { $in: upcoming.map((u) => u.batchId) } }, { name: 1 }).lean()).map((b) => [String(b._id), b.name]));
  return {
    byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])),
    balanceDueSoon: dueSoon,
    collectedToday: { totalMinor: today[0]?.totalMinor ?? 0, count: today[0]?.count ?? 0 },
    collectedMonth: { totalMinor: month[0]?.totalMinor ?? 0, count: month[0]?.count ?? 0 },
    odooFailures,
    upcomingClasses: upcoming.map((c) => ({ id: String(c._id), title: c.title, batchName: batchNames.get(String(c.batchId)) ?? "", startsAt: iso(c.startsAt)! })),
  };
}

export async function listApprovals() {
  const rows = await Enrollment.find({ status: "PENDING_APPROVAL" }).sort({ firstPaidAt: 1 }).lean();
  const ids = rows.map((r) => r.studentId);
  const [users, profiles, batches, payments] = await Promise.all([
    AuthUser.find({ _id: { $in: ids } }).lean(),
    StudentProfile.find({ _id: { $in: ids } }).lean(),
    Batch.find({ _id: { $in: rows.map((r) => r.batchId) } }, { name: 1 }).lean(),
    Payment.find({ enrollmentId: { $in: rows.map((r) => r._id) }, status: "SUCCEEDED" }).sort({ succeededAt: 1 }).lean(),
  ]);
  const u = new Map(users.map((x) => [String(x._id), x]));
  const p = new Map(profiles.map((x) => [String(x._id), x]));
  const b = new Map(batches.map((x) => [String(x._id), x.name]));
  return rows.map((e) => ({
    enrollmentId: String(e._id),
    studentId: String(e.studentId),
    name: u.get(String(e.studentId))?.name ?? "",
    email: u.get(String(e.studentId))?.email ?? "",
    phoneNumber: u.get(String(e.studentId))?.phoneNumber ?? null,
    country: p.get(String(e.studentId))?.country ?? "AE",
    jetaFxClientId: p.get(String(e.studentId))?.jetaFxClientId ?? null,
    batchName: b.get(String(e.batchId)) ?? "",
    paymentState: e.paymentState,
    payments: payments
      .filter((x) => String(x.enrollmentId) === String(e._id))
      .map((x) => ({ id: String(x._id), gateway: x.gateway, totalMinor: x.totalMinor, courseMinor: x.courseMinor, currency: x.currency, succeededAt: iso(x.succeededAt), reference: x.externalPaymentId ?? String(x._id) })),
  }));
}

export async function countPendingApprovals() {
  return Enrollment.countDocuments({ status: "PENDING_APPROVAL" });
}

export async function listBalances() {
  const rows = await Enrollment.find({ paymentState: "PARTIALLY_PAID", status: { $nin: ["REJECTED", "CANCELLED"] } }).sort({ balanceDueOn: 1 }).lean();
  const [users, batches] = await Promise.all([AuthUser.find({ _id: { $in: rows.map((r) => r.studentId) } }).lean(), Batch.find({ _id: { $in: rows.map((r) => r.batchId) } }).lean()]);
  const u = new Map(users.map((x) => [String(x._id), x]));
  const b = new Map(batches.map((x) => [String(x._id), x]));
  return rows.map((e) => {
    const batch = b.get(String(e.batchId));
    const feeMinor = e.firstPaidAt ? e.feeMinor : (batch?.feeMinor ?? e.feeMinor);
    return {
      enrollmentId: String(e._id),
      studentId: String(e.studentId),
      name: u.get(String(e.studentId))?.name ?? "",
      phoneNumber: u.get(String(e.studentId))?.phoneNumber ?? null,
      batchName: batch?.name ?? "",
      status: e.status,
      lockReason: e.lockReason ?? null,
      currency: e.currency ?? "AED",
      paidCourseMinor: e.paidCourseMinor ?? 0,
      remainingMinor: remainingMinor({ feeMinor, paidCourseMinor: e.paidCourseMinor ?? 0 }),
      balanceDueOn: day(e.balanceDueOn),
    };
  });
}

export async function listAudit(q?: string) {
  const filter = q ? { $or: [{ action: new RegExp(escapeRegex(q), "i") }, { entityId: q }, { entityType: new RegExp(escapeRegex(q), "i") }, { actorId: q }] } : {};
  const rows = await AuditLog.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  const names = await userNames(rows.map((r) => r.actorId));
  return rows.map((r) => ({
    id: String(r._id),
    createdAt: iso((r as { createdAt?: Date }).createdAt)!,
    actor: r.actorType === "USER" ? (names.get(r.actorId ?? "") ?? r.actorId ?? "") : r.actorType.toLowerCase(),
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    after: r.after ?? null,
  }));
}
