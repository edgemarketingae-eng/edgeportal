"use client";

import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { NativeSelect } from "@edge/ui/components/native-select";
import { Field, FormError, FormMessage, type ActionState } from "@edge/ui/forms/field";
import { useActionState, useState } from "react";
import { saveBatchAction } from "@/app/admin/batches/actions";

export interface BatchFormValues {
  id?: string;
  courseId: string;
  code: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  scheduleText: string;
  capacity: string;
  status: string;
  fee: string;
  advanceEnabled: boolean;
  advancePresets: string;
  allowCustomAdvance: boolean;
  balanceDueRule: string;
  balanceDueDate: string;
  balanceDueDays: string;
  lockGraceDays: string;
  whatsappGroupUrl: string;
  isCurrentForEnrollment: boolean;
  mentorIds: string[];
}

/** The submitted values after a failed save (React resets the form after every action). */
function restore(values: BatchFormValues, s?: Record<string, string>): BatchFormValues {
  if (!s) return values;
  return {
    ...values,
    ...s,
    advanceEnabled: s.advanceEnabled === "on",
    allowCustomAdvance: s.allowCustomAdvance === "on",
    isCurrentForEnrollment: s.isCurrentForEnrollment === "on",
    mentorIds: s.mentorIds ? s.mentorIds.split(",") : [],
  };
}

export function BatchForm({
  values,
  courses,
  mentors,
}: {
  values: BatchFormValues;
  courses: { id: string; title: string }[];
  mentors: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(saveBatchAction, {} as ActionState);
  const [rule, setRule] = useState(values.balanceDueRule);
  const fe = state.fieldErrors ?? {};
  const v = restore(values, state.values);
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="grid gap-4">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <FormMessage state={state} />
      <FormError state={state} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Batch</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid content-start gap-2">
              <Label htmlFor="courseId">Course</Label>
              <NativeSelect id="courseId" name="courseId" defaultValue={v.courseId}>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </NativeSelect>
              {fe.courseId ? <p className="text-destructive text-xs">{fe.courseId}</p> : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code" name="code" defaultValue={v.code} error={fe.code} placeholder="FX-PRO-B2" required />
              <div className="grid content-start gap-2">
                <Label htmlFor="status">Status</Label>
                <NativeSelect id="status" name="status" defaultValue={v.status}>
                  <option value="DRAFT">Draft</option>
                  <option value="OPEN">Open for enrollment</option>
                  <option value="RUNNING">Running</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ARCHIVED">Archived</option>
                </NativeSelect>
              </div>
            </div>
            <Field label="Name" name="name" defaultValue={v.name} error={fe.name} placeholder="Batch 2 - January 2027" required />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date" name="startDate" type="date" defaultValue={v.startDate} error={fe.startDate} required />
              <Field label="End date" name="endDate" type="date" defaultValue={v.endDate} error={fe.endDate} />
            </div>
            <Field
              label="Schedule"
              name="scheduleText"
              defaultValue={v.scheduleText}
              error={fe.scheduleText}
              placeholder="Mon / Wed / Fri, 8:00 - 9:30 PM (Dubai)"
            />
            <Field label="Capacity (optional)" name="capacity" type="number" min={1} defaultValue={v.capacity} error={fe.capacity} />
            <div className="grid content-start gap-2">
              <Label htmlFor="description">Description shown to students</Label>
              <Textarea id="description" name="description" rows={4} defaultValue={v.description} />
              {fe.description ? <p className="text-destructive text-xs">{fe.description}</p> : null}
            </div>
            <Field
              label="WhatsApp group link"
              name="whatsappGroupUrl"
              type="url"
              defaultValue={v.whatsappGroupUrl}
              error={fe.whatsappGroupUrl}
              placeholder="https://chat.whatsapp.com/…"
            />
            <div className="bg-edge-mint/30 flex items-start gap-2 rounded-lg p-3">
              <Checkbox
                id="isCurrentForEnrollment"
                name="isCurrentForEnrollment"
                defaultChecked={v.isCurrentForEnrollment}
                className="mt-0.5"
              />
              <Label htmlFor="isCurrentForEnrollment" className="block leading-snug font-normal">
                <b>Current batch for new sign-ups.</b> New students join this batch automatically. Any other current batch of this course is
                switched off.
              </Label>
            </div>
            {fe.isCurrentForEnrollment ? <p className="text-destructive text-xs">{fe.isCurrentForEnrollment}</p> : null}
          </CardContent>
        </Card>
        <div className="grid h-fit gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Fees and balance</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field label="Course fee (AED, excluding VAT)" name="fee" inputMode="decimal" defaultValue={v.fee} error={fe.fee} required />
              <div className="flex items-center gap-2">
                <Checkbox id="advanceEnabled" name="advanceEnabled" defaultChecked={v.advanceEnabled} />
                <Label htmlFor="advanceEnabled" className="font-normal">
                  Allow advance payment
                </Label>
              </div>
              <Field
                label="Advance amounts (AED)"
                name="advancePresets"
                defaultValue={v.advancePresets}
                error={fe.advancePresets}
                hint="Comma separated, e.g. 200, 300, 500. The smallest is the minimum."
              />
              <div className="flex items-center gap-2">
                <Checkbox id="allowCustomAdvance" name="allowCustomAdvance" defaultChecked={v.allowCustomAdvance} />
                <Label htmlFor="allowCustomAdvance" className="font-normal">
                  Students may type a custom advance (at least the minimum)
                </Label>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="balanceDueRule">Balance due</Label>
                <NativeSelect id="balanceDueRule" name="balanceDueRule" value={rule} onChange={(e) => setRule(e.target.value)}>
                  <option value="DAYS_AFTER_FIRST_PAYMENT">A number of days after the advance</option>
                  <option value="FIXED_DATE">On a fixed date</option>
                </NativeSelect>
              </div>
              {rule === "FIXED_DATE" ? (
                <Field
                  label="Balance due date"
                  name="balanceDueDate"
                  type="date"
                  defaultValue={v.balanceDueDate}
                  error={fe.balanceDueDate}
                />
              ) : (
                <Field
                  label="Days after advance"
                  name="balanceDueDays"
                  type="number"
                  min={1}
                  defaultValue={v.balanceDueDays}
                  error={fe.balanceDueDays}
                />
              )}
              <Field
                label="Grace days before access locks"
                name="lockGraceDays"
                type="number"
                min={0}
                defaultValue={v.lockGraceDays}
                error={fe.lockGraceDays}
                hint="0 = lock at the end of the due day (Dubai time)."
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Mentors</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {mentors.length === 0 ? <p className="text-muted-foreground text-sm">No staff with the mentor role yet.</p> : null}
              {mentors.map((m) => (
                <div key={m.id} className="flex items-center gap-2">
                  <Checkbox id={`m-${m.id}`} name="mentorIds" value={m.id} defaultChecked={v.mentorIds.includes(m.id)} />
                  <Label htmlFor={`m-${m.id}`} className="font-normal">
                    {m.name}
                  </Label>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
      <Button type="submit" size="lg" className="w-fit" disabled={pending}>
        {pending ? "Saving…" : values.id ? "Save batch" : "Create batch"}
      </Button>
    </form>
  );
}
