"use client";

import type { CrmOptions } from "@edge/contracts";
import { CALL_OUTCOMES, FOLLOWUP_TYPES, TASK_PRIORITIES } from "@edge/domain/crm/enums";
import { CALL_OUTCOME_LABELS, FOLLOWUP_TYPE_LABELS, TASK_PRIORITY_LABELS } from "@edge/domain/crm/labels";
import { toDubaiLocal } from "@edge/domain/dates";
import { ActionButton, ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Field } from "@edge/ui/forms/field";
import { Plus } from "lucide-react";
import { useState } from "react";
import { addTaskAction, cancelTaskAction, completeTaskAction, rescheduleTaskAction } from "@/lib/actions/tasks";

const select = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

/** Tomorrow 10:00 Dubai as a datetime-local default. */
function tomorrowTen() {
  return `${toDubaiLocal(new Date(Date.now() + 86_400_000)).slice(0, 10)}T10:00`;
}

function TaskFields({ projectId, teams, meId, withProject, projects }: { projectId?: string; teams: CrmOptions["teams"]; meId: string; withProject?: boolean; projects?: CrmOptions["projects"] }) {
  const [project, setProject] = useState(projectId ?? projects?.find((p) => p.isDefault)?.id ?? projects?.[0]?.id ?? "");
  const team = teams[project] ?? [];
  return (
    <>
      {withProject && projects ? (
        <div className="grid gap-1.5">
          <Label htmlFor="task-project">Project</Label>
          <select id="task-project" name="projectId" value={project} onChange={(e) => setProject(e.target.value)} className={select} required>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <Field label="Title" name="title" required placeholder="Call back about the November batch" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="task-type">Type</Label>
          <select id="task-type" name="type" className={select} defaultValue="CALL">
            {FOLLOWUP_TYPES.map((t) => (
              <option key={t} value={t}>
                {FOLLOWUP_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="task-priority">Priority</Label>
          <select id="task-priority" name="priority" className={select} defaultValue="MEDIUM">
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <Field label="Due (Dubai time)" name="dueAt" type="datetime-local" defaultValue={tomorrowTen()} />
      </div>
      {team.length > 1 ? (
        <div className="grid gap-1.5">
          <Label htmlFor="task-assignee">Assign to</Label>
          <select id="task-assignee" name="assigneeId" className={select} defaultValue={team.some((t) => t.id === meId) ? meId : ""}>
            <option value="">Lead owner / me</option>
            {team.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="task-description">Details</Label>
        <Textarea id="task-description" name="description" rows={2} />
      </div>
    </>
  );
}

/** New task on a lead (project fixed to the lead's) or standalone (project picked). */
export function AddTaskDialog({ leadId, projectId, options, meId, label = "Task" }: { leadId?: string; projectId?: string; options: CrmOptions; meId: string; label?: string }) {
  const hidden: Record<string, string> = leadId ? { leadId } : {};
  return (
    <ActionDialog
      action={addTaskAction}
      hidden={hidden}
      title={leadId ? "Schedule a follow-up" : "New task"}
      trigger={
        <Button size="sm" variant={leadId ? "outline" : "default"}>
          <Plus /> {label}
        </Button>
      }
      submitLabel="Create"
    >
      {leadId && projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
      <TaskFields projectId={projectId} teams={options.teams} meId={meId} withProject={!leadId} projects={options.projects} />
    </ActionDialog>
  );
}

export function CompleteTaskDialog({ taskId, type, title, lead }: { taskId: string; type: string; title: string; lead?: boolean }) {
  return (
    <ActionDialog action={completeTaskAction} hidden={{ taskId }} title={`Done: ${title}`} trigger={<Button size="sm">Done</Button>} submitLabel="Mark done">
      {type === "CALL" && lead ? (
        <div className="grid gap-1.5">
          <Label htmlFor={`outcome-${taskId}`}>Outcome</Label>
          <select id={`outcome-${taskId}`} name="outcome" className={select} defaultValue="ANSWERED">
            {CALL_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {CALL_OUTCOME_LABELS[o]}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor={`note-${taskId}`}>What happened?</Label>
        <Textarea id={`note-${taskId}`} name="note" rows={3} />
      </div>
      <Field label="Next follow-up (optional)" name="nextFollowUpAt" type="datetime-local" />
    </ActionDialog>
  );
}

export function RescheduleTaskDialog({ taskId, dueAt }: { taskId: string; dueAt: string | null }) {
  return (
    <ActionDialog
      action={rescheduleTaskAction}
      hidden={{ taskId }}
      title="Reschedule"
      description="Leave the field empty to remove the due date."
      trigger={
        <Button size="sm" variant="ghost">
          {dueAt ? "Reschedule" : "Set due date"}
        </Button>
      }
      submitLabel="Save"
    >
      <Field label="Due (Dubai time)" name="dueAt" type="datetime-local" defaultValue={dueAt ? toDubaiLocal(dueAt) : tomorrowTen()} />
    </ActionDialog>
  );
}

export function CancelTaskButton({ taskId }: { taskId: string }) {
  return (
    <ActionButton action={cancelTaskAction} hidden={{ taskId }} variant="ghost">
      Cancel
    </ActionButton>
  );
}
