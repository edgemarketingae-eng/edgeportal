"use client";

import { PROJECT_STATUSES } from "@edge/domain/crm/enums";
import { PROJECT_STATUS_LABELS } from "@edge/domain/crm/labels";
import { Button } from "@edge/ui/components/button";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Select } from "@edge/ui/components/select";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { saveProjectAction } from "@/lib/actions/projects";
import { CheckList } from "./check-list";

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
  productIds: string[];
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
  productIds: [],
};

function restore(values: ProjectFormValues, s?: Record<string, string>): ProjectFormValues {
  if (!s) return values;
  const list = (k: string) => (s[k] ? s[k].split(",") : []);
  return { ...values, ...s, managerIds: list("managerIds"), memberIds: list("memberIds"), productIds: list("productIds") };
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
    <CheckList
      name={name}
      legend={legend}
      items={sortForTeam(staff).map((s) => ({ id: s.id, label: s.name, note: s.roles?.length ? s.roles.join(", ") : undefined }))}
      selected={selected}
      empty="No CRM staff yet."
    />
  );
}

/**
 * Create / edit a project. `canSetStatus` and `canSetManagers` follow crm.projects.manage; project managers
 * can still edit details and members of their own projects. `canSetProducts` follows crm.manage.
 */
export function ProjectForm({
  values,
  staff,
  courses,
  batches,
  products,
  canSetManagers,
  canSetProducts,
  isDefault = false,
}: {
  values: ProjectFormValues;
  staff: { id: string; name: string; roles?: string[] }[];
  courses: { id: string; title: string }[];
  batches: { id: string; label: string; courseId: string }[];
  /** Products to tick: active ones, plus archived ones the project still sells. */
  products: { id: string; name: string; status?: string }[];
  canSetManagers: boolean;
  canSetProducts: boolean;
  /** The General project is open to everyone and sells every product, so it has no team or products to pick. */
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
    // Keyed on the saved values after a save too: React resets a form after its action, and ticks would go back to
    // what they first rendered.
    <form key={JSON.stringify(state.values ?? values)} action={action} className="grid gap-4">
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
          {canSetProducts ? (
            <CheckList
              name="productIds"
              legend="Products"
              hint="Leads in this project can only be marked converted to the products ticked here. General always sells every product."
              items={products.map((p) => ({ id: p.id, label: p.name, note: p.status === "ARCHIVED" ? "Archived" : undefined }))}
              selected={v.productIds}
              empty="No products yet. Add them on the Products page."
              error={fe.productIds}
            />
          ) : null}
        </>
      ) : null}
      <Button type="submit" className="w-fit" pending={pending}>
        {creating ? "Create project" : "Save project"}
      </Button>
    </form>
  );
}
