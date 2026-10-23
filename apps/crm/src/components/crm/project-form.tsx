"use client";

import { PROJECT_STATUSES } from "@edge/domain/crm/enums";
import { PROJECT_STATUS_LABELS } from "@edge/domain/crm/labels";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveProjectAction } from "@/lib/actions/projects";

export interface ProjectFormValues {
  id?: string;
  name: string;
  code: string;
  description: string;
  status: string;
  courseId: string;
  batchId: string;
  startDate: string;
  endDate: string;
  targetLeads: string;
  targetConversions: string;
  managerIds: string[];
  memberIds: string[];
}

export const EMPTY_PROJECT: ProjectFormValues = { name: "", code: "", description: "", status: "ACTIVE", courseId: "", batchId: "", startDate: "", endDate: "", targetLeads: "", targetConversions: "", managerIds: [], memberIds: [] };

const select = "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm";

function restore(values: ProjectFormValues, s?: Record<string, string>): ProjectFormValues {
  if (!s) return values;
  return { ...values, ...s, managerIds: s.managerIds ? s.managerIds.split(",") : [], memberIds: s.memberIds ? s.memberIds.split(",") : [] };
}

function People({ name, legend, staff, selected }: { name: string; legend: string; staff: { id: string; name: string }[]; selected: string[] }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {staff.length === 0 ? <p className="text-muted-foreground text-xs">No CRM staff yet.</p> : null}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {staff.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <Checkbox id={`${name}-${s.id}`} name={name} value={s.id} defaultChecked={selected.includes(s.id)} />
            <Label htmlFor={`${name}-${s.id}`} className="font-normal">
              {s.name}
            </Label>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Create / edit a project. `canSetStatus` and `canSetManagers` follow crm.projects.manage; project managers
 * can still edit details and members of their own projects.
 */
export function ProjectForm({
  values,
  staff,
  courses,
  batches,
  canSetManagers,
}: {
  values: ProjectFormValues;
  staff: { id: string; name: string }[];
  courses: { id: string; title: string }[];
  batches: { id: string; label: string; courseId: string }[];
  canSetManagers: boolean;
}) {
  const [state, action, pending] = useActionState(saveProjectAction, {} as ActionState);
  useEffect(() => {
    if (state.ok) toast.success(state.message ?? "Saved");
  }, [state]);
  const fe = state.fieldErrors ?? {};
  const v = restore(values, state.values);
  const creating = !values.id;
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="grid gap-4">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" defaultValue={v.name} error={fe.name} placeholder="Forex Pro - November drive" required />
        <Field label="Code" name="code" defaultValue={v.code} error={fe.code} placeholder="auto from the name" hint="Short identifier shown on leads and exports" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={3} defaultValue={v.description} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" className={select} defaultValue={v.status} disabled={!canSetManagers}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          {!canSetManagers ? <input type="hidden" name="status" value={v.status} /> : null}
        </div>
        <Field label="Start date" name="startDate" type="date" defaultValue={v.startDate} error={fe.startDate} />
        <Field label="End date" name="endDate" type="date" defaultValue={v.endDate} error={fe.endDate} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="courseId">Target course</Label>
          <select id="courseId" name="courseId" className={select} defaultValue={v.courseId}>
            <option value="">Not set</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="batchId">Target batch</Label>
          <select id="batchId" name="batchId" className={select} defaultValue={v.batchId}>
            <option value="">Not set</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
        <Field label="Target leads" name="targetLeads" type="number" min={0} defaultValue={v.targetLeads} error={fe.targetLeads} />
        <Field label="Target conversions" name="targetConversions" type="number" min={0} defaultValue={v.targetConversions} error={fe.targetConversions} />
      </div>
      {creating ? (
        <>
          {canSetManagers ? <People name="managerIds" legend="Project managers" staff={staff} selected={v.managerIds} /> : null}
          <People name="memberIds" legend="Sales executives" staff={staff} selected={v.memberIds} />
        </>
      ) : null}
      <Button type="submit" className="w-fit" disabled={pending}>
        {pending ? "Saving…" : creating ? "Create project" : "Save project"}
      </Button>
    </form>
  );
}
