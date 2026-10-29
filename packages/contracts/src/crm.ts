import { z } from "zod";
import {
  ACTIVITY_DIRECTIONS,
  CALL_OUTCOMES,
  CONVERSION_SOURCES,
  CRM_TASK_STATUSES,
  DEPOSIT_SEQUENCES,
  DEPOSIT_STATUSES,
  EXPERIENCE_LEVELS,
  FOLLOWUP_TYPES,
  LEAD_ACTIVITY_TYPES,
  LEAD_CHANNELS,
  LEAD_LANGUAGES,
  LEAD_SOURCES,
  LEAD_STAGES,
  LEAD_TEMPERATURES,
  LEAD_TOUCH_TYPES,
  LEADERBOARD_PERIODS,
  PRODUCT_STATUSES,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
} from "@edge/domain/crm/enums";
import { ENROLLMENT_STATUSES, PAYMENT_STATES } from "@edge/domain/enums";
import { paged, zCountry, zEmail, zOk, zPage } from "./common";
import { route } from "./route";
import { RoleDto, StaffCreateInput, StaffRow, StaffUpdateInput } from "./staff";

const idParam = z.object({ id: z.string() });
const nullable = z.string().nullable();

/** "YYYY-MM-DDTHH:mm" from a datetime-local input, read as Dubai wall-clock time. */
export const zLocalDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Choose a date and time");
const optLocalDateTime = z.union([z.literal(""), zLocalDateTime]).optional();
const optDateOnly = z.union([z.literal(""), z.iso.date()]).optional();
const optInt = z.union([z.literal(""), z.coerce.number().int().min(0).max(1_000_000)]).optional();
/** Native <select> sends "" for "not set". */
const optEnum = <const T extends readonly string[]>(values: T) => z.union([z.literal(""), z.enum(values)]).optional();

// ---------------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------------

export const LeadFilters = z.object({
  q: z.string().trim().optional(),
  project: z.string().optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  /** "me" | "unassigned" | <staff user id> */
  owner: z.string().optional(),
  temperature: z.enum(LEAD_TEMPERATURES).optional(),
  batch: z.string().optional(),
  course: z.string().optional(),
  tag: z.string().trim().optional(),
  /** Leads converted to this product id. */
  product: z.string().optional(),
  due: z.enum(["overdue", "today", "week", "none"]).optional(),
  created: z.enum(["today", "week", "month"]).optional(),
  /** Default "open" hides CONVERTED and LOST unless a stage filter is given. */
  view: z.enum(["open", "all"]).optional(),
  sort: z.enum(["recent", "created", "followUp", "name"]).optional(),
  ...zPage.shape,
});
export type LeadFilters = z.input<typeof LeadFilters>;

/** The leads a bulk action applies to: the ticked ids, or every lead matching a filter ("select all matching"). */
const bulkTargetShape = {
  ids: z.array(z.string()).max(1000).optional(),
  filters: LeadFilters.omit({ page: true, pageSize: true, sort: true }).optional(),
};
const hasTarget = (b: { ids?: string[]; filters?: unknown }) => (b.ids?.length ?? 0) > 0 || !!b.filters;
export const BulkTarget = z.object(bulkTargetShape).refine(hasTarget, { message: "Select at least one lead", path: ["ids"] });
export const BulkAssignInput = z
  .object({ ...bulkTargetShape, ownerId: z.string() })
  .refine(hasTarget, { message: "Select at least one lead", path: ["ids"] });

export const LeadFields = z.object({
  projectId: z.string().min(1, "Choose a project"),
  name: z.string().trim().min(2, "Enter a name").max(80),
  phone: z.string().trim().max(30).optional(),
  email: z.union([z.literal(""), zEmail()]).optional(),
  country: z.union([z.literal(""), zCountry]).optional(),
  source: z.enum(LEAD_SOURCES),
  sourceDetail: z.string().trim().max(200).optional(),
  courseInterestId: z.string().optional(),
  batchInterestId: z.string().optional(),
  experienceLevel: optEnum(EXPERIENCE_LEVELS),
  temperature: optEnum(LEAD_TEMPERATURES),
  preferredChannel: optEnum(LEAD_CHANNELS),
  language: optEnum(LEAD_LANGUAGES),
  jetaFxClientId: z.string().trim().max(40).optional(),
  qualification: z
    .object({
      experience: z.string().trim().max(1000).optional(),
      occupation: z.string().trim().max(1000).optional(),
      purpose: z.string().trim().max(1000).optional(),
    })
    .optional(),
  /** Comma separated. */
  tags: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
  marketingConsent: z.boolean().optional(),
  whatsappConsent: z.boolean().optional(),
  nextFollowUpAt: optLocalDateTime,
  /** "" = unassigned; omitted = the creator. Assigning someone else needs crm.assign in that project. */
  ownerId: z.string().optional(),
  /** Create even when a lead with the same phone or email exists. */
  allowDuplicate: z.boolean().optional(),
});
export const LeadInput = LeadFields.superRefine((d, ctx) => {
  if (!d.phone && !d.email) ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter a mobile number or an email" });
});
export type LeadInput = z.input<typeof LeadInput>;
export const LeadUpdateInput = LeadFields.partial();
export type LeadUpdateInput = z.input<typeof LeadUpdateInput>;

