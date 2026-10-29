"use client";

import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Select } from "@edge/ui/components/select";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addRecordingAction, scheduleClassAction } from "@/app/staff/class-actions";

function useResetOnOk(state: ActionState) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      toast.success(state.message ?? "Saved", { duration: 8000 });
      ref.current?.reset();
    }
  }, [state]);
  return ref;
}

/** React resets a form after every action; remounting with the submitted values keeps them after an error. */
const formKey = (state: ActionState) => JSON.stringify(state.values ?? {});

export function ScheduleClassForm({
  batches,
  hosts,
  defaultHostId,
}: {
  batches: { id: string; name: string }[];
  hosts: { id: string; name: string }[];
  defaultHostId?: string;
}) {
  const [state, action, pending] = useActionState(scheduleClassAction, {} as ActionState);
  const ref = useResetOnOk(state);
  const v = state.values;
  return (
    <form key={formKey(state)} ref={ref} action={action} className="grid gap-4">
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="batchId">Batch</Label>
          <Select id="batchId" name="batchId" defaultValue={v?.batchId} required>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="hostId">Host (Meet organizer)</Label>
          <Select id="hostId" name="hostId" defaultValue={v?.hostId ?? defaultHostId}>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Field label="Title" name="title" placeholder="Session 4: Supply and demand zones" defaultValue={v?.title} required />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" name="date" type="date" defaultValue={v?.date} required />
        <Field label="Start (Dubai time)" name="time" type="time" defaultValue={v?.time} required />
        <Field
          label="Duration (minutes)"
          name="durationMin"
          type="number"
          min={15}
          max={480}
          defaultValue={v?.durationMin ?? "90"}
          required
        />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea id="description" name="description" rows={2} defaultValue={v?.description} />
      </div>
      <Field
        label="Meet link (optional)"
        name="manualJoinUrl"
        type="url"
        placeholder="Leave empty to create a Google Meet automatically"
        defaultValue={v?.manualJoinUrl}
      />
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="openToAlumni" defaultChecked={v ? v.openToAlumni === "on" : true} /> Fully-paid students of earlier batches may
          join
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="notify" defaultChecked={v ? v.notify === "on" : true} /> Email the batch
        </label>
      </div>
      <Button className="w-fit" pending={pending}>
        Schedule class
      </Button>
    </form>
  );
}

export function AddRecordingForm({
  batches,
  sessions,
}: {
  batches: { id: string; name: string }[];
  sessions: { id: string; label: string; batchId: string }[];
}) {
  const [state, action, pending] = useActionState(addRecordingAction, {} as ActionState);
  const ref = useResetOnOk(state);
  const v = state.values;
  // The class list shows the chosen batch's classes; a failed save brings back the submitted batch.
  const initialBatch = v?.batchId ?? batches[0]?.id ?? "";
  const [batchId, setBatchId] = useState(initialBatch);
  const [seenBatch, setSeenBatch] = useState(initialBatch);
  if (initialBatch !== seenBatch) {
    setSeenBatch(initialBatch);
    setBatchId(initialBatch);
  }
  return (
    <form key={formKey(state)} ref={ref} action={action} className="grid gap-4">
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="rec-batch">Batch</Label>
          <Select id="rec-batch" name="batchId" value={batchId} onChange={(e) => setBatchId(e.target.value)} required>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="classSessionId">Class (optional)</Label>
          <Select key={batchId} id="classSessionId" name="classSessionId" defaultValue={v?.classSessionId ?? ""}>
            <option value="">Not linked to a class</option>
            {sessions
              .filter((s) => s.batchId === batchId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
          </Select>
        </div>
      </div>
      <Field
        label="Google Drive link"
        name="driveUrl"
        placeholder="https://drive.google.com/file/d/…/view"
        defaultValue={v?.driveUrl}
        required
        hint="The file must be shared with the class host or the academy host account."
      />
      <Field label="Title" name="title" defaultValue={v?.title} required />
      <div className="grid content-start gap-2">
        <Label htmlFor="rec-desc">Description (optional)</Label>
        <Textarea id="rec-desc" name="description" rows={2} defaultValue={v?.description} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="publish" defaultChecked={v ? v.publish === "on" : true} /> Publish to students now
      </label>
      <Button className="w-fit" pending={pending}>
        Add recording
      </Button>
    </form>
  );
}
