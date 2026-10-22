import { z } from "zod";
import { ENROLLMENT_STATUSES, LOCK_REASONS, PAYMENT_STATES, VAT_TREATMENTS } from "@edge/domain/enums";
import { zOk } from "./common";
import { route } from "./route";

export const EnrollmentDto = z.object({
  id: z.string(),
  studentId: z.string(),
  batchId: z.string(),
  batchName: z.string(),
  batchCode: z.string(),
  courseTitle: z.string(),
  status: z.enum(ENROLLMENT_STATUSES),
  paymentState: z.enum(PAYMENT_STATES),
  isCurrent: z.boolean(),
  currency: z.string(),
  feeMinor: z.number(),
  paidCourseMinor: z.number(),
  remainingMinor: z.number(),
  vatTreatment: z.enum(VAT_TREATMENTS).nullable(),
  taxCountry: z.string().nullable(),
  balanceDueOn: z.string().nullable(),
  lockAt: z.string().nullable(),
  lockReason: z.enum(LOCK_REASONS).nullable(),
  lockNote: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  approvedAt: z.string().nullable(),
  firstPaidAt: z.string().nullable(),
  fullyPaidAt: z.string().nullable(),
  createdAt: z.string(),
});
export type EnrollmentDto = z.infer<typeof EnrollmentDto>;

export const EnrollmentEventDto = z.object({ id: z.string(), type: z.string(), fromStatus: z.string().nullable(), toStatus: z.string().nullable(), data: z.record(z.string(), z.unknown()), actorType: z.string(), actorName: z.string().nullable(), createdAt: z.string() });

const idParam = z.object({ id: z.string() });
const dateOnly = z.iso.date("Choose a valid date");

export const enrollmentRoutes = {
  approve: route({ method: "POST", path: "/api/v1/admin/enrollments/:id/approve", params: idParam, response: zOk }),
  reject: route({ method: "POST", path: "/api/v1/admin/enrollments/:id/reject", params: idParam, body: z.object({ reason: z.string().trim().min(2, "A reason is required") }), response: zOk }),
  lock: route({ method: "POST", path: "/api/v1/admin/enrollments/:id/lock", params: idParam, body: z.object({ note: z.string().trim().max(500).default("") }), response: zOk }),
  unlock: route({ method: "POST", path: "/api/v1/admin/enrollments/:id/unlock", params: idParam, body: z.object({ newDueDate: z.union([z.literal(""), dateOnly]).optional() }), response: zOk }),
  extendDue: route({ method: "POST", path: "/api/v1/admin/enrollments/:id/extend-due", params: idParam, body: z.object({ newDueDate: dateOnly }), response: zOk }),
  changeBatch: route({ method: "POST", path: "/api/v1/admin/enrollments/:id/change-batch", params: idParam, body: z.object({ batchId: z.string().min(1) }), response: zOk }),
  assignBatch: route({ method: "POST", path: "/api/v1/admin/students/:id/assign-batch", params: idParam, body: z.object({ batchId: z.string().min(1) }), response: zOk }),
};