export const StageInput = z
  .object({
    stage: z.enum(LEAD_STAGES),
    lostReason: z.string().trim().max(120).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.stage === "LOST" && !d.lostReason) ctx.addIssue({ code: "custom", path: ["lostReason"], message: "Choose a reason" });
  });

export const ActivityInput = z
  .object({
    type: z.enum(LEAD_TOUCH_TYPES),
    body: z.string().trim().max(5000).default(""),
    outcome: optEnum(CALL_OUTCOMES),
    direction: optEnum(ACTIVITY_DIRECTIONS),
    nextFollowUpAt: optLocalDateTime,
    nextFollowUpTitle: z.string().trim().max(120).optional(),
    nextFollowUpType: optEnum(FOLLOWUP_TYPES),
  })
  .superRefine((d, ctx) => {
    if (d.type === "NOTE" && !d.body) ctx.addIssue({ code: "custom", path: ["body"], message: "Write a note" });
  });

export const TaskInput = z.object({
  /** Defaults to the lead's project; required for a task without a lead. */
  projectId: z.string().optional(),
  leadId: z.string().optional(),
  title: z.string().trim().min(2, "Enter a title").max(160),
  description: z.string().trim().max(5000).optional(),
  type: z.enum(FOLLOWUP_TYPES).default("CALL"),
  priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
  dueAt: optLocalDateTime,
  /** "" or omitted = the creator (or the lead owner for lead tasks). */
  assigneeId: z.string().optional(),
});
export type TaskInput = z.input<typeof TaskInput>;
export const TaskUpdateInput = TaskInput.omit({ projectId: true, leadId: true }).partial();
export type TaskUpdateInput = z.input<typeof TaskUpdateInput>;
export const MoveTaskInput = z.object({ status: z.enum(CRM_TASK_STATUSES), orderedIds: z.array(z.string()).max(600).default([]) });
export const TaskCommentInput = z.object({ body: z.string().trim().min(1, "Write a comment").max(5000) });

export const ProjectInput = z.object({
  name: z.string().trim().min(2, "Enter a name").max(120),
  code: z.string().trim().max(30).optional(),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(PROJECT_STATUSES).default("ACTIVE"),
  courseId: z.string().optional(),
  batchId: z.string().optional(),
  startDate: optDateOnly,
  endDate: optDateOnly,
  targetLeads: optInt,
  targetConversions: optInt,
  managerIds: z.array(z.string()).optional(),
  memberIds: z.array(z.string()).optional(),
});
export type ProjectInput = z.input<typeof ProjectInput>;
export const ProjectMemberInput = z.object({ userId: z.string().min(1), role: z.enum(["manager", "member"]) });

export const CrmSettingsInput = z.object({
  followUpSlaHours: z.coerce.number().int().min(1).max(720),
  staleAfterDays: z.coerce.number().int().min(1).max(365),
  batchUrgencyDays: z.coerce.number().int().min(0).max(60),
  roundRobin: z.boolean(),
  /** One per line or comma separated. */
  lostReasons: z.string().max(2000),
});

export const ProductInput = z.object({
  name: z.string().trim().min(2, "Enter a name").max(80),
  description: z.string().trim().max(1000).optional(),
  status: z.enum(PRODUCT_STATUSES).default("ACTIVE"),
  /** Becoming a student counts as converting to this product (only one product can be it). */
  isStudentCourse: z.boolean().optional(),
  sortOrder: optInt,
});
export type ProductInput = z.input<typeof ProductInput>;

export const ConversionInput = z.object({
  productIds: z.array(z.string().min(1)).min(1, "Choose at least one product").max(20),
  note: z.string().trim().max(1000).optional(),
});

/** An amount typed by a person ("1,500.50"): positive, at most two decimals. */
const zAmount = z
  .string()
  .trim()
  .min(1, "Enter the amount")
  .refine(
    (v) => /^\d{1,9}(\.\d{1,2})?$/.test(v.replace(/,/g, "")) && Number(v.replace(/,/g, "")) > 0,
    "Enter an amount like 500 or 1250.50",
  );

