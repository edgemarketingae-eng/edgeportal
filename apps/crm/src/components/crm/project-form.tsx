"use client";

import { PROJECT_STATUSES } from "@edge/domain/crm/enums";
import { PROJECT_STATUS_LABELS } from "@edge/domain/crm/labels";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Select } from "@edge/ui/components/select";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { useActionState, useEffect, useState } from "react";
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

export const EMPTY_PROJECT: ProjectFormValues = {
  name: "",
  code: "",
  description: "",
  status: "ACTIVE",
  courseId: "",
  batchId: "",
  startDate: "",
  endDate: "",
  targetLeads: "",
  targetConversions: "",
  managerIds: [],
  memberIds: [],
};

function restore(values: ProjectFormValues, s?: Record<string, string>): ProjectFormValues {
  if (!s) return values;
  return { ...values, ...s, managerIds: s.managerIds ? s.managerIds.split(",") : [], memberIds: s.memberIds ? s.memberIds.split(",") : [] };
}

/** People shown sales executives first, then everyone else, each with their roles. */
export function sortForTeam<T extends { name: string; roles?: string[] }>(staff: T[]) {
  const rank = (s: T) => (s.roles?.some((r) => /sales executive/i.test(r)) ? 0 : s.roles?.some((r) => /project manager/i.test(r)) ? 1 : 2);
  return [...staff].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

function People({
  name,
  legend,
  staff,
  selected,
}: {
  name: string;
  legend: string;
  staff: { id: string; name: string; roles?: string[] }[];
  selected: string[];
}) {
  return (
    <fieldset className="grid content-start gap-2">
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      {/* Present even when nothing is ticked, so clearing the list saves. */}
      <input type="hidden" name={name} value="" />
      {staff.length === 0 ? <p className="text-muted-foreground text-xs">No CRM staff yet.</p> : null}
      <div className="grid max-h-72 gap-1.5 overflow-y-auto sm:grid-cols-2">
        {sortForTeam(staff).map((s) => (
          <div key={s.id} className="flex items-start gap-2">
            <Checkbox id={`${name}-${s.id}`} name={name} value={s.id} defaultChecked={selected.includes(s.id)} className="mt-0.5" />
            <Label htmlFor={`${name}-${s.id}`} className="block leading-snug font-normal">
              {s.name}
              {s.roles?.length ? <span className="text-muted-foreground block text-xs">{s.roles.join(", ")}</span> : null}
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
  isDefault = false,
}: {
  values: ProjectFormValues;
  staff: { id: string; name: string; roles?: string[] }[];
  courses: { id: string; title: string }[];
  batches: { id: string; label: string; courseId: string }[];
  canSetManagers: boolean;
  /** The General project is open to everyone, so it has no team to pick. */
  isDefault?: boolean;
}) {
  const [state, action, pending] = useActionState(saveProjectAction, {} as ActionState);
  useEffect(() => {
    if (state.ok) toast.success(state.message ?? "Saved");
  }, [state]);
  const fe = state.fieldErrors ?? {};
  const v = restore(values, state.values);
  const creating = !values.id;
  // The batch list follows the chosen course; a failed save brings back the submitted course.
  const [courseId, setCourseId] = useState(v.courseId);
  const [seenCourse, setSeenCourse] = useState(v.courseId);
  if (v.courseId !== seenCourse) {
    setSeenCourse(v.courseId);
    setCourseId(v.courseId);
  }
  const courseBatches = courseId ? batches.filter((b) => b.courseId === courseId) : batches;
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="grid gap-4">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" defaultValue={v.name} error={fe.name} placeholder="Forex Pro - November drive" required />
        <Field
          label="Code"
          name="code"
          defaultValue={v.code}
          error={fe.code}
          placeholder="auto from the name"
          hint="Short identifier shown on leads and exports"
        />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={3} defaultValue={v.description} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid content-start gap-2">
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={v.status} disabled={!canSetManagers}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          {!canSetManagers ? (
            <>
              <input type="hidden" name="status" value={v.status} />
              <p className="text-muted-foreground text-xs">Only CRM managers and admins change it.</p>
            </>
          ) : null}
        </div>
        <Field label="Start date" name="startDate" type="date" defaultValue={v.startDate} error={fe.startDate} />
        <Field label="End date" name="endDate" type="date" defaultValue={v.endDate} error={fe.endDate} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="courseId">Target course</Label>
          <Select id="courseId" name="courseId" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Not set</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="batchId">Target batch</Label>
          <Select key={courseId} id="batchId" name="batchId" defaultValue={v.batchId}>
            <option value="">Not set</option>
            {courseBatches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </Select>
        </div>
        <Field label="Target leads" name="targetLeads" type="number" min={0} defaultValue={v.targetLeads} error={fe.targetLeads} />
        <Field
          label="Target conversions"
          name="targetConversions"
          type="number"
          min={0}
          defaultValue={v.targetConversions}
          error={fe.targetConversions}
        />
      </div>
      {!isDefault ? (
        <>
          {canSetManagers ? <People name="managerIds" legend="Project managers" staff={staff} selected={v.managerIds} /> : null}
          <People name="memberIds" legend="Sales executives (team members)" staff={staff} selected={v.memberIds} />
        </>
      ) : null}
      <Button type="submit" className="w-fit" pending={pending}>
        {creating ? "Create project" : "Save project"}
      </Button>
    </form>
  );
}
