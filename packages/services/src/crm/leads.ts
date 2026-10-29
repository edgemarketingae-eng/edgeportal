import type { CrmOptions, LeadDetail, LeadFilters, LeadInput, LeadListItem, LeadUpdateInput, Paged } from "@edge/contracts";
import {
  AuthUser,
  Batch,
  Course,
  CrmTask,
  isDuplicateKey,
  Lead,
  LeadActivity,
  LeadConversion,
  LeadDeposit,
  LeadInboundEvent,
  Project,
  TaskComment,
  Types,
  withTx,
  type LeadDoc,
  type ProjectDoc,
} from "@edge/db";
import { now } from "@edge/domain/clock";
import { OPEN_LEAD_STAGES, OPEN_TASK_STATUSES, ROUND_ROBIN, type LeadStage } from "@edge/domain/crm/enums";
import {
  LANGUAGE_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_TEMPERATURE_LABELS,
  type QualificationKey,
} from "@edge/domain/crm/labels";
import { canTransition, parseTags, stageIndex } from "@edge/domain/crm/machine";
import { toCsv } from "@edge/domain/csv";
import { dubaiDateString, formatDate, formatDateTime, startOfDubaiDay } from "@edge/domain/dates";
import type { Actor } from "@edge/domain/enums";
import { parsePhone } from "@edge/domain/phone";
import { audit } from "../audit";
import { EXPORT_CAP, facetPage } from "../paging";
import { depositsForLead } from "./deposits";
import { activeProducts, moveConversions, recordStudentConversion, toConversionDtos } from "./products";
import { roundRobinPicker } from "./round-robin";
import { getCurrentEnrollment } from "../enrollment/service";
import { BusinessError, ForbiddenError, NotFoundError, TransitionError, ValidationError } from "../errors";
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
  productNames,
  projectRefs,
  recomputeNextFollowUp,
  startOfDubaiMonth,
  recordActivity,
  toActivityDto,
  toLeadDto,
  toLeadListItem,
  tasksToDtos,
  userNames,
  type LeadRefs,
} from "./common";
import {
  assertAssignable,
  assertLeadVisible,
  canAssignIn,
  canClaim,
  getDefaultProject,
  has,
  inProject,
  listCrmUsers,
  managesProject,
  projectTeam,
  projectsFor,
  leadScopeFilter,
  type CrmScope,
} from "./scope";

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