export const DepositInput = z.object({
  sequence: z.enum(DEPOSIT_SEQUENCES, { message: "Choose which deposit this is" }),
  amount: zAmount,
  depositedAt: z.iso.date({ message: "Choose the deposit date" }),
  /** Required (and saved on the lead) when the lead has no JetaFX client id yet. */
  jetaFxClientId: z.string().trim().max(40).optional(),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(1000).optional(),
});
export type DepositInput = z.input<typeof DepositInput>;

export const DepositFilters = z.object({
  status: z.enum(DEPOSIT_STATUSES).optional(),
  /** Credited staff user id (commission managers only). */
  staff: z.string().optional(),
  period: z.enum(LEADERBOARD_PERIODS).optional(),
  ...zPage.shape,
});
export type DepositFilters = z.input<typeof DepositFilters>;

const percent = z.coerce.number({ message: "Enter a percentage" }).min(0, "Enter 0 to 100").max(100, "Enter 0 to 100");

/** A later deposit of at least `from` USD earns `pct` percent of the whole deposit. */
export const CommissionSlabInput = z.object({
  from: z.coerce.number({ message: "Enter an amount" }).min(0, "Enter an amount of 0 or more"),
  pct: percent,
});

export const CommissionSettingsInput = z.object({
  firstPct: percent,
  slabs: z
    .array(CommissionSlabInput)
    .min(1)
    .max(10, "Up to 10 slabs")
    .refine((s) => s.some((x) => x.from === 0), "Keep a base rate (from 0)")
    .refine((s) => new Set(s.map((x) => x.from)).size === s.length, "Each slab needs its own starting amount"),
});

export const LeaderboardQuery = z.object({
  period: z.enum(LEADERBOARD_PERIODS).default("month"),
  project: z.string().optional(),
});

export const CrmStaffCreateInput = StaffCreateInput.extend({ projectIds: z.array(z.string()).optional() });
export const CrmRoleInput = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Enter a role name"),
  description: z.string().optional(),
  permissions: z.array(z.string()),
});

// ---------------------------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------------------------

export const LeadOwnerRef = z.object({
  id: z.string(),
  name: z.string(),
  roles: z.array(z.string()).optional(),
  /** False while marked Off; pickers label them, automatic assignment skips them. */
  available: z.boolean().optional(),
});
export const ProjectRef = z.object({ id: z.string(), name: z.string(), code: z.string() });
export const ProductRef = z.object({ id: z.string(), name: z.string() });

export const LeadListItem = z.object({
  id: z.string(),
  name: z.string(),
  phone: nullable,
  email: nullable,
  country: nullable,
  source: z.enum(LEAD_SOURCES),
  sourceDetail: nullable,
  stage: z.enum(LEAD_STAGES),
  temperature: z.enum(LEAD_TEMPERATURES),
  tags: z.array(z.string()),
  project: ProjectRef,
  owner: LeadOwnerRef.nullable(),
  courseTitle: nullable,
  batchName: nullable,
  nextFollowUpAt: nullable,
  lastActivityAt: nullable,
  lastContactedAt: nullable,
  createdAt: z.string(),
  studentId: nullable,
  lostReason: nullable,
  language: z.enum(LEAD_LANGUAGES).nullable(),
  jetaFxClientId: nullable,
  products: z.array(ProductRef),
});
export type LeadListItem = z.infer<typeof LeadListItem>;

export const LeadDto = LeadListItem.extend({
  preferredChannel: z.enum(LEAD_CHANNELS).nullable(),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).nullable(),
  courseInterestId: nullable,
  batchInterestId: nullable,
  ownerId: nullable,
  utm: z.object({ source: nullable, medium: nullable, campaign: nullable, content: nullable, term: nullable }),
  notes: nullable,
  score: z.number(),
  consent: z.object({ marketing: z.boolean(), marketingAt: nullable, whatsapp: z.boolean() }),
  qualification: z.object({ experience: nullable, occupation: nullable, purpose: nullable }),
  lostNote: nullable,
  stageChangedAt: nullable,
  firstContactedAt: nullable,
  convertedAt: nullable,
  enrollmentId: nullable,
  mergedIntoId: nullable,
  updatedAt: z.string(),
});
export type LeadDto = z.infer<typeof LeadDto>;

