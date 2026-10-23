import type { CrmOptions, LeadDetail, LeadFilters, LeadInput, LeadListItem, LeadUpdateInput } from "@edge/contracts";
import { AuthUser, Batch, Course, CrmTask, isDuplicateKey, Lead, LeadActivity, Project, Types, withTx, type LeadDoc, type ProjectDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import { OPEN_LEAD_STAGES, OPEN_TASK_STATUSES, type LeadStage } from "@edge/domain/crm/enums";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS, LEAD_TEMPERATURE_LABELS } from "@edge/domain/crm/labels";
import { canTransition, parseTags, stageIndex } from "@edge/domain/crm/machine";
import { toCsv } from "@edge/domain/csv";
import { dubaiDateString, formatDate, formatDateTime, startOfDubaiDay } from "@edge/domain/dates";
import type { Actor } from "@edge/domain/enums";
import { parsePhone } from "@edge/domain/phone";
import { audit } from "../audit";
import { getCurrentEnrollment } from "../enrollment/service";
import { BusinessError, NotFoundError, TransitionError, ValidationError } from "../errors";
import { oid } from "../ids";
import { notifyUser } from "../notifications/in-app";
import { flushOutbox } from "../runtime";
import { getSetting } from "../settings";
import {
  actorId,
  channelToTaskType,
  createTaskInTx,
  escapeRegex,
  findAccountByContact,
  findDuplicateLeads,
  leadHref,
  loadLead,
  localDate,
  lockLead,
  normalizeEmail,
  normalizePhone,
  optId,
  projectRefs,
  recomputeNextFollowUp,
  recordActivity,
  toActivityDto,
  toLeadDto,
  toLeadListItem,
  tasksToDtos,
  userNames,
  type LeadRefs,
} from "./common";
import { assertAssignable, assertLeadVisible, canAssignIn, canClaim, getDefaultProject, has, inProject, listCrmUsers, managesProject, projectTeam, projectsFor, leadScopeFilter, type CrmScope } from "./scope";

export interface CreateLeadOptions {
  inboundEventId?: Types.ObjectId | null;
  utm?: { source?: string | null; medium?: string | null; campaign?: string | null; content?: string | null; term?: string | null } | null;
  /** Timeline entry for the creation (IMPORTED for CSV rows). */
  createdAs?: "CREATED" | "IMPORTED";
}

async function validCourse(id?: string | null) {
  const _id = optId(id);
  if (!_id) return null;
  if (!(await Course.exists({ _id }))) throw new ValidationError({ courseInterestId: "Unknown course" });
  return _id;
}

async function validBatch(id?: string | null) {
  const _id = optId(id);
  if (!_id) return null;
  if (!(await Batch.exists({ _id }))) throw new ValidationError({ batchInterestId: "Unknown batch" });
  return _id;
}

/** Dubai midnight of the first day of the month that contains `at`. */
export function startOfDubaiMonth(at: Date) {
  return startOfDubaiDay(new Date(`${dubaiDateString(at).slice(0, 7)}-01T00:00:00Z`));
}

/** The project a new lead goes into: the given one (must be in scope and not archived), else the default project. */
async function resolveProject(projectId: string | undefined, scope?: CrmScope): Promise<ProjectDoc> {
  const _id = optId(projectId);
  const project = _id ? ((await Project.findById(_id).lean()) as ProjectDoc | null) : await getDefaultProject();
  if (!project || (scope && !inProject(scope, project._id))) throw new ValidationError({ projectId: "Choose one of your projects" });
  if (project.status === "ARCHIVED") throw new BusinessError("That project is archived", { projectId: "Archived project" });
  return project;
}

/**
 * Create a lead in a project. Duplicates (same phone/email on a live lead) are refused unless
 * `allowDuplicate`; a contact that already belongs to a student is created already linked and CONVERTED.
 */