export { startOfDubaiMonth } from "./common";

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
  const chosen = input.country?.trim().toUpperCase() || null;
  const phone = normalizePhone(input.phone, chosen);
  if (!phone && !email) throw new ValidationError({ phone: "Enter a mobile number or an email" });
  // The country picked for the lead, else the mobile number's; never assumed.
  const country = chosen || (phone ? parsePhone(phone)?.country : null) || null;
  const project = await resolveProject(input.projectId, scope);
  if (!input.allowDuplicate) {
    const [dup] = await findDuplicateLeads({ phone, email });
    if (dup) {
      const byPhone = !!phone && dup.phone === phone;
      throw new BusinessError(
        `A lead with this ${byPhone ? "mobile number" : "email"} already exists (${dup.name}). Open it, or tick “Create even if a lead with this contact already exists”.`,
        {
          [byPhone ? "phone" : "email"]: `Already exists: ${dup.name}`,
        },
      );
    }
  }
  const account = await findAccountByContact({ phone, email });
  if (account?.kind === "staff")
    throw new BusinessError("This mobile number or email belongs to a staff account", { [phone ? "phone" : "email"]: "Staff account" });
  let ownerId: Types.ObjectId | null;
  if (input.ownerId === undefined) ownerId = actorId(actor);
  else if (!input.ownerId) ownerId = null;
  else if (scope) ownerId = await assertAssignable(scope, project._id, input.ownerId);
  else {
    const team = await projectTeam(project);
    if (!team.some((t) => t.id === input.ownerId))
      throw new BusinessError("That person is not on this project's team", { ownerId: "Not on the project team" });
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
          language: input.language || null,
          jetaFxClientId: input.jetaFxClientId?.trim() || null,
          preferredChannel: input.preferredChannel || null,
          source: input.source,
          sourceDetail: input.sourceDetail?.trim() || null,
          utm: {
            source: opts.utm?.source ?? null,
            medium: opts.utm?.medium ?? null,
            campaign: opts.utm?.campaign ?? null,
            content: opts.utm?.content ?? null,
            term: opts.utm?.term ?? null,
          },
          courseInterestId: courseInterestId ?? project.courseId ?? null,
          batchInterestId: batchInterestId ?? project.batchId ?? null,
          experienceLevel: input.experienceLevel || null,
          qualification: {
            experience: input.qualification?.experience?.trim() || null,
            occupation: input.qualification?.occupation?.trim() || null,
            purpose: input.qualification?.purpose?.trim() || null,
          },
          temperature: input.temperature || "WARM",
          tags: parseTags(input.tags),
          notes: input.notes?.trim() || null,
          consent: {
            marketing: !!input.marketingConsent,
            marketingAt: input.marketingConsent ? at : null,
            whatsapp: !!input.whatsappConsent,
          },
          ownerId,
          assignedAt: ownerId ? at : null,
          lastActivityAt: at,
          inboundEventId: opts.inboundEventId ?? null,
          createdById: actorId(actor),
          ...(account
            ? { stage: "CONVERTED", stageChangedAt: at, studentId: account.id, enrollmentId: account.enrollmentId, convertedAt: at }
            : {}),
        },
      ]);
      await recordActivity(lead!._id, opts.createdAs ?? "CREATED", actor, {
        data: {
          source: input.source,
          sourceDetail: input.sourceDetail?.trim() || null,
          projectId: String(project._id),
          projectName: project.name,
        },
      });
      if (account) {
        await recordActivity(lead!._id, "LINKED", actor, { data: { studentId: String(account.id), name: account.name, via: "create" } });
        await recordStudentConversion(lead!._id, actor, at);
      } else if (dueAt)
        await createTaskInTx(
          { projectId: project._id, leadId: lead!._id, defaultAssigneeId: ownerId },
          { title: "First follow-up", type: channelToTaskType(input.preferredChannel), dueAt },
          actor,
        );
      await audit({
        actor,
        action: "lead.create",
        entityType: "Lead",
        entityId: String(lead!._id),
        after: { name, phone, email, source: input.source, projectId: String(project._id), ownerId: ownerId ? String(ownerId) : null },
      });
      if (ownerId && !(actor.type === "USER" && actor.id === String(ownerId))) {
        await notifyUser(String(ownerId), {
          title: "New lead assigned to you",
          body: `${name} · ${LEAD_SOURCE_LABELS[input.source]} · ${project.name}`,
          href: leadHref(lead!._id),
        });
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
export async function applyAssign(
  lead: Pick<LeadDoc, "_id" | "ownerId" | "name">,
  to: Types.ObjectId | null,
  actor: Actor,
  type: "ASSIGNED" | "CLAIMED" = "ASSIGNED",
) {
  const at = now();
  const names = await userNames([lead.ownerId, to]);
  await Lead.updateOne({ _id: lead._id }, { $set: { ownerId: to, assignedAt: to ? at : null, lastActivityAt: at } });
  await CrmTask.updateMany(
    { leadId: lead._id, status: { $in: [...OPEN_TASK_STATUSES] }, assigneeId: lead.ownerId ?? null },
    { $set: { assigneeId: to } },
  );
  await recordActivity(lead._id, type, actor, {
    data: {
      from: lead.ownerId ? String(lead.ownerId) : null,
      fromName: lead.ownerId ? (names.get(String(lead.ownerId)) ?? null) : null,
      to: to ? String(to) : null,
      toName: to ? (names.get(String(to)) ?? null) : null,
    },
  });
  if (to && !(actor.type === "USER" && actor.id === String(to)))
    await notifyUser(String(to), { title: "Lead assigned to you", body: lead.name, href: leadHref(lead._id) });
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
  if (input.country?.trim()) change("country", input.country.trim().toUpperCase(), lead.country);
  else if (set.phone && !lead.country) change("country", parsePhone(set.phone as string)?.country ?? null, lead.country);
  if (input.source !== undefined) change("source", input.source, lead.source);
  if (input.sourceDetail !== undefined) change("sourceDetail", input.sourceDetail.trim() || null, lead.sourceDetail);
  if (input.courseInterestId !== undefined) change("courseInterestId", await validCourse(input.courseInterestId), lead.courseInterestId);
  if (input.batchInterestId !== undefined) change("batchInterestId", await validBatch(input.batchInterestId), lead.batchInterestId);
  if (input.experienceLevel !== undefined) change("experienceLevel", input.experienceLevel || null, lead.experienceLevel);
  if (input.temperature) change("temperature", input.temperature, lead.temperature);
  if (input.preferredChannel !== undefined) change("preferredChannel", input.preferredChannel || null, lead.preferredChannel);
  if (input.language !== undefined) change("language", input.language || null, lead.language);
  if (input.jetaFxClientId !== undefined) change("jetaFxClientId", input.jetaFxClientId.trim() || null, lead.jetaFxClientId);
  for (const k of ["experience", "occupation", "purpose"] as const satisfies QualificationKey[]) {
    const v = input.qualification?.[k];
    if (v !== undefined) change(`qualification.${k}`, v.trim() || null, lead.qualification?.[k]);
  }
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

export async function setStage(
  id: string,
  input: { stage: LeadStage; lostReason?: string; note?: string },
  actor: Actor & { type: "USER" },
  scope: CrmScope,
) {
  const _id = oid(id, "Lead");
  await withTx(async () => {
    const lead = await lockLead(_id);
    assertLeadVisible(lead, scope);
    const from = lead.stage as LeadStage;
    if (!canTransition(from, input.stage)) {
      throw new TransitionError(
        input.stage === "CONVERTED" || from === "CONVERTED"
          ? "Converted leads are managed through “Mark conversion”, “Convert to student” and “Link to student”"
          : `Cannot move a ${LEAD_STAGE_LABELS[from]} lead to ${LEAD_STAGE_LABELS[input.stage]}`,
      );
    }
    const at = now();
    const lostReason = input.stage === "LOST" ? (input.lostReason?.trim() ?? null) : null;
    const set: Record<string, unknown> = {
      stage: input.stage,
      stageChangedAt: at,
      lastActivityAt: at,
      lostReason,
      lostNote: input.stage === "LOST" ? input.note?.trim() || null : null,
    };
    if (from === "NEW" && input.stage !== "LOST" && !lead.firstContactedAt) set.firstContactedAt = at;
    await Lead.updateOne({ _id }, { $set: set });
    await recordActivity(_id, "STAGE_CHANGED", actor, { body: input.note?.trim() || null, data: { from, to: input.stage, lostReason } });
    await audit({
      actor,
      action: "lead.stage",
      entityType: "Lead",
      entityId: id,
      before: { stage: from },
      after: { stage: input.stage, lostReason },
    });
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
    await audit({
      actor,
      action: "lead.assign",
      entityType: "Lead",
      entityId: id,
      before: { ownerId: lead.ownerId ? String(lead.ownerId) : null },
      after: { ownerId: to ? String(to) : null },
    });
  });
}

/** The leads a bulk action targets: ticked ids, or everything matching a filter. */
export interface BulkTarget {
  ids?: string[];
  filters?: LeadFilters;
}

async function targetIds(t: BulkTarget, scope: CrmScope) {
  if (t.ids?.length) return [...new Set(t.ids)];
  if (t.filters) return leadIdsMatching(t.filters, scope);
  return [];
}

/**
 * Assign many leads to one person, unassign them (`null`), or spread them across each lead's project sales
 * executives (`ROUND_ROBIN`). Leads the viewer cannot see or assign, or projects without sales executives, are
 * skipped and counted.
 */
export async function bulkAssignLeads(target: BulkTarget, ownerId: string | null, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const ids = await targetIds(target, scope);
  let updated = 0;
  let skipped = 0;
  const roundRobin = ownerId === ROUND_ROBIN;
  const leads = roundRobin
    ? await Lead.find(
        { _id: { $in: ids.filter((x) => Types.ObjectId.isValid(x)).map((x) => new Types.ObjectId(x)) } },
        { projectId: 1 },
      ).lean()
    : [];
  const projectOf = new Map(leads.map((l) => [String(l._id), l.projectId]));
  const pickers = new Map<string, Awaited<ReturnType<typeof roundRobinPicker>>>();
  for (const id of ids) {
    try {
      let to = ownerId;
      if (roundRobin) {
        const projectId = projectOf.get(id);
        if (!projectId || !canAssignIn(scope, projectId)) throw new NotFoundError("Lead");
        let picker = pickers.get(String(projectId));
        if (!picker) {
          const project = await Project.findById(projectId).lean();
          picker = project ? await roundRobinPicker(project) : { size: 0, next: () => null };
          pickers.set(String(projectId), picker);
        }
        to = picker.next();
        if (!to) throw new BusinessError("No sales executives on this project");
      }
      await assignLead(id, to, actor, scope);
      updated++;
    } catch (e) {
      if (!(e instanceof NotFoundError) && !(e instanceof BusinessError) && !(e instanceof ForbiddenError)) throw e;
      skipped++;
    }
  }
  return { updated, skipped };
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

const FILL_FIELDS = [
  "phone",
  "email",
  "language",
  "jetaFxClientId",
  "preferredChannel",
  "sourceDetail",
  "courseInterestId",
  "batchInterestId",
  "experienceLevel",
  "ownerId",
  "lostReason",
  "inboundEventId",
  "convertedById",
] as const;

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
    if (into.studentId && from.studentId && String(into.studentId) !== String(from.studentId))
      throw new BusinessError("Both leads are linked to different students; they cannot be merged");
    const at = now();
    const set: Record<string, unknown> = {};
    for (const f of FILL_FIELDS) if (into[f] == null && from[f] != null) set[f] = from[f];
    if (from.notes && from.notes !== into.notes)
      set.notes = into.notes ? `${into.notes}\n\n— merged from ${from.name}:\n${from.notes}` : from.notes;
    set.tags = [...new Set([...(into.tags ?? []), ...(from.tags ?? [])])];
    set.consent = {
      marketing: !!into.consent?.marketing || !!from.consent?.marketing,
      marketingAt: into.consent?.marketingAt ?? from.consent?.marketingAt ?? null,
      whatsapp: !!into.consent?.whatsapp || !!from.consent?.whatsapp,
    };
    for (const k of ["source", "medium", "campaign", "content", "term"] as const)
      if (!into.utm?.[k] && from.utm?.[k]) set[`utm.${k}`] = from.utm[k];
    for (const k of ["experience", "occupation", "purpose"] as const)
      if (!into.qualification?.[k] && from.qualification?.[k]) set[`qualification.${k}`] = from.qualification[k];
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
      Object.assign(set, {
        studentId: from.studentId,
        enrollmentId: from.enrollmentId ?? null,
        convertedAt: from.convertedAt ?? at,
        stage: "CONVERTED",
        stageChangedAt: at,
      });
    }
    const productIds = await moveConversions(fromOid, intoOid, into.projectId);
    if (productIds.length) {
      set.productIds = productIds;
      set.convertedAt = minDate(into.convertedAt, from.convertedAt) ?? at;
      if (into.stage !== "CONVERTED") Object.assign(set, { stage: "CONVERTED", stageChangedAt: at });
    }
    await LeadDeposit.updateMany({ leadId: fromOid }, { $set: { leadId: intoOid } });
    await LeadActivity.updateMany({ leadId: fromOid }, { $set: { leadId: intoOid } });
    await CrmTask.updateMany({ leadId: fromOid }, { $set: { leadId: intoOid, projectId: into.projectId } });
    await Lead.updateOne(
      { _id: fromOid },
      { $set: { mergedIntoId: intoOid, studentId: null, productIds: [], nextFollowUpAt: null, lastActivityAt: at } },
    );
    await Lead.updateOne({ _id: intoOid }, { $set: set });
    await recomputeNextFollowUp(intoOid);
    await recordActivity(intoOid, "MERGED", actor, {
      data: { fromId, fromName: from.name, fromPhone: from.phone ?? null, fromEmail: from.email ?? null },
    });
    await audit({ actor, action: "lead.merge", entityType: "Lead", entityId: intoId, after: { fromId, fromName: from.name } });
  });
}

