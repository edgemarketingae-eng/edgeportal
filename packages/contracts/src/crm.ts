import { z } from "zod";
import {
  ACTIVITY_DIRECTIONS,
  CALL_OUTCOMES,
  CRM_TASK_STATUSES,
  EXPERIENCE_LEVELS,
  FOLLOWUP_TYPES,
  LEAD_ACTIVITY_TYPES,
  LEAD_CHANNELS,
  LEAD_SOURCES,
  LEAD_STAGES,
  LEAD_TEMPERATURES,
  LEAD_TOUCH_TYPES,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
} from "@edge/domain/crm/enums";
import { ENROLLMENT_STATUSES, PAYMENT_STATES } from "@edge/domain/enums";
import { zEmail, zOk } from "./common";
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
  due: z.enum(["overdue", "today", "week", "none"]).optional(),
  created: z.enum(["today", "week", "month"]).optional(),
  /** Default "open" hides CONVERTED and LOST unless a stage filter is given. */
  view: z.enum(["open", "all"]).optional(),
  sort: z.enum(["recent", "created", "followUp", "name"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(10000).default(100),
});
export type LeadFilters = z.input<typeof LeadFilters>;

export const LeadFields = z.object({
  projectId: z.string().min(1, "Choose a project"),
  name: z.string().trim().min(2, "Enter a name").max(80),
  phone: z.string().trim().max(30).optional(),
  email: z.union([z.literal(""), zEmail()]).optional(),
  country: z.string().trim().toUpperCase().max(2).optional(),
  source: z.enum(LEAD_SOURCES),
  sourceDetail: z.string().trim().max(200).optional(),
  courseInterestId: z.string().optional(),
  batchInterestId: z.string().optional(),
  experienceLevel: optEnum(EXPERIENCE_LEVELS),
  temperature: optEnum(LEAD_TEMPERATURES),
  preferredChannel: optEnum(LEAD_CHANNELS),
  language: z.string().trim().max(20).optional(),
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
export const MoveTaskInput = z.object({ status: z.enum(CRM_TASK_STATUSES), orderedIds: z.array(z.string()).max(200).default([]) });
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

export const CrmStaffCreateInput = StaffCreateInput.extend({ projectIds: z.array(z.string()).optional() });
export const CrmRoleInput = z.object({ id: z.string().optional(), name: z.string().trim().min(2, "Enter a role name"), description: z.string().optional(), permissions: z.array(z.string()) });

// ---------------------------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------------------------

export const LeadOwnerRef = z.object({ id: z.string(), name: z.string() });
export const ProjectRef = z.object({ id: z.string(), name: z.string(), code: z.string() });

export const LeadListItem = z.object({
  id: z.string(),
  name: z.string(),
  phone: nullable,
  email: nullable,
  country: z.string(),
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
});
export type LeadListItem = z.infer<typeof LeadListItem>;

export const LeadDto = LeadListItem.extend({
  language: nullable,
  preferredChannel: z.enum(LEAD_CHANNELS).nullable(),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).nullable(),
  courseInterestId: nullable,
  batchInterestId: nullable,
  ownerId: nullable,
  utm: z.object({ source: nullable, medium: nullable, campaign: nullable, content: nullable, term: nullable }),
  notes: nullable,
  score: z.number(),
  consent: z.object({ marketing: z.boolean(), marketingAt: nullable, whatsapp: z.boolean() }),
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

export const TaskCommentDto = z.object({ id: z.string(), body: z.string(), author: LeadOwnerRef.nullable(), createdAt: z.string() });
export type TaskCommentDto = z.infer<typeof TaskCommentDto>;

export const TaskDetail = z.object({ task: TaskDto, comments: z.array(TaskCommentDto), assignees: z.array(LeadOwnerRef), canEdit: z.boolean() });
export type TaskDetail = z.infer<typeof TaskDetail>;

export const BoardDto = z.object({ TODO: z.array(TaskDto), IN_PROGRESS: z.array(TaskDto), WAITING: z.array(TaskDto), DONE: z.array(TaskDto) });
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

export const ProjectTeamMember = z.object({ id: z.string(), name: z.string(), email: z.string(), role: z.enum(["manager", "member"]), roles: z.array(z.string()), openLeads: z.number(), convertedMonth: z.number(), overdueTasks: z.number() });

export const ProjectDetail = z.object({
  project: ProjectDto,
  byStage: z.record(z.string(), z.number()),
  team: z.array(ProjectTeamMember),
  recentLeads: z.array(LeadListItem),
  openTasks: z.array(TaskDto),
  options: z.object({ courses: z.array(z.object({ id: z.string(), title: z.string() })), batches: z.array(z.object({ id: z.string(), label: z.string(), courseId: z.string() })), staff: z.array(LeadOwnerRef) }),
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
});
export type CrmOptions = z.infer<typeof CrmOptions>;

export const LeadDetail = z.object({
  lead: LeadDto,
  activities: z.array(LeadActivityDto),
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
  /** What the viewer may do with this lead. */
  can: z.object({ assign: z.boolean(), claim: z.boolean(), moveProject: z.boolean() }),
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
  projects: z.array(z.object({ id: z.string(), name: z.string(), open: z.number(), convertedMonth: z.number(), overdue: z.number(), targetConversions: z.number().nullable() })),
  owners: z.array(z.object({ id: z.string(), name: z.string(), open: z.number(), overdue: z.number(), convertedMonth: z.number() })),
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
  rows: z.array(z.object({ row: z.number(), name: z.string(), phone: nullable, email: nullable, status: z.enum(["ok", "duplicate", "invalid"]), reason: nullable })),
});
export type ImportPreviewDto = z.infer<typeof ImportPreviewDto>;

export const CrmStaffRow = StaffRow.extend({ projects: z.array(z.object({ id: z.string(), name: z.string(), role: z.enum(["manager", "member"]) })), openLeads: z.number() });
export type CrmStaffRow = z.infer<typeof CrmStaffRow>;

// ---------------------------------------------------------------------------------------------
// Routes (internal, behind /api/v1; every one also needs crm.access)
// ---------------------------------------------------------------------------------------------

const base = "/api/v1/crm";
const taskFilters = z.object({ project: z.string().optional(), assignee: z.string().optional(), priority: z.enum(TASK_PRIORITIES).optional() });

export const crmRoutes = {
  dashboard: route({ method: "GET", path: `${base}/dashboard`, query: z.object({ project: z.string().optional() }), response: CrmDashboardDto }),
  options: route({ method: "GET", path: `${base}/options`, response: CrmOptions }),
  dueCount: route({ method: "GET", path: `${base}/tasks/count`, response: z.object({ count: z.number() }) }),

  leads: route({ method: "GET", path: `${base}/leads`, query: LeadFilters, response: z.object({ rows: z.array(LeadListItem), total: z.number() }) }),
  leadsCsv: route({ method: "GET", path: `${base}/leads.csv`, query: LeadFilters, response: z.string() }),
  create: route({ method: "POST", path: `${base}/leads`, body: LeadInput, response: z.object({ id: z.string() }) }),
  bulkAssign: route({ method: "POST", path: `${base}/bulk-assign`, body: z.object({ ids: z.array(z.string()).min(1, "Select at least one lead"), ownerId: z.string() }), response: z.object({ ok: z.literal(true), updated: z.number(), message: z.string().optional() }) }),
  lead: route({ method: "GET", path: `${base}/leads/:id`, params: idParam, response: LeadDetail }),
  update: route({ method: "POST", path: `${base}/leads/:id`, params: idParam, body: LeadUpdateInput, response: zOk }),
  stage: route({ method: "POST", path: `${base}/leads/:id/stage`, params: idParam, body: StageInput, response: zOk }),
  assign: route({ method: "POST", path: `${base}/leads/:id/assign`, params: idParam, body: z.object({ ownerId: z.string() }), response: zOk }),
  claim: route({ method: "POST", path: `${base}/leads/:id/claim`, params: idParam, response: zOk }),
  moveProject: route({ method: "POST", path: `${base}/leads/:id/project`, params: idParam, body: z.object({ projectId: z.string().min(1, "Choose a project") }), response: zOk }),
  activity: route({ method: "POST", path: `${base}/leads/:id/activities`, params: idParam, body: ActivityInput, response: zOk }),
  convert: route({
    method: "POST",
    path: `${base}/leads/:id/convert`,
    params: idParam,
    body: z.object({ batchId: z.string().optional(), sendSetPassword: z.boolean().default(true) }),
    response: z.object({ ok: z.literal(true), studentId: z.string(), message: z.string() }),
  }),
  link: route({ method: "POST", path: `${base}/leads/:id/link`, params: idParam, body: z.object({ studentId: z.string().min(1) }), response: zOk }),
  resendWelcome: route({ method: "POST", path: `${base}/leads/:id/resend-welcome`, params: idParam, response: zOk }),
  /** Merge `fromId` into `:id` (the survivor). */
  merge: route({ method: "POST", path: `${base}/leads/:id/merge`, params: idParam, body: z.object({ fromId: z.string().min(1) }), response: zOk }),

  board: route({ method: "GET", path: `${base}/board`, query: taskFilters, response: BoardDto }),
  tasks: route({
    method: "GET",
    path: `${base}/tasks`,
    query: taskFilters.extend({ scope: z.enum(["mine", "all"]).default("mine"), status: z.enum(["open", "done"]).default("open") }),
    response: z.array(TaskDto),
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
  rescheduleTask: route({ method: "POST", path: `${base}/tasks/:id/reschedule`, params: idParam, body: z.object({ dueAt: optLocalDateTime }), response: zOk }),
  commentTask: route({ method: "POST", path: `${base}/tasks/:id/comments`, params: idParam, body: TaskCommentInput, response: zOk }),

  projects: route({ method: "GET", path: `${base}/projects`, query: z.object({ status: z.enum(PROJECT_STATUSES).optional() }), response: z.array(ProjectDto) }),
  createProject: route({ method: "POST", path: `${base}/projects`, body: ProjectInput, response: z.object({ id: z.string() }) }),
  project: route({ method: "GET", path: `${base}/projects/:id`, params: idParam, response: ProjectDetail }),
  updateProject: route({ method: "POST", path: `${base}/projects/:id`, params: idParam, body: ProjectInput.partial(), response: zOk }),
  projectMember: route({ method: "POST", path: `${base}/projects/:id/members`, params: idParam, body: ProjectMemberInput, response: zOk }),
  removeProjectMember: route({ method: "POST", path: `${base}/projects/:id/members/remove`, params: idParam, body: z.object({ userId: z.string().min(1) }), response: zOk }),

  team: route({ method: "GET", path: `${base}/team`, response: z.array(CrmStaffRow) }),
  createStaff: route({ method: "POST", path: `${base}/team`, body: CrmStaffCreateInput, response: z.object({ id: z.string(), tempPassword: z.string().optional() }) }),
  staff: route({ method: "GET", path: `${base}/team/:id`, params: idParam, response: CrmStaffRow }),
  updateStaff: route({ method: "POST", path: `${base}/team/:id`, params: idParam, body: StaffUpdateInput, response: zOk }),
  setStaffDisabled: route({ method: "POST", path: `${base}/team/:id/disabled`, params: idParam, body: z.object({ disabled: z.boolean() }), response: zOk }),
  resetStaffPassword: route({ method: "POST", path: `${base}/team/:id/reset-password`, params: idParam, response: z.object({ ok: z.literal(true), tempPassword: z.string() }) }),
  roles: route({ method: "GET", path: `${base}/roles`, response: z.array(RoleDto) }),
  saveRole: route({ method: "POST", path: `${base}/roles`, body: CrmRoleInput, response: z.object({ id: z.string() }) }),

  settings: route({ method: "GET", path: `${base}/settings`, response: CrmSettingsDto }),
  saveSettings: route({ method: "POST", path: `${base}/settings`, body: CrmSettingsInput, response: zOk }),

  importPreview: route({ method: "POST", path: `${base}/import/preview`, body: z.object({ csv: z.string().min(1, "Paste or upload a CSV").max(2_000_000) }), response: ImportPreviewDto }),
  importCsv: route({
    method: "POST",
    path: `${base}/import`,
    body: z.object({ csv: z.string().min(1).max(2_000_000), projectId: z.string().min(1, "Choose a project"), source: z.enum(LEAD_SOURCES).default("IMPORT"), ownerId: z.string().optional() }),
    response: z.object({ ok: z.literal(true), created: z.number(), skipped: z.number(), invalid: z.number(), message: z.string().optional() }),
  }),
};