export const LeadActivityDto = z.object({
  id: z.string(),
  type: z.enum(LEAD_ACTIVITY_TYPES),
  direction: nullable,
  outcome: nullable,
  body: nullable,
  data: z.record(z.string(), z.unknown()),
  actorType: z.string(),
  actorName: nullable,
  createdAt: z.string(),
});
export type LeadActivityDto = z.infer<typeof LeadActivityDto>;

export const TaskDto = z.object({
  id: z.string(),
  project: ProjectRef,
  leadId: nullable,
  leadName: nullable,
  leadPhone: nullable,
  title: z.string(),
  description: nullable,
  type: z.enum(FOLLOWUP_TYPES),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(CRM_TASK_STATUSES),
  order: z.number(),
  dueAt: nullable,
  assignee: LeadOwnerRef.nullable(),
  createdBy: LeadOwnerRef.nullable(),
  completedAt: nullable,
  commentCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaskDto = z.infer<typeof TaskDto>;

export const ProductDto = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  description: nullable,
  status: z.enum(PRODUCT_STATUSES),
  isStudentCourse: z.boolean(),
  sortOrder: z.number(),
  conversionsMonth: z.number(),
  conversionsTotal: z.number(),
  createdAt: z.string(),
});
export type ProductDto = z.infer<typeof ProductDto>;

export const LeadConversionDto = z.object({
  id: z.string(),
  product: ProductRef,
  creditedTo: LeadOwnerRef.nullable(),
  convertedBy: LeadOwnerRef.nullable(),
  source: z.enum(CONVERSION_SOURCES),
  note: nullable,
  convertedAt: z.string(),
});
export type LeadConversionDto = z.infer<typeof LeadConversionDto>;

export const LeadDepositDto = z.object({
  id: z.string(),
  lead: z.object({ id: z.string(), name: z.string() }),
  creditedTo: LeadOwnerRef.nullable(),
  loggedBy: LeadOwnerRef.nullable(),
  sequence: z.enum(DEPOSIT_SEQUENCES),
  amountMinor: z.number(),
  currency: z.string(),
  /** YYYY-MM-DD */
  depositedAt: z.string(),
  jetaFxClientId: nullable,
  reference: nullable,
  note: nullable,
  status: z.enum(DEPOSIT_STATUSES),
  reviewedBy: LeadOwnerRef.nullable(),
  reviewedAt: nullable,
  rejectReason: nullable,
  /** Only for commission managers and the credited person; null until verified. */
  commissionPct: nullable,
  commissionMinor: z.number().nullable(),
  createdAt: z.string(),
  /** The viewer may delete it (still pending, and they logged it, are credited, or manage commission). */
  canDelete: z.boolean(),
});
export type LeadDepositDto = z.infer<typeof LeadDepositDto>;

export const DepositSummary = z.object({
  pendingCount: z.number(),
  pendingMinor: z.number(),
  verifiedCount: z.number(),
  verifiedMinor: z.number(),
  commissionMinor: z.number(),
});
export type DepositSummary = z.infer<typeof DepositSummary>;

export const DepositList = paged(LeadDepositDto).extend({
  summary: DepositSummary,
  /** The viewer sees everyone's deposits and may verify them. */
  manage: z.boolean(),
  staff: z.array(LeadOwnerRef),
});
export type DepositList = z.infer<typeof DepositList>;

export const CommissionSettingsDto = z.object({
  firstPct: z.number(),
  /** Sorted by `from` (USD); the first is the base rate from 0. */
  slabs: z.array(z.object({ from: z.number(), pct: z.number() })),
});
export type CommissionSettingsDto = z.infer<typeof CommissionSettingsDto>;

export const LeaderboardRow = z.object({
  rank: z.number(),
  id: z.string(),
  name: z.string(),
  conversions: z.number(),
  /** Conversions per product id. */
  byProduct: z.record(z.string(), z.number()),
  newLeads: z.number(),
  /** Of those new leads, how many converted (to anything). */
  convertedLeads: z.number(),
  conversionRate: z.number().nullable(),
  depositsMinor: z.number(),
  /** Only filled in for commission managers. */
  commissionMinor: z.number().nullable(),
  isMe: z.boolean(),
});
export type LeaderboardRow = z.infer<typeof LeaderboardRow>;

export const LeaderboardDto = z.object({
  period: z.enum(LEADERBOARD_PERIODS),
  products: z.array(ProductRef),
  rows: z.array(LeaderboardRow),
  showCommission: z.boolean(),
  /** The viewer's own figures for the period. */
  me: z.object({
    conversions: z.number(),
    depositsMinor: z.number(),
    commissionMinor: z.number(),
    pendingCount: z.number(),
    pendingMinor: z.number(),
  }),
});
export type LeaderboardDto = z.infer<typeof LeaderboardDto>;

