"use client";

import { ActionButton, ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { NativeSelect } from "@edge/ui/components/native-select";
import { UserPlus } from "lucide-react";
import { projectMemberAction, removeProjectMemberAction } from "@/lib/actions/projects";
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
      <div className="grid content-start gap-2">
        <Label htmlFor="member-role">Role in this project</Label>
        <NativeSelect id="member-role" name="role" defaultValue="member">
          <option value="member">Sales executive (team member)</option>
          {canSetManagers ? <option value="manager">Project manager</option> : null}
        </NativeSelect>
      </div>
    </ActionDialog>
  );
}

export function RemoveMemberButton({ projectId, userId }: { projectId: string; userId: string }) {
  return (
    <ActionButton action={removeProjectMemberAction} hidden={{ id: projectId, userId }} variant="ghost">
      Remove
    </ActionButton>
  );
}
