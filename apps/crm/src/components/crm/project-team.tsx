"use client";

import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { SegmentedControl } from "@edge/ui/forms/segmented-control";
import { Trash2, UserPlus } from "lucide-react";
import { deleteProjectAction, projectMemberAction, removeProjectMemberAction } from "@/lib/actions/projects";
import { ConfirmDelete } from "./lead-controls";
import { sortForTeam } from "./project-form";

export function AddMemberDialog({
  projectId,
  staff,
  canSetManagers,
}: {
  projectId: string;
  staff: { id: string; name: string; roles?: string[] }[];
  canSetManagers: boolean;
}) {
  if (!staff.length) return null;
  return (
    <ActionDialog
      action={projectMemberAction}
      hidden={{ id: projectId }}
      title="Add people to the project"
      description="Sales executives work the project's leads and receive its round-robin leads. Project managers also run its team."
      trigger={
        <Button size="sm">
          <UserPlus /> Add people
        </Button>
      }
      submitLabel="Add to project"
    >
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-semibold">People</legend>
        <div className="grid max-h-72 gap-2 overflow-y-auto rounded-lg border p-3">
          {sortForTeam(staff).map((s) => (
            <div key={s.id} className="flex items-start gap-2">
              <Checkbox id={`add-${s.id}`} name="userIds" value={s.id} className="mt-0.5" />
              <Label htmlFor={`add-${s.id}`} className="block leading-snug font-normal">
                {s.name}
                {s.roles?.length ? <span className="text-muted-foreground block text-xs">{s.roles.join(", ")}</span> : null}
              </Label>
            </div>
          ))}
        </div>
      </fieldset>
      {canSetManagers ? (
        <SegmentedControl
          name="role"
          label="Role in this project"
          defaultValue="member"
          options={[
            { value: "member", label: "Sales executive" },
            { value: "manager", label: "Project manager" },
          ]}
        />
      ) : (
        <input type="hidden" name="role" value="member" />
      )}
    </ActionDialog>
  );
}

export function RemoveMemberButton({ projectId, userId, name }: { projectId: string; userId: string; name: string }) {
  return (
    <ActionDialog
      action={removeProjectMemberAction}
      hidden={{ id: projectId, userId }}
      title={`Remove ${name} from the project?`}
      description="They leave the project's team and get none of its round-robin leads from now on. Leads they already own stay with them."
      trigger={
        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
          Remove
        </Button>
      }
      submitLabel="Remove"
      destructive
    />
  );
}

/** CRM admins delete a project once it has no leads and no team. */
export function DeleteProjectDialog({ projectId, name }: { projectId: string; name: string }) {
  return (
    <ActionDialog
      action={deleteProjectAction}
      hidden={{ id: projectId }}
      title={`Delete ${name}?`}
      description="The project is removed for good, with its tasks that have no lead. This can't be undone."
      trigger={
        <Button size="sm" variant="destructive">
          <Trash2 /> Delete project
        </Button>
      }
      submitLabel="Delete project"
      destructive
    >
      <ConfirmDelete />
    </ActionDialog>
  );
}
