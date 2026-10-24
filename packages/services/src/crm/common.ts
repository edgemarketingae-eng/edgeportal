import type { LeadActivityDto, LeadDto, LeadListItem, TaskDto } from "@edge/contracts";
import {
  AuthUser,
  CrmTask,
  DbNotFoundError,
  Enrollment,
  Lead,
  LeadActivity,
  lockForUpdate,
  Project,
  StaffProfile,
  StudentProfile,
  TaskComment,
  Types,
  type CrmTaskDoc,
  type LeadActivityDoc,
  type LeadDoc,
} from "@edge/db";
import {
  LEAD_CONTACT_TYPES,
  OPEN_TASK_STATUSES,
  type CallOutcome,
  type FollowUpType,
  type LeadActivityType,
  type LeadChannel,
  type LeadTouchType,
  type TaskPriority,
} from "@edge/domain/crm/enums";
import { fromDubaiLocal } from "@edge/domain/dates";
import type { Actor } from "@edge/domain/enums";
import { parsePhone } from "@edge/domain/phone";
import { env } from "../env";
import { NotFoundError, ValidationError } from "../errors";
import { iso } from "../mappers";
import { assertLeadVisible, type CrmScope } from "./scope";

/** Absolute links into the CRM app (notifications and emails may be read from any app). */
export const leadHref = (id: Types.ObjectId | string) => `${env.CRM_APP_URL}/leads/${id}`;
export const taskHref = (id: Types.ObjectId | string) => `${env.CRM_APP_URL}/tasks/${id}`;
export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Empty -> null; otherwise a valid E.164 number or a field error. */
export function normalizePhone(input: string | null | undefined, country?: string | null, field = "phone"): string | null {
  const v = (input ?? "").trim();
  if (!v) return null;
  const p = parsePhone(v, country);
  if (!p) throw new ValidationError({ [field]: "Enter a valid mobile number with its country code, e.g. +44 7400 123456" });
  return p.e164;
}

export function normalizeEmail(input: string | null | undefined): string | null {
  const v = (input ?? "").trim().toLowerCase();
  return v || null;
}

/** datetime-local string (Dubai wall clock) -> instant; empty -> null. */
export function localDate(input: string | null | undefined, field: string): Date | null {
  if (!input) return null;
  const d = fromDubaiLocal(input);
  if (!d) throw new ValidationError({ [field]: "Choose a valid date and time" });
  return d;
}

export const optId = (v: string | null | undefined) => (v && Types.ObjectId.isValid(v) && v.length === 24 ? new Types.ObjectId(v) : null);
export const actorId = (actor: Actor) => (actor.type === "USER" ? new Types.ObjectId(actor.id) : null);

export const channelToTaskType = (c: LeadChannel | string | null | undefined): FollowUpType =>
  c === "WHATSAPP" || c === "EMAIL" ? c : "CALL";
export const touchToTaskType = (t: LeadTouchType): FollowUpType => (t === "NOTE" ? "CALL" : t);
export const taskToTouchType = (t: FollowUpType): LeadTouchType => (t === "OTHER" ? "NOTE" : t);
export const isOpenTask = (status: string) => (OPEN_TASK_STATUSES as readonly string[]).includes(status);

export async function userNames(ids: (string | Types.ObjectId | null | undefined)[]) {
  const valid = [...new Set(ids.filter((x): x is string | Types.ObjectId => !!x && Types.ObjectId.isValid(String(x))).map(String))].map(
    (x) => new Types.ObjectId(x),
  );
  if (!valid.length) return new Map<string, string>();
  const users = await AuthUser.find({ _id: { $in: valid } }, { name: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), u.name]));
}

export async function loadLead(id: string | Types.ObjectId, scope?: CrmScope): Promise<LeadDoc> {
  const _id = typeof id === "string" ? optId(id) : id;
  const lead = _id ? await Lead.findById(_id).lean() : null;
  if (!lead) throw new NotFoundError("Lead");
  if (scope) assertLeadVisible(lead, scope);
  return lead as LeadDoc;
}