export async function createLead(input: LeadInput, actor: Actor, scope?: CrmScope, opts: CreateLeadOptions = {}): Promise<string> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  const phone = normalizePhone(input.phone, input.country);
  if (!phone && !email) throw new ValidationError({ phone: "Enter a mobile number or an email" });
  const country = (input.country?.trim().toUpperCase() || (phone ? parsePhone(phone)?.country : null) || "AE").slice(0, 2);
  const project = await resolveProject(input.projectId, scope);
  if (!input.allowDuplicate) {
    const [dup] = await findDuplicateLeads({ phone, email });
    if (dup) {
      const byPhone = !!phone && dup.phone === phone;
      throw new BusinessError(`A lead with this ${byPhone ? "mobile number" : "email"} already exists (${dup.name}). Open it, or tick “Create anyway”.`, {
        [byPhone ? "phone" : "email"]: `Already exists: ${dup.name}`,
      });
    }
  }
  const account = await findAccountByContact({ phone, email });
  if (account?.kind === "staff") throw new BusinessError("This mobile number or email belongs to a staff account", { [phone ? "phone" : "email"]: "Staff account" });
  let ownerId: Types.ObjectId | null;
  if (input.ownerId === undefined) ownerId = actorId(actor);
  else if (!input.ownerId) ownerId = null;
  else if (scope) ownerId = await assertAssignable(scope, project._id, input.ownerId);
  else {
    const team = await projectTeam(project);
    if (!team.some((t) => t.id === input.ownerId)) throw new BusinessError("That person is not on this project's team", { ownerId: "Not on the project team" });
    ownerId = new Types.ObjectId(input.ownerId);
  }
  const courseInterestId = await validCourse(input.courseInterestId);
  const batchInterestId = await validBatch(input.batchInterestId);
  const dueAt = localDate(input.nextFollowUpAt, "nextFollowUpAt");
  const at = now();
  let id: Types.ObjectId;
  try {
    id = await withTx(async () => {
      const [lead] = await Lead.create([
        {
          projectId: project._id,
          name,
          phone,
          email,
          country,
          language: input.language?.trim() || null,
          preferredChannel: input.preferredChannel || null,
          source: input.source,
          sourceDetail: input.sourceDetail?.trim() || null,
          utm: { source: opts.utm?.source ?? null, medium: opts.utm?.medium ?? null, campaign: opts.utm?.campaign ?? null, content: opts.utm?.content ?? null, term: opts.utm?.term ?? null },
          courseInterestId: courseInterestId ?? project.courseId ?? null,
          batchInterestId: batchInterestId ?? project.batchId ?? null,
          experienceLevel: input.experienceLevel || null,
          temperature: input.temperature || "WARM",
          tags: parseTags(input.tags),
          notes: input.notes?.trim() || null,
          consent: { marketing: !!input.marketingConsent, marketingAt: input.marketingConsent ? at : null, whatsapp: !!input.whatsappConsent },
          ownerId,
          assignedAt: ownerId ? at : null,
          lastActivityAt: at,
          inboundEventId: opts.inboundEventId ?? null,
          createdById: actorId(actor),
          ...(account ? { stage: "CONVERTED", stageChangedAt: at, studentId: account.id, enrollmentId: account.enrollmentId, convertedAt: at } : {}),
        },
      ]);
      await recordActivity(lead!._id, opts.createdAs ?? "CREATED", actor, { data: { source: input.source, sourceDetail: input.sourceDetail?.trim() || null, projectId: String(project._id), projectName: project.name } });
      if (account) await recordActivity(lead!._id, "LINKED", actor, { data: { studentId: String(account.id), name: account.name, via: "create" } });
      else if (dueAt) await createTaskInTx({ projectId: project._id, leadId: lead!._id, defaultAssigneeId: ownerId }, { title: "First follow-up", type: channelToTaskType(input.preferredChannel), dueAt }, actor);
      await audit({ actor, action: "lead.create", entityType: "Lead", entityId: String(lead!._id), after: { name, phone, email, source: input.source, projectId: String(project._id), ownerId: ownerId ? String(ownerId) : null } });
      if (ownerId && !(actor.type === "USER" && actor.id === String(ownerId))) {
        await notifyUser(String(ownerId), { title: "New lead assigned to you", body: `${name} · ${LEAD_SOURCE_LABELS[input.source]} · ${project.name}`, href: leadHref(lead!._id) });
      }
      return lead!._id;
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new BusinessError("This student already has a lead record");
    throw e;
  }
  await flushOutbox();
  return String(id);
}

/** Reassign inside a transaction: moves the old owner's open tasks along and tells the new owner. */
export async function applyAssign(lead: Pick<LeadDoc, "_id" | "ownerId" | "name">, to: Types.ObjectId | null, actor: Actor, type: "ASSIGNED" | "CLAIMED" = "ASSIGNED") {
  const at = now();
  const names = await userNames([lead.ownerId, to]);
  await Lead.updateOne({ _id: lead._id }, { $set: { ownerId: to, assignedAt: to ? at : null, lastActivityAt: at } });
  await CrmTask.updateMany({ leadId: lead._id, status: { $in: [...OPEN_TASK_STATUSES] }, assigneeId: lead.ownerId ?? null }, { $set: { assigneeId: to } });
  await recordActivity(lead._id, type, actor, {
    data: { from: lead.ownerId ? String(lead.ownerId) : null, fromName: lead.ownerId ? (names.get(String(lead.ownerId)) ?? null) : null, to: to ? String(to) : null, toName: to ? (names.get(String(to)) ?? null) : null },
  });
  if (to && !(actor.type === "USER" && actor.id === String(to))) await notifyUser(String(to), { title: "Lead assigned to you", body: lead.name, href: leadHref(lead._id) });
}

export async function updateLead(id: string, input: LeadUpdateInput, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const lead = await loadLead(id, scope);
  if (lead.mergedIntoId) throw new TransitionError("This lead was merged into another lead");
  const set: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const change = (k: string, v: unknown, prev: unknown) => {
    if (JSON.stringify(v ?? null) === JSON.stringify(prev ?? null)) return;
    set[k] = v;
    before[k] = prev ?? null;
    after[k] = v;
  };
  if (input.name !== undefined) change("name", input.name.trim(), lead.name);
  if (input.phone !== undefined) change("phone", normalizePhone(input.phone, input.country || lead.country), lead.phone);
  if (input.email !== undefined) change("email", normalizeEmail(input.email), lead.email);
  const phone = set.phone !== undefined ? set.phone : lead.phone;
  const email = set.email !== undefined ? set.email : lead.email;
  if (!phone && !email) throw new ValidationError({ phone: "Keep a mobile number or an email" });
  if (input.country?.trim()) change("country", input.country.trim().toUpperCase().slice(0, 2), lead.country);
  if (input.source !== undefined) change("source", input.source, lead.source);
  if (input.sourceDetail !== undefined) change("sourceDetail", input.sourceDetail.trim() || null, lead.sourceDetail);
  if (input.courseInterestId !== undefined) change("courseInterestId", await validCourse(input.courseInterestId), lead.courseInterestId);
  if (input.batchInterestId !== undefined) change("batchInterestId", await validBatch(input.batchInterestId), lead.batchInterestId);
  if (input.experienceLevel !== undefined) change("experienceLevel", input.experienceLevel || null, lead.experienceLevel);
  if (input.temperature) change("temperature", input.temperature, lead.temperature);
  if (input.preferredChannel !== undefined) change("preferredChannel", input.preferredChannel || null, lead.preferredChannel);
  if (input.language !== undefined) change("language", input.language.trim() || null, lead.language);
  if (input.tags !== undefined) change("tags", parseTags(input.tags), lead.tags ?? []);
  if (input.notes !== undefined) change("notes", input.notes.trim() || null, lead.notes);
  if (input.marketingConsent !== undefined && input.marketingConsent !== !!lead.consent?.marketing) {
    set["consent.marketing"] = input.marketingConsent;
    set["consent.marketingAt"] = input.marketingConsent ? now() : null;
    before.marketingConsent = !!lead.consent?.marketing;
    after.marketingConsent = input.marketingConsent;
  }
  if (input.whatsappConsent !== undefined && input.whatsappConsent !== !!lead.consent?.whatsapp) {
    set["consent.whatsapp"] = input.whatsappConsent;
    before.whatsappConsent = !!lead.consent?.whatsapp;
    after.whatsappConsent = input.whatsappConsent;
  }
  // Ownership and project changes go through assign / claim / move-project, never through edit.
  if (!Object.keys(set).length) return;
  await withTx(async () => {
    await Lead.updateOne({ _id: lead._id }, { $set: set, $inc: { rev: 1 } });
    await audit({ actor, action: "lead.update", entityType: "Lead", entityId: id, before, after });
  });
}

export async function setStage(id: string, input: { stage: LeadStage; lostReason?: string; note?: string }, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const _id = oid(id, "Lead");
  await withTx(async () => {
    const lead = await lockLead(_id);
    assertLeadVisible(lead, scope);
    const from = lead.stage as LeadStage;
    if (!canTransition(from, input.stage)) {
      throw new TransitionError(
        input.stage === "CONVERTED" || from === "CONVERTED" ? "Converted leads are managed through “Convert to student” and “Link to student”" : `Cannot move a ${LEAD_STAGE_LABELS[from]} lead to ${LEAD_STAGE_LABELS[input.stage]}`,
      );
    }
    const at = now();
    const lostReason = input.stage === "LOST" ? (input.lostReason?.trim() ?? null) : null;
    const set: Record<string, unknown> = { stage: input.stage, stageChangedAt: at, lastActivityAt: at, lostReason, lostNote: input.stage === "LOST" ? input.note?.trim() || null : null };
    if (from === "NEW" && input.stage !== "LOST" && !lead.firstContactedAt) set.firstContactedAt = at;
    await Lead.updateOne({ _id }, { $set: set });
    await recordActivity(_id, "STAGE_CHANGED", actor, { body: input.note?.trim() || null, data: { from, to: input.stage, lostReason } });
    await audit({ actor, action: "lead.stage", entityType: "Lead", entityId: id, before: { stage: from }, after: { stage: input.stage, lostReason } });
  });
}

/** Hand a lead to someone on the project team (or unassign). Needs crm.assign in a project the viewer manages. */
export async function assignLead(id: string, ownerId: string | null, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const _id = oid(id, "Lead");
  const current = await loadLead(_id, scope);
  if (!canAssignIn(scope, current.projectId)) throw new NotFoundError("Lead");
  const to = ownerId ? await assertAssignable(scope, current.projectId, ownerId) : null;
  await withTx(async () => {
    const lead = await lockLead(_id);
    if (String(lead.ownerId ?? "") === String(to ?? "")) return;
    await applyAssign(lead, to, actor);
    await audit({ actor, action: "lead.assign", entityType: "Lead", entityId: id, before: { ownerId: lead.ownerId ? String(lead.ownerId) : null }, after: { ownerId: to ? String(to) : null } });
  });
}

export async function bulkAssignLeads(ids: string[], ownerId: string | null, actor: Actor & { type: "USER" }, scope: CrmScope) {
  let n = 0;
  for (const id of [...new Set(ids)].slice(0, 500)) {
    try {
      await assignLead(id, ownerId, actor, scope);
      n++;
    } catch (e) {
      if (e instanceof NotFoundError) continue;
      throw e;
    }
  }
  return n;
}

/** An executive takes an unassigned lead from a project they belong to. */
export async function claimLead(id: string, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const _id = oid(id, "Lead");
  const current = await loadLead(_id, scope);
  if (!canClaim(current, scope)) throw new TransitionError("This lead is already assigned");
  await withTx(async () => {
    const lead = await lockLead(_id, { ownerId: null });
    await applyAssign(lead, scope.me, actor, "CLAIMED");
    await audit({ actor, action: "lead.claim", entityType: "Lead", entityId: id, after: { ownerId: scope.userId } });
  });
}

const FILL_FIELDS = ["phone", "email", "language", "preferredChannel", "sourceDetail", "courseInterestId", "batchInterestId", "experienceLevel", "ownerId", "lostReason", "inboundEventId"] as const;

/** Merge `fromId` into `intoId`: the survivor keeps its values (and project) and gains anything it was missing, plus all activities and tasks. */
export async function mergeLeads(intoId: string, fromId: string, actor: Actor & { type: "USER" }, scope: CrmScope) {
  if (intoId === fromId) throw new BusinessError("Choose a different lead to merge");
  const intoOid = oid(intoId, "Lead");
  const fromOid = oid(fromId, "Lead");
  await withTx(async () => {
    const into = await lockLead(intoOid);
    const from = await lockLead(fromOid);
    assertLeadVisible(into, scope);
    assertLeadVisible(from, scope);
    if (!managesProject(scope, into.projectId)) throw new NotFoundError("Lead");
    if (into.studentId && from.studentId && String(into.studentId) !== String(from.studentId)) throw new BusinessError("Both leads are linked to different students; they cannot be merged");
    const at = now();
    const set: Record<string, unknown> = {};
    for (const f of FILL_FIELDS) if (into[f] == null && from[f] != null) set[f] = from[f];
    if (from.notes && from.notes !== into.notes) set.notes = into.notes ? `${into.notes}\n\n— merged from ${from.name}:\n${from.notes}` : from.notes;
    set.tags = [...new Set([...(into.tags ?? []), ...(from.tags ?? [])])];
    set.consent = {
      marketing: !!into.consent?.marketing || !!from.consent?.marketing,
      marketingAt: into.consent?.marketingAt ?? from.consent?.marketingAt ?? null,
      whatsapp: !!into.consent?.whatsapp || !!from.consent?.whatsapp,
    };
    for (const k of ["source", "medium", "campaign", "content", "term"] as const) if (!into.utm?.[k] && from.utm?.[k]) set[`utm.${k}`] = from.utm[k];
    const minDate = (a?: Date | null, b?: Date | null) => (a && b ? (a < b ? a : b) : (a ?? b ?? null));
    const maxDate = (a?: Date | null, b?: Date | null) => (a && b ? (a > b ? a : b) : (a ?? b ?? null));
    set.firstContactedAt = minDate(into.firstContactedAt, from.firstContactedAt);
    set.lastContactedAt = maxDate(into.lastContactedAt, from.lastContactedAt);
    set.lastActivityAt = at;
    if (into.stage !== "CONVERTED" && stageIndex(from.stage as LeadStage) > stageIndex(into.stage as LeadStage)) {
      set.stage = from.stage;
      set.stageChangedAt = at;
    }
    if (from.studentId && !into.studentId) {
      await Lead.updateOne({ _id: fromOid }, { $set: { studentId: null } }); // release the partial-unique index first
      Object.assign(set, { studentId: from.studentId, enrollmentId: from.enrollmentId ?? null, convertedAt: from.convertedAt ?? at, stage: "CONVERTED", stageChangedAt: at });
    }
    await LeadActivity.updateMany({ leadId: fromOid }, { $set: { leadId: intoOid } });
    await CrmTask.updateMany({ leadId: fromOid }, { $set: { leadId: intoOid, projectId: into.projectId } });
    await Lead.updateOne({ _id: fromOid }, { $set: { mergedIntoId: intoOid, studentId: null, nextFollowUpAt: null, lastActivityAt: at } });
    await Lead.updateOne({ _id: intoOid }, { $set: set });
    await recomputeNextFollowUp(intoOid);
    await recordActivity(intoOid, "MERGED", actor, { data: { fromId, fromName: from.name, fromPhone: from.phone ?? null, fromEmail: from.email ?? null } });
    await audit({ actor, action: "lead.merge", entityType: "Lead", entityId: intoId, after: { fromId, fromName: from.name } });
  });
}

/** Dropdown data for the viewer: projects they can work in, the assignable team per project, catalogue, lost reasons. */
export async function getCrmOptions(scope: CrmScope): Promise<CrmOptions> {
  const [projects, courses, batches, cfg] = await Promise.all([
    projectsFor(scope),
    Course.find({ isActive: true }).sort({ title: 1 }).lean(),
    Batch.find({ status: { $ne: "ARCHIVED" } }).sort({ startDate: -1 }).lean(),
    getSetting("crm.config"),
  ]);
  const active = projects.filter((p) => p.status !== "ARCHIVED");
  const everyone = scope.all ? await listCrmUsers() : null;
  const teams: Record<string, { id: string; name: string }[]> = {};
  for (const p of active) teams[String(p._id)] = canAssignIn(scope, p._id) ? (everyone ?? (await projectTeam(p))) : [{ id: scope.userId, name: "Me" }];
  return {
    projects: active.map((p) => ({ id: String(p._id), name: p.name, code: p.code, canAssign: canAssignIn(scope, p._id), isDefault: !!p.isDefault })),
    teams,
    staff: has(scope, "crm.projects.manage") ? (everyone ?? (await listCrmUsers())) : [],
    courses: courses.map((c) => ({ id: String(c._id), title: c.title })),
    batches: batches.map((b) => ({ id: String(b._id), label: `${b.name} (${b.code})`, courseId: String(b.courseId) })),
    lostReasons: cfg.lostReasons,
  };
}

interface ListRow extends LeadDoc {
  o?: { name: string }[];
  c?: { title: string }[];
  b?: { name: string }[];
  p?: { name: string; code: string }[];
}

export async function listLeads(filters: LeadFilters, scope: CrmScope): Promise<{ rows: LeadListItem[]; total: number }> {
  const at = now();
  const and: Record<string, unknown>[] = [{ mergedIntoId: null }];
  const sc = leadScopeFilter(scope);
  if (Object.keys(sc).length) and.push(sc);
  const q = filters.q?.trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    const digits = q.replace(/\D/g, "").replace(/^0+/, "");
    const or: Record<string, unknown>[] = [{ name: rx }, { email: rx }, { tags: rx }, { sourceDetail: rx }];
    if (digits.length >= 3) or.push({ phone: new RegExp(escapeRegex(digits)) });
    and.push({ $or: or });
  }
  const project = optId(filters.project);
  if (project) and.push({ projectId: project });
  if (filters.stage) and.push({ stage: filters.stage });
  else if (filters.view !== "all") and.push({ stage: { $in: [...OPEN_LEAD_STAGES] } });
  if (filters.source) and.push({ source: filters.source });
  if (filters.temperature) and.push({ temperature: filters.temperature });
  const course = optId(filters.course);
  if (course) and.push({ courseInterestId: course });
  const batch = optId(filters.batch);
  if (batch) and.push({ batchInterestId: batch });
  if (filters.tag?.trim()) and.push({ tags: filters.tag.trim().toLowerCase() });
  if (filters.owner === "me") and.push({ ownerId: scope.me });
  else if (filters.owner === "unassigned") and.push({ ownerId: null });
  else {
    const o = optId(filters.owner);
    if (o) and.push({ ownerId: o });
  }
  const todayStart = startOfDubaiDay(at);
  if (filters.due === "overdue") and.push({ nextFollowUpAt: { $lt: todayStart } });
  else if (filters.due === "today") and.push({ nextFollowUpAt: { $lt: startOfDubaiDay(at, 1) } });
  else if (filters.due === "week") and.push({ nextFollowUpAt: { $lt: startOfDubaiDay(at, 7) } });
  else if (filters.due === "none") and.push({ nextFollowUpAt: null });
  if (filters.created === "today") and.push({ createdAt: { $gte: todayStart } });
  else if (filters.created === "week") and.push({ createdAt: { $gte: new Date(at.getTime() - 7 * 86_400_000) } });
  else if (filters.created === "month") and.push({ createdAt: { $gte: startOfDubaiMonth(at) } });

  const sort: Record<string, 1 | -1> =
    filters.sort === "created" ? { createdAt: -1 } : filters.sort === "name" ? { name: 1 } : filters.sort === "followUp" ? { followUpSort: 1, createdAt: -1 } : { lastActivityAt: -1, createdAt: -1 };
  const page = Math.max(1, Number(filters.page ?? 1) || 1);
  const pageSize = Math.min(10_000, Math.max(1, Number(filters.pageSize ?? 100) || 100));
  const [out] = await Lead.aggregate<{ rows: ListRow[]; total: { n: number }[] }>([
    { $match: { $and: and } },
    ...(filters.sort === "followUp" ? [{ $addFields: { followUpSort: { $ifNull: ["$nextFollowUpAt", new Date(8.64e15)] } } }] : []),
    { $sort: sort },
    {
      $facet: {
        rows: [
          { $skip: (page - 1) * pageSize },
          { $limit: pageSize },
          { $lookup: { from: "user", localField: "ownerId", foreignField: "_id", as: "o" } },
          { $lookup: { from: "courses", localField: "courseInterestId", foreignField: "_id", as: "c" } },
          { $lookup: { from: "batches", localField: "batchInterestId", foreignField: "_id", as: "b" } },
          { $lookup: { from: "crmProjects", localField: "projectId", foreignField: "_id", as: "p" } },
        ],
        total: [{ $count: "n" }],
      },
    },
  ]);
  const rows = (out?.rows ?? []).map((r) => {
    const refs: LeadRefs = {
      owners: new Map(r.ownerId && r.o?.[0] ? [[String(r.ownerId), r.o[0].name]] : []),
      courses: new Map(r.courseInterestId && r.c?.[0] ? [[String(r.courseInterestId), r.c[0].title]] : []),
      batches: new Map(r.batchInterestId && r.b?.[0] ? [[String(r.batchInterestId), r.b[0].name]] : []),
      projects: new Map(r.p?.[0] ? [[String(r.projectId), { name: r.p[0].name, code: r.p[0].code }]] : []),
    };
    return toLeadListItem(r, refs);
  });
  return { rows, total: out?.total[0]?.n ?? 0 };
}