export const StaffCommissionDto = z.object({
  commission: z.object({ month: z.number(), lastMonth: z.number(), all: z.number() }),
  deposits: z.object({ month: z.number(), all: z.number() }),
  pending: z.object({ count: z.number(), minor: z.number() }),
  conversions: z.object({ month: z.number(), all: z.number() }),
  recent: z.array(LeadDepositDto),
});
export type StaffCommissionDto = z.infer<typeof StaffCommissionDto>;

export const TaskCommentDto = z.object({ id: z.string(), body: z.string(), author: LeadOwnerRef.nullable(), createdAt: z.string() });
export type TaskCommentDto = z.infer<typeof TaskCommentDto>;

export const TaskDetail = z.object({
  task: TaskDto,
  comments: z.array(TaskCommentDto),
  assignees: z.array(LeadOwnerRef),
  canEdit: z.boolean(),
});
export type TaskDetail = z.infer<typeof TaskDetail>;

export const BoardDto = z.object({
  TODO: z.array(TaskDto),
  IN_PROGRESS: z.array(TaskDto),
  WAITING: z.array(TaskDto),
  DONE: z.array(TaskDto),
});
export type BoardDto = z.infer<typeof BoardDto>;

export const ProjectStats = z.object({ openLeads: z.number(), convertedMonth: z.number(), overdueTasks: z.number(), team: z.number() });

export const ProjectDto = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  description: nullable,
  status: z.enum(PROJECT_STATUSES),
  courseId: nullable,
  courseTitle: nullable,
  batchId: nullable,
  batchName: nullable,
  startDate: nullable,
  endDate: nullable,
  targetLeads: z.number().nullable(),
  targetConversions: z.number().nullable(),
  isDefault: z.boolean(),
  managers: z.array(LeadOwnerRef),
  members: z.array(LeadOwnerRef),
  stats: ProjectStats,
  /** The viewer may edit this project and its team (manager of it, or crm.projects.manage). */
  canManage: z.boolean(),
  createdAt: z.string(),
});
export type ProjectDto = z.infer<typeof ProjectDto>;

export const ProjectTeamMember = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(["manager", "member"]),
  roles: z.array(z.string()),
  openLeads: z.number(),
  convertedMonth: z.number(),
  overdueTasks: z.number(),
});

export const ProjectDetail = z.object({
  project: ProjectDto,
  byStage: z.record(z.string(), z.number()),
  team: z.array(ProjectTeamMember),
  recentLeads: z.array(LeadListItem),
  openTasks: z.array(TaskDto),
  options: z.object({
    courses: z.array(z.object({ id: z.string(), title: z.string() })),
    batches: z.array(z.object({ id: z.string(), label: z.string(), courseId: z.string() })),
    staff: z.array(LeadOwnerRef),
  }),
});
export type ProjectDetail = z.infer<typeof ProjectDetail>;

export const CrmOptions = z.object({
  /** Projects the viewer may create leads and tasks in; `canAssign` = may pick an owner other than themselves. */
  projects: z.array(ProjectRef.extend({ canAssign: z.boolean(), isDefault: z.boolean() })),
  /** Assignable staff per project id. */
  teams: z.record(z.string(), z.array(LeadOwnerRef)),
  /** Every CRM user (only for viewers who can set up project teams). */
  staff: z.array(LeadOwnerRef),
  courses: z.array(z.object({ id: z.string(), title: z.string() })),
  batches: z.array(z.object({ id: z.string(), label: z.string(), courseId: z.string() })),
  lostReasons: z.array(z.string()),
  /** Active products a lead can be converted to. */
  products: z.array(ProductRef),
});
export type CrmOptions = z.infer<typeof CrmOptions>;

export const LeadDetail = z.object({
  lead: LeadDto,
  activities: z.array(LeadActivityDto),
  /** All activities on the lead; `activities` holds the newest ones only. */
  activityTotal: z.number(),
  tasks: z.array(TaskDto),
  student: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      enrollment: z.object({ status: z.enum(ENROLLMENT_STATUSES), paymentState: z.enum(PAYMENT_STATES), batchName: z.string() }).nullable(),
    })
    .nullable(),
  /** An existing student with this phone or email that is not linked yet. */
  matchingStudent: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
  duplicates: z.array(z.object({ id: z.string(), name: z.string(), phone: nullable, email: nullable, stage: z.enum(LEAD_STAGES) })),
  conversions: z.array(LeadConversionDto),
  deposits: z.array(LeadDepositDto),
  /** What the viewer may do with this lead. */
  can: z.object({
    delete: z.boolean(),
    assign: z.boolean(),
    claim: z.boolean(),
    moveProject: z.boolean(),
    removeConversion: z.boolean(),
    reviewDeposits: z.boolean(),
  }),
  options: CrmOptions,
});
export type LeadDetail = z.infer<typeof LeadDetail>;

