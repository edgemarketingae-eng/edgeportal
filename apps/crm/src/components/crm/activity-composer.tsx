"use client";

import { CALL_OUTCOMES, FOLLOWUP_TYPES, LEAD_TOUCH_TYPES, type LeadTouchType } from "@edge/domain/crm/enums";
import { ACTIVITY_LABELS, CALL_OUTCOME_LABELS, FOLLOWUP_TYPE_LABELS } from "@edge/domain/crm/labels";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { NativeSelect } from "@edge/ui/components/native-select";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { addActivityAction } from "@/lib/actions/leads";

const PLACEHOLDER: Record<LeadTouchType, string> = {
  NOTE: "What did you learn? Budget, goals, objections…",
  CALL: "How did the call go?",
  WHATSAPP: "Summary of the WhatsApp conversation",
  EMAIL: "What was sent or received?",
  MEETING: "Consultation notes",
};

/** Log a touch on the lead and (optionally) schedule the next follow-up in one go. */
export function ActivityComposer({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState(addActivityAction, {} as ActionState);
  const [type, setType] = useState<LeadTouchType>("NOTE");
  const [schedule, setSchedule] = useState(false);
  useEffect(() => {
    if (state.ok) toast.success(state.message ?? "Logged");
  }, [state]);
  const fe = state.fieldErrors ?? {};
  const v = state.values;
  return (
    <form key={JSON.stringify(state.values ?? {})} action={action} className="grid gap-3">
      <input type="hidden" name="id" value={leadId} />
      <FormError state={state} />
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Activity type">
        {LEAD_TOUCH_TYPES.map((t) => (
          <label
            key={t}
            className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold ${type === t ? "border-edge-emerald bg-edge-mint/40 text-edge-emerald" : "text-muted-foreground hover:text-foreground"}`}
          >
            <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />
            {ACTIVITY_LABELS[t]}
          </label>
        ))}
      </div>
      {type === "CALL" ? (
        <div className="grid gap-1.5 sm:max-w-xs">
          <Label htmlFor="outcome">Outcome</Label>
          <NativeSelect id="outcome" name="outcome" defaultValue={v?.outcome ?? "ANSWERED"}>
            {CALL_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {CALL_OUTCOME_LABELS[o]}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
      {type === "WHATSAPP" || type === "EMAIL" ? (
        <div className="grid gap-1.5 sm:max-w-xs">
          <Label htmlFor="direction">Direction</Label>
          <NativeSelect id="direction" name="direction" defaultValue={v?.direction ?? "OUT"}>
            <option value="OUT">Sent by us</option>
            <option value="IN">Received from the lead</option>
          </NativeSelect>
        </div>
      ) : null}
      <div className="grid content-start gap-2">
        <Textarea name="body" rows={3} placeholder={PLACEHOLDER[type]} defaultValue={v?.body} aria-label="Details" />
        {fe.body ? <p className="text-destructive text-xs">{fe.body}</p> : null}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={schedule} onCheckedChange={(c) => setSchedule(!!c)} /> Schedule the next follow-up
      </label>
      {schedule ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="When"
            name="nextFollowUpAt"
            type="datetime-local"
            required
            error={fe.nextFollowUpAt}
            defaultValue={v?.nextFollowUpAt}
          />
          <Field label="Title" name="nextFollowUpTitle" placeholder="Follow up" defaultValue={v?.nextFollowUpTitle} />
          <div className="grid content-start gap-2">
            <Label htmlFor="nextFollowUpType">Type</Label>
            <NativeSelect id="nextFollowUpType" name="nextFollowUpType" defaultValue={v?.nextFollowUpType ?? ""}>
              <option value="">Same as this activity</option>
              {FOLLOWUP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FOLLOWUP_TYPE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      ) : null}
      <Button type="submit" size="sm" className="w-fit" disabled={pending}>
        {pending ? "Saving…" : "Log activity"}
      </Button>
    </form>
  );
}