/**
 * Permanently delete a lead with its activities, tasks (and their comments) and any leads that were merged into it.
 * Leads linked to a student account are refused: the student record still points at them. So are leads with
 * broker deposits (commission history); their product conversions go with them.
 * Website events are kept (they stop a retried webhook from re-creating the lead) but lose the link.
 */
export async function deleteLead(id: string, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const _id = oid(id, "Lead");
  await loadLead(_id, scope);
  await withTx(async () => {
    const lead = await lockLead(_id);
    assertLeadVisible(lead, scope);
    if (lead.studentId) throw new BusinessError("This lead is linked to a student account, so it can't be deleted.");
    const merged = await Lead.find({ mergedIntoId: _id }, { _id: 1 }).lean();
    const leadIds = [_id, ...merged.map((m) => m._id)];
    if (await LeadDeposit.exists({ leadId: { $in: leadIds } }))
      throw new BusinessError("This lead has broker deposits logged (commission history), so it can't be deleted.");
    const tasks = await CrmTask.find({ leadId: { $in: leadIds } }, { _id: 1 }).lean();
    const taskIds = tasks.map((t) => t._id);
    const [activities] = await Promise.all([
      LeadActivity.deleteMany({ leadId: { $in: leadIds } }),
      TaskComment.deleteMany({ taskId: { $in: taskIds } }),
    ]);
    await CrmTask.deleteMany({ _id: { $in: taskIds } });
    await LeadConversion.deleteMany({ leadId: { $in: leadIds } });
    await LeadInboundEvent.updateMany({ leadId: { $in: leadIds } }, { $set: { leadId: null } });
    await Lead.deleteMany({ _id: { $in: leadIds } });
    await audit({
      actor,
      action: "lead.delete",
      entityType: "Lead",
      entityId: id,
      before: {
        name: lead.name,
        phone: lead.phone ?? null,
        email: lead.email ?? null,
        projectId: String(lead.projectId),
        stage: lead.stage,
        ownerId: lead.ownerId ? String(lead.ownerId) : null,
      },
      after: { activities: activities.deletedCount, tasks: taskIds.length, mergedLeads: merged.length },
    });
  });
}

