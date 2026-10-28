"use client";

import type { LeadDto } from "@edge/contracts";
import { Button } from "@edge/ui/components/button";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { FormError, type ActionState } from "@edge/ui/forms/field";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveQualificationAction } from "@/lib/actions/leads";
import { QUALIFICATION_FIELDS } from "./lead-form";

const KEY = { qualificationExperience: "experience", qualificationOccupation: "occupation", qualificationPurpose: "purpose" } as const;

/** The three sales questions, answered right on the lead page (during the call). */
export function QualificationForm({ leadId, answers }: { leadId: string; answers: LeadDto["qualification"] }) {
  const [state, action, pending] = useActionState(saveQualificationAction, {} as ActionState);
  useEffect(() => {
    if (state.ok) toast.success("Answers saved.");
  }, [state]);
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={leadId} />
      <FormError state={state} />
      <div className="grid items-start gap-4 md:grid-cols-3">
        {QUALIFICATION_FIELDS.map((q) => (
          <div key={q.name} className="grid content-start gap-2">
            <Label htmlFor={`q-${q.name}`}>{q.label}</Label>
            <Textarea id={`q-${q.name}`} name={q.name} rows={3} defaultValue={answers[KEY[q.name]] ?? ""} placeholder={q.placeholder} />
          </div>
        ))}
      </div>
      <Button size="sm" className="w-fit" disabled={pending}>
        {pending ? "Saving…" : "Save answers"}
      </Button>
    </form>
  );
}
