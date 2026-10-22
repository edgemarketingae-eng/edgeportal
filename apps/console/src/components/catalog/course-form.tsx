"use client";

import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveCourseAction } from "@/app/admin/batches/actions";

export function CourseForm({
  course,
}: {
  course?: { id: string; code: string; title: string; description: string | null; isActive: boolean };
}) {
  const [state, action, pending] = useActionState(saveCourseAction, {} as ActionState);
  useEffect(() => {
    if (state.ok) toast.success(state.message ?? "Saved");
  }, [state]);
  const fe = state.fieldErrors ?? {};
  const v = state.values;
  const id = course?.id ?? "new";
  return (
    // React resets a form after every action; remounting with the submitted values keeps them after an error.
    <form key={JSON.stringify(v ?? {})} action={action} className="grid gap-3">
      {course ? <input type="hidden" name="id" value={course.id} /> : null}
      <FormError state={state} />
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <Field
          label="Code"
          name="code"
          id={`code-${id}`}
          defaultValue={v?.code ?? course?.code}
          error={fe.code}
          placeholder="FX-PRO"
          required
        />
        <Field label="Title" name="title" id={`title-${id}`} defaultValue={v?.title ?? course?.title} error={fe.title} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`desc-${id}`}>Description</Label>
        <Textarea id={`desc-${id}`} name="description" rows={3} defaultValue={v?.description ?? course?.description ?? ""} />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id={`active-${id}`} name="isActive" defaultChecked={v ? v.isActive === "on" : (course?.isActive ?? true)} />
        <Label htmlFor={`active-${id}`} className="font-normal">
          Active
        </Label>
      </div>
      <Button type="submit" size="sm" className="w-fit" disabled={pending}>
        {pending ? "Saving…" : course ? "Save course" : "Add course"}
      </Button>
    </form>
  );
}