/** Deletes what it can; leads linked to a student, with deposits, or out of scope are skipped and counted. */
export async function bulkDeleteLeads(target: BulkTarget, actor: Actor & { type: "USER" }, scope: CrmScope) {
  let deleted = 0;
  let skipped = 0;
  for (const id of await targetIds(target, scope)) {
    try {
      await deleteLead(id, actor, scope);
      deleted++;
    } catch (e) {
      if (!(e instanceof NotFoundError) && !(e instanceof BusinessError)) throw e;
      skipped++;
    }
  }
  return { deleted, skipped };
}

/** Dropdown data for the viewer: projects they can work in, the assignable team per project, catalogue, lost reasons. */
export async function getCrmOptions(scope: CrmScope): Promise<CrmOptions> {
  const [projects, courses, batches, cfg, products] = await Promise.all([
    projectsFor(scope),
    Course.find({ isActive: true }).sort({ title: 1 }).lean(),
    Batch.find({ status: { $ne: "ARCHIVED" } })
      .sort({ startDate: -1 })
      .lean(),
    getSetting("crm.config"),
    activeProducts(),
  ]);
  const active = projects.filter((p) => p.status !== "ARCHIVED");
  const everyone = scope.all ? await listCrmUsers() : null;
  const teams: Record<string, { id: string; name: string; available?: boolean }[]> = {};
  for (const p of active)
    teams[String(p._id)] = canAssignIn(scope, p._id) ? (everyone ?? (await projectTeam(p))) : [{ id: scope.userId, name: "Me" }];
  return {
    projects: active.map((p) => ({
      id: String(p._id),
      name: p.name,
      code: p.code,
      canAssign: canAssignIn(scope, p._id),
      isDefault: !!p.isDefault,
    })),
    teams,
    staff: has(scope, "crm.projects.manage") ? (everyone ?? (await listCrmUsers())) : [],
    courses: courses.map((c) => ({ id: String(c._id), title: c.title })),
    batches: batches.map((b) => ({ id: String(b._id), label: `${b.name} (${b.code})`, courseId: String(b.courseId) })),
    lostReasons: cfg.lostReasons,
    products,
  };
}

