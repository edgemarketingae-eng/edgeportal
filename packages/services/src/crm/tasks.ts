import type { BoardDto, Paged, TaskDetail, TaskDto, TaskInput, TaskUpdateInput } from "@edge/contracts";
import { CrmTask, Lead, TaskComment, Types, withTx, type CrmTaskDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import { OPEN_TASK_STATUSES, type CrmTaskStatus, type FollowUpType, type TaskPriority } from "@edge/domain/crm/enums";
import { formatDateTime, startOfDubaiDay } from "@edge/domain/dates";
import type { Actor } from "@edge/domain/enums";
import { audit } from "../audit";
import { NotFoundError, TransitionError, ValidationError } from "../errors";
import { iso } from "../mappers";
import { oid } from "../ids";
import {
  actorId,
  createTaskInTx,
  isOpenTask,
  loadLead,
  localDate,
  optId,
  recomputeNextFollowUp,
  recordActivity,
  tasksToDtos,
  taskToTouchType,
  touchPatch,
  userNames,
} from "./common";
import {
  assertAssignable,
  canAssignIn,
  canSeeTask,
  inProject,
  listCrmUsers,
  managesProject,
  projectTeam,
  taskScopeFilter,
  type CrmScope,
} from "./scope";
import { findPage, type PageInput } from "../paging";

async function loadTask(id: string, scope: CrmScope): Promise<CrmTaskDoc> {
  const task = await CrmTask.findById(oid(id, "Task")).lean();
  if (!task || !canSeeTask(task, scope)) throw new NotFoundError("Task");
  return task as CrmTaskDoc;
}

const canEditTask = (t: CrmTaskDoc, s: CrmScope) =>
  s.all || !!t.assigneeId?.equals(s.me) || !!t.createdById?.equals(s.me) || managesProject(s, t.projectId);

/** A task on a lead (project = the lead's) or a standalone task in a project the viewer belongs to. */
export async function createTask(input: TaskInput, actor: Actor & { type: "USER" }, scope: CrmScope) {
  let projectId: Types.ObjectId;
  let leadId: Types.ObjectId | null = null;
  let defaultAssigneeId: Types.ObjectId | null = null;
  if (input.leadId) {
    const lead = await loadLead(input.leadId, scope);
    if (lead.mergedIntoId) throw new TransitionError("This lead was merged into another lead");
    projectId = lead.projectId;
    leadId = lead._id;
    defaultAssigneeId = lead.ownerId ?? null;
  } else {
    const p = optId(input.projectId);
    if (!p || !inProject(scope, p)) throw new ValidationError({ projectId: "Choose one of your projects" });
    projectId = p;
  }
  const dueAt = localDate(input.dueAt, "dueAt");
  const assigneeId = input.assigneeId ? await assertAssignable(scope, projectId, input.assigneeId, "assigneeId") : undefined;
  const task = await withTx(async () => {
    const t = await createTaskInTx(
      { projectId, leadId, defaultAssigneeId },
      {
        title: input.title.trim(),
        type: input.type ?? "CALL",
        priority: input.priority ?? "MEDIUM",
        description: input.description?.trim() || null,
        dueAt,
        ...(assigneeId ? { assigneeId } : {}),
      },
      actor,
    );
    await audit({
      actor,
      action: "task.create",
      entityType: "CrmTask",
      entityId: String(t._id),
      after: { projectId: String(projectId), leadId: leadId ? String(leadId) : null, title: input.title },
    });
    return t;
  });
  return String(task._id);
}

export async function getTaskDetail(id: string, scope: CrmScope): Promise<TaskDetail> {
  const task = await loadTask(id, scope);
  const [dto] = await tasksToDtos([task]);
  const comments = await TaskComment.find({ taskId: task._id }).sort({ createdAt: 1 }).lean();
  const names = await userNames(comments.map((c) => c.authorId));
  const assignees = canAssignIn(scope, task.projectId)
    ? scope.all
      ? await listCrmUsers()
      : await projectTeam(task.projectId)
    : [{ id: scope.userId, name: "Me" }];
  return {
    task: dto!,
    comments: comments.map((c) => ({
      id: String(c._id),
      body: c.body,
      author: { id: String(c.authorId), name: names.get(String(c.authorId)) ?? "Unknown" },
      createdAt: iso(c.createdAt)!,
    })),
    assignees,
    canEdit: canEditTask(task, scope),
  };
}

export async function updateTask(id: string, input: TaskUpdateInput, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const task = await loadTask(id, scope);
  if (!canEditTask(task, scope)) throw new NotFoundError("Task");
  const set: Record<string, unknown> = {};
  if (input.title !== undefined) set.title = input.title.trim();
  if (input.description !== undefined) set.description = input.description.trim() || null;
  if (input.type !== undefined) set.type = input.type;
  if (input.priority !== undefined) set.priority = input.priority;
  if (input.dueAt !== undefined) set.dueAt = localDate(input.dueAt, "dueAt");
  if (input.assigneeId !== undefined) {
    const to = input.assigneeId ? await assertAssignable(scope, task.projectId, input.assigneeId, "assigneeId") : null;
    if (String(to ?? "") !== String(task.assigneeId ?? "")) set.assigneeId = to;
  }
  if (!Object.keys(set).length) return;
  await withTx(async () => {
    await CrmTask.updateOne({ _id: task._id }, { $set: set });
    if (task.leadId && set.dueAt !== undefined) await recomputeNextFollowUp(task.leadId);
    await audit({ actor, action: "task.update", entityType: "CrmTask", entityId: id, after: set });
  });
}

/** Board drop: new status, then the target column's order rewritten from the client's list (stale ids are ignored). */
export async function moveTask(
  id: string,
  input: { status: CrmTaskStatus; orderedIds?: string[] },
  actor: Actor & { type: "USER" },
  scope: CrmScope,
) {
  const task = await loadTask(id, scope);
  if (!canEditTask(task, scope)) throw new NotFoundError("Task");
  const at = now();
  const closing = !isOpenTask(input.status);
  const wasClosed = !isOpenTask(task.status);
  await withTx(async () => {
    const set: Record<string, unknown> = { status: input.status };
    if (closing && !wasClosed) Object.assign(set, { completedAt: at, completedById: actorId(actor) });
    if (!closing && wasClosed) Object.assign(set, { completedAt: null, completedById: null });
    await CrmTask.updateOne({ _id: task._id }, { $set: set });
    const ids = (input.orderedIds ?? []).map((x) => optId(x)).filter((x): x is Types.ObjectId => !!x);
    if (ids.length) {
      await CrmTask.bulkWrite(
        ids.map((_id, i) => ({
          updateOne: { filter: { _id, projectId: task.projectId, status: input.status }, update: { $set: { order: i } } },
        })),
      );
    }
    if (task.leadId && closing !== wasClosed) {
      await recordActivity(
        task.leadId,
        input.status === "DONE" ? "TASK_DONE" : input.status === "CANCELLED" ? "TASK_CANCELLED" : "SYSTEM",
        actor,
        {
          body: closing ? null : `Follow-up “${task.title}” reopened`,
          data: { taskId: String(task._id), title: task.title, type: task.type, via: "board" },
        },
      );
      await recomputeNextFollowUp(task.leadId);
    } else if (task.leadId && task.status !== input.status) {
      await recordActivity(task.leadId, "SYSTEM", actor, {
        body: `Follow-up “${task.title}” moved to ${input.status.replace("_", " ").toLowerCase()}`,
        data: { taskId: String(task._id), status: input.status },
      });
    }
    await audit({
      actor,
      action: "task.move",
      entityType: "CrmTask",
      entityId: id,
      before: { status: task.status },
      after: { status: input.status },
    });
  });
}

/** Mark done with an outcome; for lead tasks this counts as a touch and may schedule the next follow-up. */
export async function completeTask(
  id: string,
  input: { note?: string; outcome?: string; nextFollowUpAt?: string },
  actor: Actor & { type: "USER" },
  scope: CrmScope,
) {
  const task = await loadTask(id, scope);
  if (!isOpenTask(task.status)) throw new TransitionError("This task is already closed");
  const dueAt = localDate(input.nextFollowUpAt, "nextFollowUpAt");
  const at = now();
  await withTx(async () => {
    const r = await CrmTask.updateOne(
      { _id: task._id, status: { $in: [...OPEN_TASK_STATUSES] } },
      { $set: { status: "DONE", completedAt: at, completedById: actorId(actor) } },
    );
    if (r.modifiedCount !== 1) throw new TransitionError("This task is already closed");
    if (task.leadId) {
      const lead = await Lead.findById(task.leadId).lean();
      const touch = taskToTouchType(task.type as FollowUpType);
      await recordActivity(task.leadId, "TASK_DONE", actor, {
        body: input.note?.trim() || null,
        outcome: input.outcome || null,
        direction: touch === "NOTE" ? null : "OUT",
        data: { taskId: String(task._id), title: task.title, type: task.type },
      });
      if (lead) {
        const { set, autoStage } = touchPatch(lead, touch, at);
        await Lead.updateOne({ _id: lead._id }, { $set: set });
        if (autoStage) await recordActivity(lead._id, "STAGE_CHANGED", actor, { data: { from: lead.stage, to: autoStage, auto: true } });
      }
      if (dueAt)
        await createTaskInTx(
          { projectId: task.projectId, leadId: task.leadId, defaultAssigneeId: task.assigneeId ?? null },
          { title: "Follow up", type: task.type as FollowUpType, priority: task.priority as TaskPriority, dueAt },
          actor,
        );
      await recomputeNextFollowUp(task.leadId);
    } else if (dueAt) {
      await createTaskInTx(
        { projectId: task.projectId, leadId: null, defaultAssigneeId: task.assigneeId ?? null },
        { title: task.title, type: task.type as FollowUpType, priority: task.priority as TaskPriority, dueAt },
        actor,
      );
    }
    await audit({ actor, action: "task.complete", entityType: "CrmTask", entityId: id, after: { outcome: input.outcome || null } });
  });
}

export async function cancelTask(id: string, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const task = await loadTask(id, scope);
  if (!isOpenTask(task.status)) throw new TransitionError("This task is already closed");
  await withTx(async () => {
    await CrmTask.updateOne(
      { _id: task._id, status: { $in: [...OPEN_TASK_STATUSES] } },
      { $set: { status: "CANCELLED", completedAt: now(), completedById: actorId(actor) } },
    );
    if (task.leadId) {
      await recordActivity(task.leadId, "TASK_CANCELLED", actor, { data: { taskId: String(task._id), title: task.title } });
      await recomputeNextFollowUp(task.leadId);
    }
    await audit({ actor, action: "task.cancel", entityType: "CrmTask", entityId: id });
  });
}

export async function rescheduleTask(id: string, dueAtLocal: string | undefined, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const task = await loadTask(id, scope);
  if (!isOpenTask(task.status)) throw new TransitionError("This task is already closed");
  const dueAt = localDate(dueAtLocal, "dueAt");
  await withTx(async () => {
    await CrmTask.updateOne({ _id: task._id }, { $set: { dueAt } });
    if (task.leadId) {
      await recordActivity(task.leadId, "SYSTEM", actor, {
        body: dueAt ? `Follow-up “${task.title}” moved to ${formatDateTime(dueAt)}` : `Due date removed from “${task.title}”`,
        data: { taskId: String(task._id), dueAt: dueAt?.toISOString() ?? null },
      });
      await recomputeNextFollowUp(task.leadId);
    }
    await audit({ actor, action: "task.reschedule", entityType: "CrmTask", entityId: id, before: { dueAt: task.dueAt }, after: { dueAt } });
  });
}

export async function addTaskComment(id: string, body: string, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const task = await loadTask(id, scope);
  const [c] = await TaskComment.create([{ taskId: task._id, body: body.trim(), authorId: oid(actor.id) }]);
  await CrmTask.updateOne({ _id: task._id }, { $set: { updatedAt: now() } });
  return String(c!._id);
}

interface TaskFilters {
  project?: string;
  assignee?: string;
  priority?: string;
}

function taskMatch(scope: CrmScope, f: TaskFilters): Record<string, unknown>[] {
  const and: Record<string, unknown>[] = [];
  const sc = taskScopeFilter(scope);
  if (Object.keys(sc).length) and.push(sc);
  const project = optId(f.project);
  if (project) and.push({ projectId: project });
  if (f.assignee === "me") and.push({ assigneeId: scope.me });
  else if (f.assignee === "unassigned") and.push({ assigneeId: null });
  else {
    const a = optId(f.assignee);
    if (a) and.push({ assigneeId: a });
  }
  if (f.priority) and.push({ priority: f.priority });
  return and;
}

/** Open columns by position, plus the last week of Done. */
export async function getBoard(scope: CrmScope, f: TaskFilters): Promise<BoardDto> {
  const and = taskMatch(scope, f);
  const base = and.length ? { $and: and } : {};
  const [open, done] = await Promise.all([
    CrmTask.find({ ...base, status: { $in: [...OPEN_TASK_STATUSES] } })
      .sort({ order: 1, createdAt: 1 })
      .limit(600)
      .lean(),
    CrmTask.find({ ...base, status: "DONE", completedAt: { $gte: new Date(now().getTime() - 7 * 86_400_000) } })
      .sort({ completedAt: -1 })
      .limit(50)
      .lean(),
  ]);
  const dtos = await tasksToDtos([...open, ...done] as CrmTaskDoc[]);
  const by = (status: string) => dtos.filter((t) => t.status === status);
  return { TODO: by("TODO"), IN_PROGRESS: by("IN_PROGRESS"), WAITING: by("WAITING"), DONE: by("DONE") };
}

export async function listTasks(
  scope: CrmScope,
  q: TaskFilters & PageInput & { scope: "mine" | "all"; status: "open" | "done" },
): Promise<Paged<TaskDto>> {
  const and = taskMatch(scope, q);
  if (q.scope !== "all") and.push({ assigneeId: scope.me });
  const base = and.length ? { $and: and } : {};
  const page =
    q.status === "done"
      ? await findPage<CrmTaskDoc>(CrmTask, { ...base, status: { $nin: [...OPEN_TASK_STATUSES] } }, { completedAt: -1 }, q)
      : await findPage<CrmTaskDoc>(CrmTask, { ...base, status: { $in: [...OPEN_TASK_STATUSES] } }, { dueAt: 1, order: 1 }, q);
  return { ...page, rows: await tasksToDtos(page.rows) };
}

/** Open tasks assigned to the viewer due today or earlier (the nav badge). */
export async function dueTaskCount(scope: CrmScope) {
  return CrmTask.countDocuments({
    assigneeId: scope.me,
    status: { $in: [...OPEN_TASK_STATUSES] },
    dueAt: { $lt: startOfDubaiDay(now(), 1) },
  });
}
