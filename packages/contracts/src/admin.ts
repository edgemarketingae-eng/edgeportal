import { z } from "zod";
import { ENROLLMENT_STATUSES, LOCK_REASONS, PAYMENT_STATES } from "@edge/domain/enums";
import { EnrollmentDto, EnrollmentEventDto } from "./enrollment";
import { route } from "./route";

export const StudentFilters = z.object({
  q: z.string().trim().optional(),
  status: z.enum([...ENROLLMENT_STATUSES, "NONE"]).optional(),
  payment: z.enum(PAYMENT_STATES).optional(),
  batch: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(10000).default(100),
});
export type StudentFilters = z.input<typeof StudentFilters>;

export const StudentListItem = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phoneNumber: z.string().nullable(),
  pendingPhone: z.string().nullable(),
  country: z.string(),
  jetaFxClientId: z.string().nullable(),
  createdAt: z.string(),
  enrollment: z
    .object({
      id: z.string(),
      status: z.enum(ENROLLMENT_STATUSES),
      paymentState: z.enum(PAYMENT_STATES),
      lockReason: z.enum(LOCK_REASONS).nullable(),
      batchId: z.string(),
      batchName: z.string(),
      currency: z.string(),
      feeMinor: z.number(),
      paidCourseMinor: z.number(),
      balanceDueOn: z.string().nullable(),
    })
    .nullable(),
});
export type StudentListItem = z.infer<typeof StudentListItem>;

export const StudentDetail = z.object({
  student: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    phoneNumber: z.string().nullable(),
    pendingPhone: z.string().nullable(),
    country: z.string(),
    jetaFxClientId: z.string().nullable(),
    jetaHistory: z.array(z.object({ oldValue: z.string().nullable(), newValue: z.string().nullable(), changedAt: z.string() })),
    marketingConsent: z.boolean(),
    marketingConsentAt: z.string().nullable(),
    createdAt: z.string(),
  }),
  enrollment: EnrollmentDto.nullable(),
  events: z.array(EnrollmentEventDto),
  batches: z.array(z.object({ id: z.string(), label: z.string() })),
  /** CRM origin when this student came through a lead. */
  lead: z
    .object({ id: z.string(), href: z.string(), source: z.string(), sourceDetail: z.string().nullable(), campaign: z.string().nullable(), ownerName: z.string().nullable(), projectName: z.string().nullable(), createdAt: z.string(), convertedAt: z.string().nullable() })
    .nullable(),
});
export type StudentDetail = z.infer<typeof StudentDetail>;

export const DashboardDto = z.object({
  byStatus: z.record(z.string(), z.number()),
  balanceDueSoon: z.number(),
  collectedToday: z.object({ totalMinor: z.number(), count: z.number() }),
  collectedMonth: z.object({ totalMinor: z.number(), count: z.number() }),
  odooFailures: z.number(),
  upcomingClasses: z.array(z.object({ id: z.string(), title: z.string(), batchName: z.string(), startsAt: z.string() })),
});

export const BalanceRow = z.object({
  enrollmentId: z.string(),
  studentId: z.string(),
  name: z.string(),
  phoneNumber: z.string().nullable(),
  batchName: z.string(),
  status: z.enum(ENROLLMENT_STATUSES),
  lockReason: z.enum(LOCK_REASONS).nullable(),
  currency: z.string(),
  paidCourseMinor: z.number(),
  remainingMinor: z.number(),
  balanceDueOn: z.string().nullable(),
});

export const ApprovalRow = z.object({
  enrollmentId: z.string(),
  studentId: z.string(),
  name: z.string(),
  email: z.string(),
  phoneNumber: z.string().nullable(),
  country: z.string(),
  jetaFxClientId: z.string().nullable(),
  batchName: z.string(),
  paymentState: z.enum(PAYMENT_STATES),
  payments: z.array(z.object({ id: z.string(), gateway: z.string(), totalMinor: z.number(), courseMinor: z.number(), currency: z.string(), succeededAt: z.string().nullable(), reference: z.string() })),
});

export const AuditRow = z.object({ id: z.string(), createdAt: z.string(), actor: z.string(), action: z.string(), entityType: z.string(), entityId: z.string(), after: z.unknown() });

export const adminRoutes = {
  dashboard: route({ method: "GET", path: "/api/v1/admin/dashboard", response: DashboardDto }),
  students: route({ method: "GET", path: "/api/v1/admin/students", query: StudentFilters, response: z.object({ rows: z.array(StudentListItem), total: z.number() }) }),
  studentsCsv: route({ method: "GET", path: "/api/v1/admin/students.csv", query: StudentFilters, response: z.string() }),
  student: route({ method: "GET", path: "/api/v1/admin/students/:id", params: z.object({ id: z.string() }), response: StudentDetail }),
  approvals: route({ method: "GET", path: "/api/v1/admin/approvals", response: z.array(ApprovalRow) }),
  balances: route({ method: "GET", path: "/api/v1/admin/balances", response: z.array(BalanceRow) }),
  audit: route({ method: "GET", path: "/api/v1/admin/audit", query: z.object({ q: z.string().optional() }), response: z.array(AuditRow) }),
  pendingApprovals: route({ method: "GET", path: "/api/v1/admin/approvals/count", response: z.object({ count: z.number() }) }),
};
