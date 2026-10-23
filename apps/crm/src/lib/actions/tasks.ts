"use server";

import { crmRoutes, type RouteBody } from "@edge/contracts";
import { dialogError, text, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { refresh } from "next/cache";
import { fail, run } from "./common";

type TaskBody = RouteBody<typeof crmRoutes.createTask>;

export async function addTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api(crmRoutes.createTask, {
      body: {
        projectId: text(form, "projectId") || undefined,
        leadId: text(form, "leadId") || undefined,
        title: text(form, "title"),
        description: text(form, "description"),
        type: (text(form, "type") || "CALL") as TaskBody["type"],
        priority: (text(form, "priority") || "MEDIUM") as TaskBody["priority"],
        dueAt: text(form, "dueAt"),
        assigneeId: text(form, "assigneeId") || undefined,
      },
    });
  } catch (e) {
    return dialogError(e);
  }
  refresh();
  return { ok: true, message: "Task created." };
}

export async function updateTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api(crmRoutes.updateTask, {
      params: { id: text(form, "id") },
      body: {
        title: text(form, "title"),
        description: text(form, "description"),
        type: text(form, "type") as TaskBody["type"],
        priority: text(form, "priority") as TaskBody["priority"],
        dueAt: text(form, "dueAt"),
        assigneeId: text(form, "assigneeId"),
      },
    });
  } catch (e) {
    return fail(e, Object.fromEntries(["title", "description", "type", "priority", "dueAt", "assigneeId"].map((k) => [k, text(form, k)])));
  }
  refresh();
  return { ok: true, message: "Task saved." };
}

/** Board drop: optimistic on the client; errors are returned, never thrown, so the board can revert. */
export async function moveTaskAction(input: { id: string; status: string; orderedIds: string[] }): Promise<ActionState> {
  return run(() => api(crmRoutes.moveTask, { params: { id: input.id }, body: { status: input.status as RouteBody<typeof crmRoutes.moveTask>["status"], orderedIds: input.orderedIds } }));
}

export async function completeTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() =>
    api(crmRoutes.completeTask, {
      params: { id: text(form, "taskId") },
      body: { note: text(form, "note"), outcome: text(form, "outcome") as RouteBody<typeof crmRoutes.completeTask>["outcome"], nextFollowUpAt: text(form, "nextFollowUpAt") },
    }),
  );
}

export async function cancelTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(crmRoutes.cancelTask, { params: { id: text(form, "taskId") } }));
}

export async function rescheduleTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(crmRoutes.rescheduleTask, { params: { id: text(form, "taskId") }, body: { dueAt: text(form, "dueAt") } }));
}

export async function commentTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api(crmRoutes.commentTask, { params: { id: text(form, "taskId") }, body: { body: text(form, "body") } });
  } catch (e) {
    return fail(e, { body: text(form, "body") });
  }
  refresh();
  return { ok: true, message: "Comment added." };
}
