"use client";

import type { TaskDetail } from "@edge/contracts";
import { FOLLOWUP_TYPES, TASK_PRIORITIES } from "@edge/domain/crm/enums";
import { FOLLOWUP_TYPE_LABELS, TASK_PRIORITY_LABELS } from "@edge/domain/crm/labels";
import { toDubaiLocal } from "@edge/domain/dates";
import { Button } from "@edge/ui/components/button";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { commentTaskAction, updateTaskAction } from "@/lib/actions/tasks";

const select = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function TaskForm({ detail }: { detail: TaskDetail }) {
  const [state, action, pending] = useActionState(updateTaskAction, {} as ActionState);
  useEffect(() => {
    if (state.ok) toast.success(state.message ?? "Saved");
  }, [state]);
  const t = detail.task;
  const v = state.values;
  return (
    <form key={JSON.stringify(v ?? {})} action={action} className="grid gap-4">
      <input type="hidden" name="id" value={t.id} />
      <FormError state={state} />
      <Field label="Title" name="title" defaultValue={v?.title ?? t.title} required />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="type">Type</Label>
          <select id="type" name="type" className={select} defaultValue={v?.type ?? t.type}>
            {FOLLOWUP_TYPES.map((x) => (
              <option key={x} value={x}>
                {FOLLOWUP_TYPE_LABELS[x]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="priority">Priority</Label>
          <select id="priority" name="priority" className={select} defaultValue={v?.priority ?? t.priority}>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <Field label="Due (Dubai time)" name="dueAt" type="datetime-local" defaultValue={v?.dueAt ?? (t.dueAt ? toDubaiLocal(t.dueAt) : "")} />
      </div>
      {detail.assignees.length > 1 ? (
        <div className="grid gap-1.5">
          <Label htmlFor="assigneeId">Assigned to</Label>
          <select id="assigneeId" name="assigneeId" className={select} defaultValue={v?.assigneeId ?? t.assignee?.id ?? ""}>
            <option value="">Unassigned</option>
            {detail.assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="assigneeId" value={t.assignee?.id ?? ""} />
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="description">Details</Label>
        <Textarea id="description" name="description" rows={4} defaultValue={v?.description ?? t.description ?? ""} />
      </div>
      <Button className="w-fit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save task"}
      </Button>
    </form>
  );
}

export function TaskCommentForm({ taskId }: { taskId: string }) {
  const [state, action, pending] = useActionState(commentTaskAction, {} as ActionState);
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="grid gap-2">
      <input type="hidden" name="taskId" value={taskId} />
      <FormError state={state} />
      <Textarea name="body" rows={2} placeholder="Add a comment…" defaultValue={state.values?.body} aria-label="Comment" required />
      <Button size="sm" className="w-fit" disabled={pending}>
        {pending ? "Posting…" : "Comment"}
      </Button>
    </form>
  );
}