interface ListRow extends LeadDoc {
  o?: { name: string }[];
  c?: { title: string }[];
  b?: { name: string }[];
  p?: { name: string; code: string }[];
}

const SEARCH_FIELDS = ["name", "email", "tags", "sourceDetail", "jetaFxClientId"] as const;
const contains = (s: string, flags = "i") => new RegExp(escapeRegex(s), flags);
const digitsOf = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");

/**
 * Lead search. A number (digits and phone punctuation only) matches the mobile, the JetaFX ID or a number in the notes
 * (a second number from a form, a number as typed). Anything else matches when every word is in the name, email, a
 * tag, the source, the JetaFX ID or the mobile, in any order, or when the whole text is in the notes (website messages).
 */
export function leadSearchFilter(q: string): Record<string, unknown> {
  // Short text would match inside too many notes.
  const inNotes = q.length >= 4 ? [{ notes: contains(q) }] : [];
  if (/\d/.test(q) && /^[\d\s()+\-.]+$/.test(q)) {
    const d = digitsOf(q);
    const or: Record<string, unknown>[] = [{ jetaFxClientId: contains(q.replace(/\s+/g, "")) }, ...inNotes];
    if (d.length >= 3) or.push({ phone: contains(d, "") }, { jetaFxClientId: contains(d, "") }, { notes: contains(d, "") });
    return { $or: or };
  }
  const words = q.split(/\s+/).slice(0, 8);
  const every = words.map((w) => {
    const d = digitsOf(w);
    return { $or: [...SEARCH_FIELDS.map((f) => ({ [f]: contains(w) })), ...(d.length >= 3 ? [{ phone: contains(d, "") }] : [])] };
  });
  return { $or: [{ $and: every }, ...inNotes] };
}