export async function leadsCsv(filters: LeadFilters, scope: CrmScope) {
  const { rows } = await listLeads({ ...filters, page: 1, pageSize: 10_000 }, scope);
  return toCsv(
    ["Name", "Mobile", "Email", "Country", "Project", "Source", "Source detail", "Stage", "Temperature", "Owner", "Course", "Batch", "Tags", "Next follow-up", "Last activity", "Created", "Lost reason", "Student ID"],
    rows.map((l) => [
      l.name,
      l.phone,
      l.email,
      l.country,
      l.project.name,
      LEAD_SOURCE_LABELS[l.source],
      l.sourceDetail,
      LEAD_STAGE_LABELS[l.stage],
      LEAD_TEMPERATURE_LABELS[l.temperature],
      l.owner?.name,
      l.courseTitle,
      l.batchName,
      l.tags.join(", "),
      l.nextFollowUpAt ? formatDateTime(l.nextFollowUpAt) : null,
      l.lastActivityAt ? formatDateTime(l.lastActivityAt) : null,
      formatDate(l.createdAt),
      l.lostReason,
      l.studentId,
    ]),
  );
}

export async function getLeadDetail(id: string, scope: CrmScope): Promise<LeadDetail> {
  const lead = await loadLead(id, scope);
  const [activities, openTasks, doneTasks, dups, options, account, course, batch, projects] = await Promise.all([
    LeadActivity.find({ leadId: lead._id }).sort({ createdAt: -1 }).limit(100).lean(),
    CrmTask.find({ leadId: lead._id, status: { $in: [...OPEN_TASK_STATUSES] } }).sort({ dueAt: 1, order: 1 }).lean(),
    CrmTask.find({ leadId: lead._id, status: { $nin: [...OPEN_TASK_STATUSES] } }).sort({ updatedAt: -1 }).limit(10).lean(),
    findDuplicateLeads({ phone: lead.phone ?? null, email: lead.email ?? null }, lead._id),
    getCrmOptions(scope),
    lead.studentId ? null : findAccountByContact({ phone: lead.phone ?? null, email: lead.email ?? null }),
    lead.courseInterestId ? Course.findById(lead.courseInterestId, { title: 1 }).lean() : null,
    lead.batchInterestId ? Batch.findById(lead.batchInterestId, { name: 1 }).lean() : null,
    projectRefs([lead.projectId]),
  ]);
  const names = await userNames([lead.ownerId, ...activities.map((a) => a.actorId)]);
  const refs: LeadRefs = {
    owners: names,
    courses: new Map(course ? [[String(course._id), course.title]] : []),
    batches: new Map(batch ? [[String(batch._id), batch.name]] : []),
    projects,
  };
  let student: LeadDetail["student"] = null;
  if (lead.studentId) {
    const [u, e] = await Promise.all([AuthUser.findById(lead.studentId, { name: 1, email: 1 }).lean(), getCurrentEnrollment(lead.studentId).catch(() => null)]);
    if (u) student = { id: String(u._id), name: u.name, email: u.email, enrollment: e ? { status: e.e.status, paymentState: e.e.paymentState, batchName: e.batch.name } : null };
  }
  // Duplicates outside the viewer's scope stay hidden (they can still be merged by a manager who sees both).
  const visibleDups = dups.filter((d) => canSeeLeadDoc(d, scope));
  return {
    lead: toLeadDto(lead, refs),
    activities: activities.map((a) => toActivityDto(a, names)),
    tasks: await tasksToDtos([...openTasks, ...doneTasks]),
    student,
    matchingStudent: account?.kind === "student" ? { id: String(account.id), name: account.name, email: account.email } : null,
    duplicates: visibleDups.map((d) => ({ id: String(d._id), name: d.name, phone: d.phone ?? null, email: d.email ?? null, stage: d.stage as LeadStage })),
    can: { assign: canAssignIn(scope, lead.projectId), claim: canClaim(lead, scope), moveProject: has(scope, "crm.projects.manage") || (managesProject(scope, lead.projectId) && scope.managed.length > 0) },
    options,
  };
}

function canSeeLeadDoc(d: Pick<LeadDoc, "projectId" | "ownerId">, scope: CrmScope) {
  try {
    assertLeadVisible(d, scope);
    return true;
  } catch {
    return false;
  }
}
