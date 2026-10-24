"use client";

import { ActionButton, ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Field } from "@edge/ui/forms/field";
import { cancelClassAction, rescheduleClassAction, setRecordingStatusAction } from "@/app/staff/class-actions";

export interface ClassRow {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  durationMin: number;
  manualJoinUrl: string;
  upcoming: boolean;
}

export function ClassRowActions({ c }: { c: ClassRow }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline">
        <a href={`/api/join/${c.id}`} target="_blank" rel="noreferrer">
          Open Meet
        </a>
      </Button>
      <ActionDialog
        action={rescheduleClassAction}
        hidden={{ id: c.id }}
        title="Edit class"
        trigger={
          <Button size="sm" variant="outline">
            Edit
          </Button>
        }
        submitLabel="Save"
      >
        <Field label="Title" name="title" defaultValue={c.title} required />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date" name="date" type="date" defaultValue={c.date} required />
          <Field label="Start (Dubai)" name="time" type="time" defaultValue={c.time} required />
          <Field label="Minutes" name="durationMin" type="number" defaultValue={String(c.durationMin)} required />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor={`d-${c.id}`}>Description</Label>
          <Textarea id={`d-${c.id}`} name="description" rows={2} defaultValue={c.description} />
        </div>
        <Field
          label="Meet link override"
          name="manualJoinUrl"
          type="url"
          defaultValue={c.manualJoinUrl}
          hint="Used when the automatic Meet link is missing."
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="notify" defaultChecked /> Email students if the time changes
        </label>
      </ActionDialog>
      {c.upcoming ? (
        <ActionDialog
          action={cancelClassAction}
          hidden={{ id: c.id }}
          title="Cancel class"
          trigger={
            <Button size="sm" variant="outline">
              Cancel
            </Button>
          }
          submitLabel="Cancel class"
          destructive
        >
          <Label htmlFor={`r-${c.id}`}>Reason (shown to students)</Label>
          <Textarea id={`r-${c.id}`} name="reason" rows={2} />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="notify" defaultChecked /> Email the batch
          </label>
        </ActionDialog>
      ) : null}
    </div>
  );
}

export function RecordingStatusButton({ id, status }: { id: string; status: string }) {
  const publish = status !== "PUBLISHED";
  return (
    <ActionButton
      action={setRecordingStatusAction}
      hidden={{ id, status: publish ? "PUBLISHED" : "HIDDEN" }}
      variant={publish ? "default" : "outline"}
    >
      {publish ? "Publish" : "Hide"}
    </ActionButton>
  );
}
