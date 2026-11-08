import { crmRoutes } from "@edge/contracts";
import { CALL_OUTCOMES, FOLLOWUP_TYPES, OPEN_TASK_STATUSES, TASK_PRIORITIES } from "@edge/domain/crm/enums";
import { z } from "zod";
import { clear, defined, defineTool, ref, zId, zPageNo, zPageSize, zWhen } from "./kit";
import { taskRow } from "./shapes";

const taskId = zId("Task");

export const listTasks = defineTool({
  name: "list_tasks",
  title: "List tasks",
  description:
    "Follow-ups and other tasks, soonest due first. scope mine (default) = assigned to this person; all = every task they " +
    "can see (their own, ones they created, and all tasks in projects they manage).",
  input: {
    scope: z.enum(["mine", "all"]).optional(),
    status: z.enum(["open", "done"]).optional().describe("Default open"),
    projectId: zId("Project").optional(),
    assigneeId: zId("Staff user").optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    page: zPageNo,
    pageSize: zPageSize,
  },
  routes: [crmRoutes.tasks],
  perms: ["crm.read"],
  kind: "read",
  async run(a, { call }) {
    const r = await call(crmRoutes.tasks, {
      query: {
        scope: a.scope,
        status: a.status,
        project: a.projectId,
        assignee: a.assigneeId,
        priority: a.priority,
        page: a.page ?? 1,
        pageSize: a.pageSize ?? 25,
      },
    });
    return { total: r.total, page: r.page, pageSize: r.pageSize, tasks: r.rows.map(taskRow) };
  },
});

export const getTask = defineTool({
  name: "get_task",
  title: "Get a task",
  description: "One task with its comments, who it can be assigned to, and whether this person may edit it.",
  input: { taskId },
  routes: [crmRoutes.task],
  perms: ["crm.read"],
  kind: "read",
  async run({ taskId: id }, { call }) {
    const d = await call(crmRoutes.task, { params: { id } });
    return {
      task: taskRow(d.task),
      comments: d.comments.map((c) => ({ id: c.id, by: c.author?.name ?? null, at: c.createdAt, body: c.body })),
      canBeAssignedTo: d.assignees.map(ref),
      canEdit: d.canEdit,
    };
  },
});

const taskFields = {
  description: z.string().trim().max(5000).optional(),
  type: z.enum(FOLLOWUP_TYPES).optional().describe("Default CALL"),
  priority: z.enum(TASK_PRIORITIES).optional().describe("Default MEDIUM"),
  dueAt: zWhen.optional(),
};

export const createTask = defineTool({
  name: "create_task",
  title: "Create a task",
  description:
    "Create a follow-up on a lead (give leadId; it goes in the lead's project and to its owner by default) or any other task " +
    "in a project (give projectId). The lead's next follow-up date comes from its open tasks.",
  input: {
    title: z.string().trim().min(2).max(160),
    leadId: zId("Lead").optional(),
    projectId: zId("Project").optional().describe("Required when there's no lead"),
    ...taskFields,
    assigneeId: zId("Staff user").optional().describe("Default: this person, or the lead's owner for a lead task"),
  },
  routes: [crmRoutes.createTask],
  perms: ["crm.write"],
  kind: "write",
  async run(a, { call }) {
    const { id } = await call(crmRoutes.createTask, { body: defined(a) });
    return { ok: true, taskId: id };
  },
});

export const updateTask = defineTool({
  name: "update_task",
  title: "Update a task",
  description: "Change a task's title, description, type, priority, due time or assignee. Send only what changes; null clears.",
  input: {
    taskId,
    title: z.string().trim().min(2).max(160).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    type: taskFields.type,
    priority: taskFields.priority,
    dueAt: zWhen.nullable().optional(),
    assigneeId: zId("Staff user").nullable().optional().describe("null = nobody"),
  },
  routes: [crmRoutes.updateTask],
  perms: ["crm.write"],
  kind: "write",
  idempotent: true,
  async run({ taskId: id, ...a }, { call }) {
    const body = defined({
      title: a.title,
      description: clear(a.description),
      type: a.type,
      priority: a.priority,
      dueAt: clear(a.dueAt),
      assigneeId: clear(a.assigneeId),
    });
    await call(crmRoutes.updateTask, { params: { id }, body });
    return { ok: true };
  },
});

export const moveTask = defineTool({
  name: "move_task",
  title: "Change a task's status",
  description:
    "Move a task to TODO, IN_PROGRESS or WAITING (this also reopens a done task). To finish one use complete_task; to drop " +
    "one use cancel_task.",
  input: { taskId, status: z.enum(OPEN_TASK_STATUSES) },
  routes: [crmRoutes.moveTask],
  perms: ["crm.write"],
  kind: "write",
  idempotent: true,
  async run({ taskId: id, status }, { call }) {
    return call(crmRoutes.moveTask, { params: { id }, body: { status } });
  },
});

export const completeTask = defineTool({
  name: "complete_task",
  title: "Complete a task",
  description: "Mark a task done, optionally with a note and call outcome (saved on the lead's timeline) and the next follow-up.",
  input: {
    taskId,
    note: z.string().trim().max(2000).optional(),
    outcome: z.enum(CALL_OUTCOMES).optional(),
    nextFollowUpAt: zWhen.optional().describe("Creates the next follow-up task"),
  },
  routes: [crmRoutes.completeTask],
  perms: ["crm.write"],
  kind: "write",
  async run({ taskId: id, ...body }, { call }) {
    return call(crmRoutes.completeTask, { params: { id }, body: defined(body) });
  },
});

export const cancelTask = defineTool({
  name: "cancel_task",
  title: "Cancel a task",
  description: "Cancel a task that is no longer needed.",
  input: { taskId },
  routes: [crmRoutes.cancelTask],
  perms: ["crm.write"],
  kind: "write",
  idempotent: true,
  async run({ taskId: id }, { call }) {
    return call(crmRoutes.cancelTask, { params: { id } });
  },
});

export const rescheduleTask = defineTool({
  name: "reschedule_task",
  title: "Reschedule a task",
  description: "Move a task to a new due time, or null to remove its due time.",
  input: { taskId, dueAt: zWhen.nullable() },
  routes: [crmRoutes.rescheduleTask],
  perms: ["crm.write"],
  kind: "write",
  idempotent: true,
  async run({ taskId: id, dueAt }, { call }) {
    return call(crmRoutes.rescheduleTask, { params: { id }, body: { dueAt: dueAt ?? "" } });
  },
});

export const commentOnTask = defineTool({
  name: "comment_on_task",
  title: "Comment on a task",
  description: "Add a comment to a task.",
  input: { taskId, body: z.string().trim().min(1).max(5000) },
  routes: [crmRoutes.commentTask],
  perms: ["crm.write"],
  kind: "write",
  async run({ taskId: id, body }, { call }) {
    return call(crmRoutes.commentTask, { params: { id }, body: { body } });
  },
});
