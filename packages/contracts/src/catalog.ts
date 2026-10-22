import { z } from "zod";
import { BALANCE_DUE_RULES, BATCH_STATUSES } from "@edge/domain/enums";
import { toMinor } from "@edge/domain/money";
import { zOk } from "./common";
import { route } from "./route";

export const MentorRef = z.object({ userId: z.string(), name: z.string(), title: z.string().nullable(), isLead: z.boolean() });

export const BatchDto = z.object({
  id: z.string(),
  courseId: z.string(),
  courseTitle: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  scheduleText: z.string().nullable(),
  capacity: z.number().nullable(),
  status: z.enum(BATCH_STATUSES),
  isCurrentForEnrollment: z.boolean(),
  currency: z.string(),
  feeMinor: z.number(),
  advanceEnabled: z.boolean(),
  advancePresetsMinor: z.array(z.number()),
  allowCustomAdvance: z.boolean(),
  balanceDueRule: z.enum(BALANCE_DUE_RULES),
  balanceDueDate: z.string().nullable(),
  balanceDueDays: z.number().nullable(),
  lockGraceDays: z.number(),
  whatsappGroupUrl: z.string().nullable(),
  autoPublishRecordings: z.boolean(),
  mentors: z.array(MentorRef),
  activeStudents: z.number().optional(),
});
export type BatchDto = z.infer<typeof BatchDto>;

export const CourseDto = z.object({ id: z.string(), code: z.string(), slug: z.string(), title: z.string(), description: z.string().nullable(), isActive: z.boolean(), batches: z.array(BatchDto) });
export type CourseDto = z.infer<typeof CourseDto>;

const code = z.string().trim().toUpperCase().pipe(z.string().min(2).max(30).regex(/^[A-Z0-9-]+$/, "Use capitals, digits and dashes"));

export const CourseInput = z.object({ code, title: z.string().trim().min(3).max(120), description: z.string().trim().max(5000).optional(), isActive: z.boolean() });

const amount = z
  .string()
  .trim()
  .min(1, "Required")
  .transform((v, ctx) => {
    try {
      const m = toMinor(v);
      if (m < 0) throw new Error();
      return m;
    } catch {
      ctx.addIssue({ code: "custom", message: "Enter an amount" });
      return z.NEVER;
    }
  });
const optInt = (min: number, max: number) => z.union([z.literal("").transform(() => undefined), z.coerce.number().int().min(min).max(max)]).optional();

export const BatchInput = z
  .object({
    courseId: z.string().min(1, "Choose a course"),
    code,
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().max(5000).optional(),
    startDate: z.iso.date("Choose a start date"),
    endDate: z.union([z.literal(""), z.iso.date()]).optional(),
    scheduleText: z.string().trim().max(200).optional(),
    capacity: optInt(1, 100000),
    status: z.enum(BATCH_STATUSES),
    fee: amount,
    advanceEnabled: z.boolean(),
    advancePresets: z.string().trim(),
    allowCustomAdvance: z.boolean(),
    balanceDueRule: z.enum(BALANCE_DUE_RULES),
    balanceDueDate: z.union([z.literal(""), z.iso.date()]).optional(),
    balanceDueDays: optInt(1, 365),
    lockGraceDays: z.coerce.number().int().min(0).max(60),
    whatsappGroupUrl: z.union([z.literal(""), z.url()]).optional(),
    isCurrentForEnrollment: z.boolean(),
    mentorIds: z.array(z.string()),
  })
  .superRefine((b, ctx) => {
    if (b.balanceDueRule === "FIXED_DATE" && !b.balanceDueDate) ctx.addIssue({ code: "custom", path: ["balanceDueDate"], message: "Choose the balance due date" });
    if (b.balanceDueRule === "DAYS_AFTER_FIRST_PAYMENT" && !b.balanceDueDays) ctx.addIssue({ code: "custom", path: ["balanceDueDays"], message: "Enter the number of days" });
    if (b.isCurrentForEnrollment && !["OPEN", "RUNNING"].includes(b.status)) ctx.addIssue({ code: "custom", path: ["isCurrentForEnrollment"], message: "Only an open or running batch can take new students" });
  });
export type BatchInput = z.input<typeof BatchInput>;

export const catalogRoutes = {
  listCourses: route({ method: "GET", path: "/api/v1/admin/courses", response: z.array(CourseDto) }),
  saveCourse: route({ method: "POST", path: "/api/v1/admin/courses", body: CourseInput.extend({ id: z.string().optional() }), response: z.object({ id: z.string() }) }),
  getBatch: route({ method: "GET", path: "/api/v1/admin/batches/:id", params: z.object({ id: z.string() }), response: BatchDto }),
  saveBatch: route({ method: "POST", path: "/api/v1/admin/batches", body: BatchInput.and(z.object({ id: z.string().optional() })), response: z.object({ id: z.string() }) }),
  listBatches: route({ method: "GET", path: "/api/v1/admin/batches", response: z.array(BatchDto) }),
  listMentors: route({ method: "GET", path: "/api/v1/admin/mentors", response: z.array(z.object({ userId: z.string(), name: z.string(), title: z.string().nullable() })) }),
};
export { zOk };
