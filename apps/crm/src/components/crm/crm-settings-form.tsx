"use client";

import type { CrmSettingsDto } from "@edge/contracts";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveCrmSettingsAction } from "@/lib/actions/settings";

export function CrmSettingsForm({ s }: { s: CrmSettingsDto }) {
  const [state, action, pending] = useActionState(saveCrmSettingsAction, {} as ActionState);
  useEffect(() => {
    if (state.ok) toast.success(state.message ?? "Saved");
    if (state.error) toast.error(state.error);
  }, [state]);
  const v = state.values;
  // Remount after a save too, or React's form reset would put the checkbox back to its first-rendered value.
  return (
    <form key={JSON.stringify(v ?? s)} action={action} className="grid gap-4">
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="First-response SLA (hours)"
          name="followUpSlaHours"
          type="number"
          min={1}
          defaultValue={v?.followUpSlaHours ?? String(s.followUpSlaHours)}
          hint="New leads not contacted within this time count as untouched"
        />
        <Field
          label="Lead goes cold after (days)"
          name="staleAfterDays"
          type="number"
          min={1}
          defaultValue={v?.staleAfterDays ?? String(s.staleAfterDays)}
          hint="No activity for this long = temperature Cold"
        />
        <Field
          label="Batch urgency (days before start)"
          name="batchUrgencyDays"
          type="number"
          min={0}
          defaultValue={v?.batchUrgencyDays ?? String(s.batchUrgencyDays)}
          hint="0 turns the automatic follow-ups off"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="roundRobin" defaultChecked={v ? v.roundRobin === "on" : s.roundRobin} /> Assign website leads round-robin to the
        sales team (least loaded first)
      </label>
      <div className="grid content-start gap-2">
        <Label htmlFor="lostReasons">Lost reasons (one per line)</Label>
        <Textarea id="lostReasons" name="lostReasons" rows={6} defaultValue={v?.lostReasons ?? s.lostReasons.join("\n")} />
      </div>
      <Button className="w-fit" disabled={pending}>
        {pending ? "Saving…" : "Save CRM settings"}
      </Button>
    </form>
  );
}