/** The Mongo conditions for a leads filter within the viewer's scope (shared by the list, CSV and bulk actions). */
export function leadMatch(filters: LeadFilters, scope: CrmScope): Record<string, unknown>[] {
  const at = now();
  const and: Record<string, unknown>[] = [{ mergedIntoId: null }];
  const sc = leadScopeFilter(scope);
  if (Object.keys(sc).length) and.push(sc);
  const q = filters.q?.trim();
  if (q) and.push(leadSearchFilter(q));
  const project = optId(filters.project);
  if (project) and.push({ projectId: project });
  const product = optId(filters.product);
  if (product) and.push({ productIds: product });
  if (filters.stage) and.push({ stage: filters.stage });
  // A product filter means converted leads, and a search looks for a person whatever their stage, so neither hides closed leads.
  else if (filters.view !== "all" && !product && !q) and.push({ stage: { $in: [...OPEN_LEAD_STAGES] } });
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
  return and;
}

/** One page of leads; `max` lets the CSV export read more than a screen. */
export async function listLeads(filters: LeadFilters, scope: CrmScope, opts?: { max?: number }): Promise<Paged<LeadListItem>> {
  const sort: Record<string, 1 | -1> =
    filters.sort === "created"
      ? { createdAt: -1 }
      : filters.sort === "name"
        ? { name: 1 }
        : filters.sort === "followUp"
          ? { followUpSort: 1, createdAt: -1 }
          : { lastActivityAt: -1, createdAt: -1 };
  const out = await facetPage<ListRow>(
    Lead,
    [
      { $match: { $and: leadMatch(filters, scope) } },
      ...(filters.sort === "followUp" ? [{ $addFields: { followUpSort: { $ifNull: ["$nextFollowUpAt", new Date(8.64e15)] } } }] : []),
    ],
    sort,
    filters,
    [
      { $lookup: { from: "user", localField: "ownerId", foreignField: "_id", as: "o" } },
      { $lookup: { from: "courses", localField: "courseInterestId", foreignField: "_id", as: "c" } },
      { $lookup: { from: "batches", localField: "batchInterestId", foreignField: "_id", as: "b" } },
      { $lookup: { from: "crmProjects", localField: "projectId", foreignField: "_id", as: "p" } },
    ],
    opts,
  );
  const products = await productNames();
  const rows = out.rows.map((r) => {
    const refs: LeadRefs = {
      owners: new Map(r.ownerId && r.o?.[0] ? [[String(r.ownerId), r.o[0].name]] : []),
      courses: new Map(r.courseInterestId && r.c?.[0] ? [[String(r.courseInterestId), r.c[0].title]] : []),
      batches: new Map(r.batchInterestId && r.b?.[0] ? [[String(r.batchInterestId), r.b[0].name]] : []),
      projects: new Map(r.p?.[0] ? [[String(r.projectId), { name: r.p[0].name, code: r.p[0].code }]] : []),
      products,
    };
    return toLeadListItem(r, refs);
  });
  return { ...out, rows };
}