export const CrmDashboardDto = z.object({
  scopeAll: z.boolean(),
  slaHours: z.number(),
  byStage: z.record(z.string(), z.number()),
  openLeads: z.number(),
  newToday: z.number(),
  newWeek: z.number(),
  uncontactedOverSla: z.number(),
  overdueTasks: z.number(),
  dueToday: z.number(),
  convertedMonth: z.number(),
  lostMonth: z.number(),
  winRate90d: z.number().nullable(),
  medianResponseHours: z.number().nullable(),
  bySource: z.array(z.object({ source: z.string(), leads: z.number(), contacted: z.number(), converted: z.number(), paid: z.number() })),
  projects: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      open: z.number(),
      convertedMonth: z.number(),
      overdue: z.number(),
      targetConversions: z.number().nullable(),
    }),
  ),
  owners: z.array(z.object({ id: z.string(), name: z.string(), open: z.number(), overdue: z.number(), convertedMonth: z.number() })),
  /** Product conversions this month (Dubai), per active product. */
  byProduct: z.array(z.object({ id: z.string(), name: z.string(), month: z.number() })),
  myTasks: z.array(TaskDto),
});
export type CrmDashboardDto = z.infer<typeof CrmDashboardDto>;

export const CrmSettingsDto = z.object({
  followUpSlaHours: z.number(),
  staleAfterDays: z.number(),
  batchUrgencyDays: z.number(),
  roundRobin: z.boolean(),
  lostReasons: z.array(z.string()),
  webhookUrl: z.string(),
  webhookConfigured: z.boolean(),
  defaultProject: ProjectRef,
});
export type CrmSettingsDto = z.infer<typeof CrmSettingsDto>;

export const ImportPreviewDto = z.object({
  total: z.number(),
  valid: z.number(),
  duplicates: z.number(),
  invalid: z.number(),
  rows: z.array(
    z.object({
      row: z.number(),
      name: z.string(),
      phone: nullable,
      email: nullable,
      status: z.enum(["ok", "duplicate", "invalid"]),
      reason: nullable,
    }),
  ),
});
export type ImportPreviewDto = z.infer<typeof ImportPreviewDto>;

export const CrmStaffRow = StaffRow.extend({
  projects: z.array(z.object({ id: z.string(), name: z.string(), role: z.enum(["manager", "member"]) })),
  openLeads: z.number(),
});
export type CrmStaffRow = z.infer<typeof CrmStaffRow>;

// ---------------------------------------------------------------------------------------------
// Routes (internal, behind /api/v1; every one also needs crm.access)
// ---------------------------------------------------------------------------------------------

const base = "/api/v1/crm";
const taskFilters = z.object({
  project: z.string().optional(),
  assignee: z.string().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
});

