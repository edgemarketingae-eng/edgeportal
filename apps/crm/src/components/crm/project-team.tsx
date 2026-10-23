"use client";

import { ActionButton, ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Label } from "@edge/ui/components/label";
import { UserPlus } from "lucide-react";
import { projectMemberAction, removeProjectMemberAction } from "@/lib/actions/projects";

const select = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

export function AddMemberDialog({ projectId, staff, canSetManagers }: { projectId: string; staff: { id: string; name: string }[]; canSetManagers: boolean }) {
  if (!staff.length) return null;
  return (
    <ActionDialog
      action={projectMemberAction}
      hidden={{ id: projectId }}
      title="Add to the project"
      trigger={
        <Button size="sm" variant="outline">
          <UserPlus /> Add person
        </Button>
      }
      submitLabel="Add"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="member-user">Person</Label>
        <select id="member-user" name="userId" className={select}>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="member-role">Role in this project</Label>
        <select id="member-role" name="role" className={select} defaultValue="member">
          <option value="member">Sales executive (member)</option>
          {canSetManagers ? <option value="manager">Project manager</option> : null}
        </select>
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