/** Bulk actions by filter touch at most this many leads at once. */
export const BULK_CAP = 2_000;

/** Ids of every lead matching a filter (for "select all matching"); refuses rather than truncating past `BULK_CAP`. */
export async function leadIdsMatching(filters: LeadFilters, scope: CrmScope): Promise<string[]> {
  const docs = await Lead.find({ $and: leadMatch(filters, scope) }, { _id: 1 })
    .sort({ _id: 1 })
    .limit(BULK_CAP + 1)
    .lean();
  if (docs.length > BULK_CAP)
    throw new BusinessError(`That is more than ${BULK_CAP.toLocaleString("en")} leads. Narrow the filters and try again.`);
  return docs.map((d) => String(d._id));
}

export async function leadsCsv(filters: LeadFilters, scope: CrmScope) {
  const { rows } = await listLeads({ ...filters, page: 1, pageSize: EXPORT_CAP }, scope, { max: EXPORT_CAP });
  return toCsv(
    [
      "Name",
      "Mobile",
      "Email",
      "Country",
      "Project",
      "Source",
      "Source detail",
      "Stage",
      "Temperature",
      "Owner",
      "Course",
      "Batch",
      "Tags",
      "Next follow-up",
      "Last activity",
      "Created",
      "Lost reason",
      "Student ID",
      "Language",
      "JetaFX client ID",
      "Products",
    ],
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
      l.language ? LANGUAGE_LABELS[l.language] : null,
      l.jetaFxClientId,
      l.products.map((p) => p.name).join(", "),
    ]),
  );
}