export const crmRoutes = {
  dashboard: route({
    method: "GET",
    path: `${base}/dashboard`,
    query: z.object({ project: z.string().optional() }),
    response: CrmDashboardDto,
  }),
  options: route({ method: "GET", path: `${base}/options`, response: CrmOptions }),
  dueCount: route({ method: "GET", path: `${base}/tasks/count`, response: z.object({ count: z.number() }) }),

  leads: route({
    method: "GET",
    path: `${base}/leads`,
    query: LeadFilters,
    response: paged(LeadListItem),
  }),
  leadsCsv: route({ method: "GET", path: `${base}/leads.csv`, query: LeadFilters, response: z.string() }),
  create: route({ method: "POST", path: `${base}/leads`, body: LeadInput, response: z.object({ id: z.string() }) }),
  bulkAssign: route({
    method: "POST",
    path: `${base}/bulk-assign`,
    /** `ownerId`: a user id, "" to unassign, or ROUND_ROBIN for the project's sales executives. */
    body: BulkAssignInput,
    response: z.object({ ok: z.literal(true), updated: z.number(), skipped: z.number(), message: z.string().optional() }),
  }),
  bulkDelete: route({
    method: "POST",
    path: `${base}/bulk-delete`,
    body: BulkTarget,
    response: z.object({ ok: z.literal(true), deleted: z.number(), skipped: z.number() }),
  }),
  lead: route({
    method: "GET",
    path: `${base}/leads/:id`,
    params: idParam,
    query: z.object({ activity: z.coerce.number().int().min(1).max(1000).default(50) }),
    response: LeadDetail,
  }),
  deleteLead: route({ method: "POST", path: `${base}/leads/:id/delete`, params: idParam, response: zOk }),
  update: route({ method: "POST", path: `${base}/leads/:id`, params: idParam, body: LeadUpdateInput, response: zOk }),
  stage: route({ method: "POST", path: `${base}/leads/:id/stage`, params: idParam, body: StageInput, response: zOk }),
  assign: route({
    method: "POST",
    path: `${base}/leads/:id/assign`,
    params: idParam,
    body: z.object({ ownerId: z.string() }),
    response: zOk,
  }),
  claim: route({ method: "POST", path: `${base}/leads/:id/claim`, params: idParam, response: zOk }),
  moveProject: route({
    method: "POST",
    path: `${base}/leads/:id/project`,
    params: idParam,
    body: z.object({ projectId: z.string().min(1, "Choose a project") }),
    response: zOk,
  }),
  activity: route({ method: "POST", path: `${base}/leads/:id/activities`, params: idParam, body: ActivityInput, response: zOk }),
  convert: route({
    method: "POST",
    path: `${base}/leads/:id/convert`,
    params: idParam,
    body: z.object({ batchId: z.string().optional(), sendSetPassword: z.boolean().default(true) }),
    response: z.object({ ok: z.literal(true), studentId: z.string(), message: z.string() }),
  }),
  link: route({
    method: "POST",
    path: `${base}/leads/:id/link`,
    params: idParam,
    body: z.object({ studentId: z.string().min(1) }),
    response: zOk,
  }),
  resendWelcome: route({ method: "POST", path: `${base}/leads/:id/resend-welcome`, params: idParam, response: zOk }),
  /** Merge `fromId` into `:id` (the survivor). */
  merge: route({
    method: "POST",
    path: `${base}/leads/:id/merge`,
    params: idParam,
    body: z.object({ fromId: z.string().min(1) }),
    response: zOk,
  }),
  markConversions: route({ method: "POST", path: `${base}/leads/:id/conversions`, params: idParam, body: ConversionInput, response: zOk }),
  removeConversion: route({ method: "POST", path: `${base}/conversions/:id/delete`, params: idParam, response: zOk }),
  logDeposit: route({
    method: "POST",
    path: `${base}/leads/:id/deposits`,
    params: idParam,
    body: DepositInput,
    response: z.object({ id: z.string() }),
  }),
  deposits: route({ method: "GET", path: `${base}/deposits`, query: DepositFilters, response: DepositList }),
  verifyDeposit: route({ method: "POST", path: `${base}/deposits/:id/verify`, params: idParam, response: zOk }),
  rejectDeposit: route({
    method: "POST",
    path: `${base}/deposits/:id/reject`,
    params: idParam,
    body: z.object({ reason: z.string().trim().min(2, "Give a reason").max(300) }),
    response: zOk,
  }),
  deleteDeposit: route({ method: "POST", path: `${base}/deposits/:id/delete`, params: idParam, response: zOk }),
  leaderboard: route({ method: "GET", path: `${base}/leaderboard`, query: LeaderboardQuery, response: LeaderboardDto }),

  products: route({ method: "GET", path: `${base}/products`, response: z.array(ProductDto) }),
  createProduct: route({ method: "POST", path: `${base}/products`, body: ProductInput, response: z.object({ id: z.string() }) }),
  updateProduct: route({ method: "POST", path: `${base}/products/:id`, params: idParam, body: ProductInput.partial(), response: zOk }),

  board: route({ method: "GET", path: `${base}/board`, query: taskFilters, response: BoardDto }),
  tasks: route({
    method: "GET",
    path: `${base}/tasks`,
    query: taskFilters.extend({
      scope: z.enum(["mine", "all"]).default("mine"),
      status: z.enum(["open", "done"]).default("open"),
      ...zPage.shape,
    }),
    response: paged(TaskDto),
  }),
  createTask: route({ method: "POST", path: `${base}/tasks`, body: TaskInput, response: z.object({ id: z.string() }) }),
  task: route({ method: "GET", path: `${base}/tasks/:id`, params: idParam, response: TaskDetail }),
  updateTask: route({ method: "POST", path: `${base}/tasks/:id`, params: idParam, body: TaskUpdateInput, response: zOk }),
  moveTask: route({ method: "POST", path: `${base}/tasks/:id/move`, params: idParam, body: MoveTaskInput, response: zOk }),
  completeTask: route({
    method: "POST",
    path: `${base}/tasks/:id/complete`,
    params: idParam,
    body: z.object({ note: z.string().trim().max(2000).optional(), outcome: optEnum(CALL_OUTCOMES), nextFollowUpAt: optLocalDateTime }),
    response: zOk,
  }),
  cancelTask: route({ method: "POST", path: `${base}/tasks/:id/cancel`, params: idParam, response: zOk }),
  rescheduleTask: route({
    method: "POST",
    path: `${base}/tasks/:id/reschedule`,
    params: idParam,
    body: z.object({ dueAt: optLocalDateTime }),
    response: zOk,
  }),
  commentTask: route({ method: "POST", path: `${base}/tasks/:id/comments`, params: idParam, body: TaskCommentInput, response: zOk }),

  projects: route({
    method: "GET",
    path: `${base}/projects`,
    query: z.object({ status: z.enum(PROJECT_STATUSES).optional() }),
    response: z.array(ProjectDto),
  }),
  createProject: route({ method: "POST", path: `${base}/projects`, body: ProjectInput, response: z.object({ id: z.string() }) }),
  project: route({ method: "GET", path: `${base}/projects/:id`, params: idParam, response: ProjectDetail }),
  updateProject: route({ method: "POST", path: `${base}/projects/:id`, params: idParam, body: ProjectInput.partial(), response: zOk }),
  projectMember: route({ method: "POST", path: `${base}/projects/:id/members`, params: idParam, body: ProjectMemberInput, response: zOk }),
  removeProjectMember: route({
    method: "POST",
    path: `${base}/projects/:id/members/remove`,
    params: idParam,
    body: z.object({ userId: z.string().min(1) }),
    response: zOk,
  }),

  team: route({ method: "GET", path: `${base}/team`, response: z.array(CrmStaffRow) }),
  createStaff: route({
    method: "POST",
    path: `${base}/team`,
    body: CrmStaffCreateInput,
    response: z.object({ id: z.string(), tempPassword: z.string().optional() }),
  }),
  staff: route({ method: "GET", path: `${base}/team/:id`, params: idParam, response: CrmStaffRow }),
  updateStaff: route({ method: "POST", path: `${base}/team/:id`, params: idParam, body: StaffUpdateInput, response: zOk }),
  setStaffDisabled: route({
    method: "POST",
    path: `${base}/team/:id/disabled`,
    params: idParam,
    body: z.object({ disabled: z.boolean() }),
    response: zOk,
  }),
  setStaffAvailable: route({
    method: "POST",
    path: `${base}/team/:id/available`,
    params: idParam,
    body: z.object({ available: z.boolean() }),
    response: zOk,
  }),
  resetStaffPassword: route({
    method: "POST",
    path: `${base}/team/:id/reset-password`,
    params: idParam,
    response: z.object({ ok: z.literal(true), tempPassword: z.string() }),
  }),
  staffCommission: route({ method: "GET", path: `${base}/team/:id/commission`, params: idParam, response: StaffCommissionDto }),
  roles: route({ method: "GET", path: `${base}/roles`, response: z.array(RoleDto) }),
  saveRole: route({ method: "POST", path: `${base}/roles`, body: CrmRoleInput, response: z.object({ id: z.string() }) }),

  settings: route({ method: "GET", path: `${base}/settings`, response: CrmSettingsDto }),
  saveSettings: route({ method: "POST", path: `${base}/settings`, body: CrmSettingsInput, response: zOk }),
  commissionSettings: route({ method: "GET", path: `${base}/commission`, response: CommissionSettingsDto }),
  saveCommissionSettings: route({ method: "POST", path: `${base}/commission`, body: CommissionSettingsInput, response: zOk }),

  importPreview: route({
    method: "POST",
    path: `${base}/import/preview`,
    body: z.object({
      csv: z.string().min(1, "Paste or upload a CSV").max(2_000_000),
      defaultCountry: z.union([z.literal(""), zCountry]).optional(),
    }),
    response: ImportPreviewDto,
  }),
  importCsv: route({
    method: "POST",
    path: `${base}/import`,
    body: z.object({
      csv: z.string().min(1).max(2_000_000),
      projectId: z.string().min(1, "Choose a project"),
      source: z.enum(LEAD_SOURCES).default("IMPORT"),
      /** A user id, or ROUND_ROBIN to spread the rows across the project's sales executives. */
      ownerId: z.string().optional(),
      defaultCountry: z.union([z.literal(""), zCountry]).optional(),
    }),
    response: z.object({
      ok: z.literal(true),
      created: z.number(),
      skipped: z.number(),
      invalid: z.number(),
      message: z.string().optional(),
    }),
  }),
};