/** Lock a live (non-merged) lead inside withTx; the extra filter lets callers guard a state. */
export async function lockLead(_id: Types.ObjectId, extra: Record<string, unknown> = {}): Promise<LeadDoc> {
  try {
    return await lockForUpdate<LeadDoc>(Lead, { _id, mergedIntoId: null, ...extra });
  } catch (e) {
    if (e instanceof DbNotFoundError) throw new NotFoundError("Lead");
    throw e;
  }
}

/** Other live leads sharing this phone or email (across every project: duplicates are global). */
export async function findDuplicateLeads(contact: { phone: string | null; email: string | null }, excludeId?: Types.ObjectId) {
  const or: Record<string, unknown>[] = [];
  if (contact.phone) or.push({ phone: contact.phone });
  if (contact.email) or.push({ email: contact.email });
  if (!or.length) return [];
  return Lead.find({ mergedIntoId: null, $or: or, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
}

export interface MatchedAccount {
  kind: "student" | "staff";
  id: Types.ObjectId;
  name: string;
  email: string;
  enrollmentId: Types.ObjectId | null;
}

/** An existing portal account with this phone or email (verified phone, pending phone, or email). */
export async function findAccountByContact(contact: { phone: string | null; email: string | null }): Promise<MatchedAccount | null> {
  const or: Record<string, unknown>[] = [];
  if (contact.phone) or.push({ phoneNumber: contact.phone });
  if (contact.email) or.push({ email: contact.email });
  let user = or.length ? await AuthUser.findOne({ $or: or }, { name: 1, email: 1 }).lean() : null;
  if (!user && contact.phone) {
    const pending = await StudentProfile.findOne({ pendingPhone: contact.phone }, { _id: 1 }).lean();
    if (pending) user = await AuthUser.findById(pending._id, { name: 1, email: 1 }).lean();
  }
  if (!user) return null;
  if (await StudentProfile.exists({ _id: user._id })) {
    const e = await Enrollment.findOne({ studentId: user._id, isCurrent: true }, { _id: 1 }).lean();
    return { kind: "student", id: user._id, name: user.name, email: user.email, enrollmentId: e?._id ?? null };
  }
  if (await StaffProfile.exists({ _id: user._id }))
    return { kind: "staff", id: user._id, name: user.name, email: user.email, enrollmentId: null };
  return null;
}

/** Append a timeline entry (joins the surrounding transaction). */
export async function recordActivity(
  leadId: Types.ObjectId,
  type: LeadActivityType,
  actor: Actor,
  opts: { body?: string | null; outcome?: string | null; direction?: string | null; data?: Record<string, unknown> } = {},
) {
  const [doc] = await LeadActivity.create([
    {
      leadId,
      type,
      body: opts.body ?? null,
      outcome: (opts.outcome || null) as CallOutcome | null,
      direction: (opts.direction || null) as "IN" | "OUT" | null,
      data: opts.data ?? {},
      actorType: actor.type,
      actorId: actor.id ?? null,
    },
  ]);
  return doc!;
}

/** Lead fields to update after a logged touch; auto-advances NEW -> CONTACTED on the first real contact. */
export function touchPatch(lead: Pick<LeadDoc, "stage" | "firstContactedAt">, type: LeadTouchType, at: Date) {
  const set: Record<string, unknown> = { lastActivityAt: at };
  let autoStage: "CONTACTED" | null = null;
  if ((LEAD_CONTACT_TYPES as readonly string[]).includes(type)) {
    set.lastContactedAt = at;
    if (!lead.firstContactedAt) set.firstContactedAt = at;
    if (lead.stage === "NEW") {
      autoStage = "CONTACTED";
      set.stage = "CONTACTED";
      set.stageChangedAt = at;
    }
  }
  return { set, autoStage };
}

/** Keep lead.nextFollowUpAt = earliest open task with a due date (joins the surrounding transaction). */
export async function recomputeNextFollowUp(leadId: Types.ObjectId) {
  const next = await CrmTask.findOne({ leadId, status: { $in: [...OPEN_TASK_STATUSES] }, dueAt: { $ne: null } }, { dueAt: 1 })
    .sort({ dueAt: 1 })
    .lean();
  await Lead.updateOne({ _id: leadId }, { $set: { nextFollowUpAt: next?.dueAt ?? null } });
}

export interface TaskTarget {
  projectId: Types.ObjectId;
  leadId: Types.ObjectId | null;
  /** Used when the task input names no assignee: the lead's owner, else the actor. */
  defaultAssigneeId: Types.ObjectId | null;
}

/** Create a task at the end of the project's To-do column; records TASK_CREATED on the lead when there is one. */
export async function createTaskInTx(
  target: TaskTarget,
  t: {
    title: string;
    type: FollowUpType;
    priority?: TaskPriority;
    description?: string | null;
    dueAt: Date | null;
    assigneeId?: Types.ObjectId | null;
    autoKey?: string | null;
  },
  actor: Actor,
) {
  const assigneeId = t.assigneeId !== undefined ? t.assigneeId : (target.defaultAssigneeId ?? actorId(actor));
  const last = await CrmTask.findOne({ projectId: target.projectId, status: "TODO" }, { order: 1 }).sort({ order: -1 }).lean();
  const [task] = await CrmTask.create([
    {
      projectId: target.projectId,
      leadId: target.leadId,
      assigneeId,
      type: t.type,
      priority: t.priority ?? "MEDIUM",
      status: "TODO",
      order: (last?.order ?? -1) + 1,
      title: t.title,
      description: t.description ?? null,
      dueAt: t.dueAt,
      autoKey: t.autoKey ?? null,
      createdById: actorId(actor),
    },
  ]);
  if (target.leadId) {
    await recordActivity(target.leadId, "TASK_CREATED", actor, {
      data: { taskId: String(task!._id), title: t.title, type: t.type, dueAt: t.dueAt?.toISOString() ?? null, auto: !!t.autoKey },
    });
    await recomputeNextFollowUp(target.leadId);
  }
  return task!;
}

// ---------------------------------------------------------------------------------------------
// DTO mappers
// ---------------------------------------------------------------------------------------------

export interface LeadRefs {
  owners: Map<string, string>;
  courses: Map<string, string>;
  batches: Map<string, string>;
  projects: Map<string, { name: string; code: string }>;
}

export function toLeadListItem(l: LeadDoc, refs: LeadRefs): LeadListItem {
  const project = refs.projects.get(String(l.projectId));
  return {
    id: String(l._id),
    name: l.name,
    phone: l.phone ?? null,
    email: l.email ?? null,
    country: l.country ?? null,
    source: l.source,
    sourceDetail: l.sourceDetail ?? null,
    stage: l.stage,
    temperature: l.temperature,
    tags: l.tags ?? [],
    project: { id: String(l.projectId), name: project?.name ?? "Unknown project", code: project?.code ?? "" },
    owner: l.ownerId ? { id: String(l.ownerId), name: refs.owners.get(String(l.ownerId)) ?? "Unknown" } : null,
    courseTitle: l.courseInterestId ? (refs.courses.get(String(l.courseInterestId)) ?? null) : null,
    batchName: l.batchInterestId ? (refs.batches.get(String(l.batchInterestId)) ?? null) : null,
    nextFollowUpAt: iso(l.nextFollowUpAt),
    lastActivityAt: iso(l.lastActivityAt),
    lastContactedAt: iso(l.lastContactedAt),
    createdAt: iso(l.createdAt)!,
    studentId: l.studentId ? String(l.studentId) : null,
    lostReason: l.lostReason ?? null,
  };
}

export function toLeadDto(l: LeadDoc, refs: LeadRefs): LeadDto {
  return {
    ...toLeadListItem(l, refs),
    language: l.language ?? null,
    preferredChannel: (l.preferredChannel as LeadDto["preferredChannel"]) ?? null,
    experienceLevel: (l.experienceLevel as LeadDto["experienceLevel"]) ?? null,
    courseInterestId: l.courseInterestId ? String(l.courseInterestId) : null,
    batchInterestId: l.batchInterestId ? String(l.batchInterestId) : null,
    ownerId: l.ownerId ? String(l.ownerId) : null,
    utm: {
      source: l.utm?.source ?? null,
      medium: l.utm?.medium ?? null,
      campaign: l.utm?.campaign ?? null,
      content: l.utm?.content ?? null,
      term: l.utm?.term ?? null,
    },
    notes: l.notes ?? null,
    score: l.score ?? 0,
    consent: { marketing: !!l.consent?.marketing, marketingAt: iso(l.consent?.marketingAt), whatsapp: !!l.consent?.whatsapp },
    lostNote: l.lostNote ?? null,
    stageChangedAt: iso(l.stageChangedAt),
    firstContactedAt: iso(l.firstContactedAt),
    convertedAt: iso(l.convertedAt),
    enrollmentId: l.enrollmentId ? String(l.enrollmentId) : null,
    mergedIntoId: l.mergedIntoId ? String(l.mergedIntoId) : null,
    updatedAt: iso(l.updatedAt) ?? iso(l.createdAt)!,
  };
}

export function toActivityDto(a: LeadActivityDoc, names: Map<string, string>): LeadActivityDto {
  return {
    id: String(a._id),
    type: a.type,
    direction: a.direction ?? null,
    outcome: a.outcome ?? null,
    body: a.body ?? null,
    data: (a.data ?? {}) as Record<string, unknown>,
    actorType: a.actorType,
    actorName: a.actorType === "USER" && a.actorId ? (names.get(a.actorId) ?? null) : null,
    createdAt: iso(a.createdAt)!,
  };
}

/** Project names/codes for a set of ids. */
export async function projectRefs(ids: (Types.ObjectId | string | null | undefined)[]) {
  const valid = [...new Set(ids.filter((x): x is Types.ObjectId | string => !!x).map(String))].map((x) => new Types.ObjectId(x));
  if (!valid.length) return new Map<string, { name: string; code: string }>();
  const rows = await Project.find({ _id: { $in: valid } }, { name: 1, code: 1 }).lean();
  return new Map(rows.map((p) => [String(p._id), { name: p.name, code: p.code }]));
}

/** Tasks -> DTOs with project, lead, people and comment counts resolved in four queries. */
export async function tasksToDtos(tasks: CrmTaskDoc[]): Promise<TaskDto[]> {
  if (!tasks.length) return [];
  const leadIds = [...new Set(tasks.filter((t) => t.leadId).map((t) => String(t.leadId)))].map((x) => new Types.ObjectId(x));
  const [projects, leads, names, counts] = await Promise.all([
    projectRefs(tasks.map((t) => t.projectId)),
    leadIds.length ? Lead.find({ _id: { $in: leadIds } }, { name: 1, phone: 1 }).lean() : [],
    userNames([...tasks.map((t) => t.assigneeId), ...tasks.map((t) => t.createdById)]),
    TaskComment.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { taskId: { $in: tasks.map((t) => t._id) } } },
      { $group: { _id: "$taskId", n: { $sum: 1 } } },
    ]),
  ]);
  const leadMap = new Map(leads.map((l) => [String(l._id), { name: l.name, phone: l.phone ?? null }]));
  const countMap = new Map(counts.map((c) => [String(c._id), c.n]));
  const ref = (id: Types.ObjectId | null | undefined) => (id ? { id: String(id), name: names.get(String(id)) ?? "Unknown" } : null);
  return tasks.map((t) => {
    const project = projects.get(String(t.projectId));
    const lead = t.leadId ? leadMap.get(String(t.leadId)) : undefined;
    return {
      id: String(t._id),
      project: { id: String(t.projectId), name: project?.name ?? "Unknown project", code: project?.code ?? "" },
      leadId: t.leadId ? String(t.leadId) : null,
      leadName: lead?.name ?? null,
      leadPhone: lead?.phone ?? null,
      title: t.title,
      description: t.description ?? null,
      type: t.type,
      priority: t.priority,
      status: t.status,
      order: t.order ?? 0,
      dueAt: iso(t.dueAt),
      assignee: ref(t.assigneeId),
      createdBy: ref(t.createdById),
      completedAt: iso(t.completedAt),
      commentCount: countMap.get(String(t._id)) ?? 0,
      createdAt: iso(t.createdAt)!,
      updatedAt: iso(t.updatedAt) ?? iso(t.createdAt)!,
    };
  });
}