/** `activityLimit`: how much of the timeline to load, newest first ("Show older activity" asks for more). */
export async function getLeadDetail(id: string, scope: CrmScope, activityLimit = 50): Promise<LeadDetail> {
  const lead = await loadLead(id, scope);
  const limit = Math.min(1000, Math.max(1, activityLimit));
  const [
    activities,
    activityTotal,
    openTasks,
    doneTasks,
    dups,
    options,
    account,
    course,
    batch,
    projects,
    products,
    conversions,
    deposits,
  ] = await Promise.all([
    LeadActivity.find({ leadId: lead._id }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean(),
    LeadActivity.countDocuments({ leadId: lead._id }),
    CrmTask.find({ leadId: lead._id, status: { $in: [...OPEN_TASK_STATUSES] } })
      .sort({ dueAt: 1, order: 1 })
      .lean(),
    CrmTask.find({ leadId: lead._id, status: { $nin: [...OPEN_TASK_STATUSES] } })
      .sort({ updatedAt: -1 })
      .limit(10)
      .lean(),
    findDuplicateLeads({ phone: lead.phone ?? null, email: lead.email ?? null }, lead._id),
    getCrmOptions(scope),
    lead.studentId ? null : findAccountByContact({ phone: lead.phone ?? null, email: lead.email ?? null }),
    lead.courseInterestId ? Course.findById(lead.courseInterestId, { title: 1 }).lean() : null,
    lead.batchInterestId ? Batch.findById(lead.batchInterestId, { name: 1 }).lean() : null,
    projectRefs([lead.projectId]),
    productNames(),
    LeadConversion.find({ leadId: lead._id }).sort({ convertedAt: 1, _id: 1 }).lean(),
    depositsForLead(lead._id, scope),
  ]);
  const names = await userNames([lead.ownerId, ...activities.map((a) => a.actorId)]);
  const refs: LeadRefs = {
    owners: names,
    courses: new Map(course ? [[String(course._id), course.title]] : []),
    batches: new Map(batch ? [[String(batch._id), batch.name]] : []),
    projects,
    products,
  };
  let student: LeadDetail["student"] = null;
  if (lead.studentId) {
    const [u, e] = await Promise.all([
      AuthUser.findById(lead.studentId, { name: 1, email: 1 }).lean(),
      getCurrentEnrollment(lead.studentId).catch(() => null),
    ]);
    if (u)
      student = {
        id: String(u._id),
        name: u.name,
        email: u.email,
        enrollment: e ? { status: e.e.status, paymentState: e.e.paymentState, batchName: e.batch.name } : null,
      };
  }
  // Duplicates outside the viewer's scope stay hidden (they can still be merged by a manager who sees both).
  const visibleDups = dups.filter((d) => canSeeLeadDoc(d, scope));
  return {
    lead: toLeadDto(lead, refs),
    activities: activities.map((a) => toActivityDto(a, names)),
    activityTotal,
    tasks: await tasksToDtos([...openTasks, ...doneTasks]),
    conversions: await toConversionDtos(conversions),
    deposits,
    student,
    matchingStudent: account?.kind === "student" ? { id: String(account.id), name: account.name, email: account.email } : null,
    duplicates: visibleDups.map((d) => ({
      id: String(d._id),
      name: d.name,
      phone: d.phone ?? null,
      email: d.email ?? null,
      stage: d.stage as LeadStage,
    })),
    can: {
      delete: has(scope, "crm.leads.delete"),
      assign: canAssignIn(scope, lead.projectId),
      claim: canClaim(lead, scope),
      moveProject: has(scope, "crm.projects.manage") || (managesProject(scope, lead.projectId) && scope.managed.length > 0),
      removeConversion: has(scope, "crm.manage"),
      reviewDeposits: has(scope, "crm.commission.manage"),
    },
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
