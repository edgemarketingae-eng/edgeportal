import type { BatchDto, EnrollmentDto } from "@edge/contracts";
import type { BatchDoc, CourseDoc, EnrollmentDoc } from "@edge/db";
import { remainingMinor } from "@edge/domain/enrollment/machine";

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);
const day = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export function toEnrollmentDto(e: EnrollmentDoc, batch: BatchDoc, course: Pick<CourseDoc, "title">): EnrollmentDto {
  const feeMinor = e.firstPaidAt ? e.feeMinor : batch.feeMinor;
  return {
    id: String(e._id),
    studentId: String(e.studentId),
    batchId: String(e.batchId),
    batchName: batch.name,
    batchCode: batch.code,
    courseTitle: course.title,
    status: e.status,
    paymentState: e.paymentState,
    isCurrent: e.isCurrent ?? true,
    currency: e.currency ?? "AED",
    feeMinor,
    paidCourseMinor: e.paidCourseMinor ?? 0,
    remainingMinor: remainingMinor({ feeMinor, paidCourseMinor: e.paidCourseMinor ?? 0 }),
    vatTreatment: (e.vatTreatment as EnrollmentDto["vatTreatment"]) ?? null,
    taxCountry: e.taxCountry ?? null,
    balanceDueOn: day(e.balanceDueOn),
    lockAt: iso(e.lockAt),
    lockReason: (e.lockReason as EnrollmentDto["lockReason"]) ?? null,
    lockNote: e.lockNote ?? null,
    rejectionReason: e.rejectionReason ?? null,
    approvedAt: iso(e.approvedAt),
    firstPaidAt: iso(e.firstPaidAt),
    fullyPaidAt: iso(e.fullyPaidAt),
    createdAt: iso(e.createdAt)!,
  };
}

export function toBatchDto(b: BatchDoc, courseTitle: string, mentorNames: Map<string, { name: string; title: string | null }>, activeStudents?: number): BatchDto {
  return {
    id: String(b._id),
    courseId: String(b.courseId),
    courseTitle,
    code: b.code,
    name: b.name,
    description: b.description ?? null,
    startDate: day(b.startDate)!,
    endDate: day(b.endDate),
    scheduleText: b.scheduleText ?? null,
    capacity: b.capacity ?? null,
    status: b.status,
    isCurrentForEnrollment: !!b.isCurrentForEnrollment,
    currency: b.currency ?? "AED",
    feeMinor: b.feeMinor,
    advanceEnabled: b.advanceEnabled ?? true,
    advancePresetsMinor: [...(b.advancePresetsMinor ?? [])].sort((x, y) => x - y),
    allowCustomAdvance: b.allowCustomAdvance ?? true,
    balanceDueRule: b.balanceDueRule,
    balanceDueDate: day(b.balanceDueDate),
    balanceDueDays: b.balanceDueDays ?? null,
    lockGraceDays: b.lockGraceDays ?? 0,
    whatsappGroupUrl: b.whatsappGroupUrl ?? null,
    autoPublishRecordings: b.autoPublishRecordings ?? true,
    mentors: (b.mentors ?? []).map((m) => ({ userId: String(m.userId), name: mentorNames.get(String(m.userId))?.name ?? "Unknown", title: mentorNames.get(String(m.userId))?.title ?? null, isLead: !!m.isLead })),
    ...(activeStudents !== undefined ? { activeStudents } : {}),
  };
}

export { iso, day };
