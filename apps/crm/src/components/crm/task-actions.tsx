"use client";

import type { CrmOptions } from "@edge/contracts";
import { CALL_OUTCOMES, FOLLOWUP_TYPES, TASK_PRIORITIES } from "@edge/domain/crm/enums";
import { CALL_OUTCOME_LABELS, FOLLOWUP_TYPE_LABELS, TASK_PRIORITY_LABELS } from "@edge/domain/crm/labels";
import { toDubaiLocal } from "@edge/domain/dates";
import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@edge/ui/components/dropdown-menu";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Select } from "@edge/ui/components/select";
import { Field } from "@edge/ui/forms/field";
import { CalendarClock, Ellipsis, Plus, X } from "lucide-react";
import { useState } from "react";
import { addTaskAction, cancelTaskAction, completeTaskAction, rescheduleTaskAction } from "@/lib/actions/tasks";

/** Tomorrow 10:00 Dubai as a datetime-local default. */
function tomorrowTen() {
  return `${toDubaiLocal(new Date(Date.now() + 86_400_000)).slice(0, 10)}T10:00`;
}

function TaskFields({
  projectId,
  teams,
  meId,
  withProject,
  projects,
}: {
  projectId?: string;
  teams: CrmOptions["teams"];
  meId: string;
  withProject?: boolean;
  projects?: CrmOptions["projects"];
}) {
  const [project, setProject] = useState(projectId ?? projects?.find((p) => p.isDefault)?.id ?? projects?.[0]?.id ?? "");
  const team = teams[project] ?? [];
  return (
    <>
      {withProject && projects ? (
        <div className="grid content-start gap-2">
          <Label htmlFor="task-project">Project</Label>
          <Select id="task-project" name="projectId" value={project} onChange={(e) => setProject(e.target.value)} required>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <Field label="Title" name="title" required placeholder="Call back about the November batch" />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="task-type">Type</Label>
          <Select id="task-type" name="type" defaultValue="CALL">
            {FOLLOWUP_TYPES.map((t) => (
              <option key={t} value={t}>
                {FOLLOWUP_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="task-priority">Priority</Label>
          <Select id="task-priority" name="priority" defaultValue="MEDIUM">
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </div>
        <Field label="Due (Dubai time)" name="dueAt" type="datetime-local" defaultValue={tomorrowTen()} className="sm:col-span-2" />
      </div>
      {team.length > 1 ? (
        <div className="grid content-start gap-2">
          <Label htmlFor="task-assignee">Assign to</Label>
          {/* Keyed by the project, so a new project's team starts on its default too. */}
          <Select key={project} id="task-assignee" name="assigneeId" defaultValue={team.some((t) => t.id === meId) ? meId : ""}>
            <option value="">Lead owner / me</option>
            {team.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <div className="grid content-start gap-2">
        <Label htmlFor="task-description">Details</Label>
        <Textarea id="task-description" name="description" rows={2} />
      </div>
    </>
  );
}

/** New task on a lead (project fixed to the lead's) or standalone (project picked). */
export function AddTaskDialog({
  leadId,
  projectId,
  options,
  meId,
  label = "Task",
}: {
  leadId?: string;
  projectId?: string;
  options: CrmOptions;
  meId: string;
  label?: string;
}) {
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
    <ActionDialog
      action={completeTaskAction}
      hidden={{ taskId }}
      title={`Done: ${title}`}
      trigger={<Button size="sm">Done</Button>}
      submitLabel="Mark done"
    >
      {type === "CALL" && lead ? (
        <div className="grid content-start gap-2">
          <Label htmlFor={`outcome-${taskId}`}>Outcome</Label>
          <Select id={`outcome-${taskId}`} name="outcome" defaultValue="ANSWERED">
            {CALL_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {CALL_OUTCOME_LABELS[o]}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <div className="grid content-start gap-2">
        <Label htmlFor={`note-${taskId}`}>What happened?</Label>
        <Textarea id={`note-${taskId}`} name="note" rows={3} />
      </div>
      <Field label="Next follow-up (optional)" name="nextFollowUpAt" type="datetime-local" />
    </ActionDialog>
  );
}

/** Opens a dialog from a menu item instead of its own button. */
type Controlled = { open: boolean; onOpenChange: (open: boolean) => void };

export function RescheduleTaskDialog({ taskId, dueAt, controlled }: { taskId: string; dueAt: string | null; controlled?: Controlled }) {
  return (
    <ActionDialog
      {...controlled}
      action={rescheduleTaskAction}
      hidden={{ taskId }}
      title="Reschedule"
      description="Leave the field empty to remove the due date."
      trigger={
        controlled ? undefined : (
          <Button size="sm" variant="ghost">
            {dueAt ? "Reschedule" : "Set due date"}
          </Button>
        )
      }
      submitLabel="Save"
    >
      <Field label="Due (Dubai time)" name="dueAt" type="datetime-local" defaultValue={dueAt ? toDubaiLocal(dueAt) : tomorrowTen()} />
    </ActionDialog>
  );
}

export function CancelTaskButton({ taskId, controlled }: { taskId: string; controlled?: Controlled }) {
  return (
    <ActionDialog
      {...controlled}
      action={cancelTaskAction}
      hidden={{ taskId }}
      title="Cancel this task?"
      description="It moves to the closed tasks and no longer counts as the lead's next follow-up."
      trigger={
        controlled ? undefined : (
          <Button size="sm" variant="ghost">
            Cancel task
          </Button>
        )
      }
      submitLabel="Cancel task"
      cancelLabel="Keep task"
      destructive
    />
  );
}

/** A task row's actions in lists: Done, with Reschedule and Cancel in a menu so rows stay one line. */
export function TaskRowActions({
  taskId,
  type,
  title,
  lead,
  dueAt,
}: {
  taskId: string;
  type: string;
  title: string;
  lead?: boolean;
  dueAt: string | null;
}) {
  const [dialog, setDialog] = useState<"reschedule" | "cancel" | null>(null);
  const controlled = (d: "reschedule" | "cancel") => ({ open: dialog === d, onOpenChange: (o: boolean) => setDialog(o ? d : null) });
  return (
    <div className="flex items-center gap-1">
      <CompleteTaskDialog taskId={taskId} type={type} title={title} lead={lead} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`More actions for ${title}`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("reschedule")}>
            <CalendarClock /> {dueAt ? "Reschedule…" : "Set due date…"}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("cancel")}>
            <X /> Cancel task…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Outside the menu, which closes (and unmounts) as a dialog opens. */}
      <RescheduleTaskDialog taskId={taskId} dueAt={dueAt} controlled={controlled("reschedule")} />
      <CancelTaskButton taskId={taskId} controlled={controlled("cancel")} />
    </div>
  );
}
