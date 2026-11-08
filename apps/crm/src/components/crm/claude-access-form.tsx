"use client";

import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { FormError, type ActionState } from "@edge/ui/forms/field";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveClaudeAccessAction } from "@/lib/actions/claude";

/** The CRM-wide switch for Claude connections (CRM managers and admins). */
export function ClaudeAccessForm({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(saveClaudeAccessAction, {} as ActionState);
  useEffect(() => {
    if (state.ok) toast.success(state.message ?? "Saved");
    if (state.error) toast.error(state.error);
  }, [state]);
  // Keyed on the saved value: React resets a form after its action, which would put the box back to its first value.
  return (
    <form key={String(enabled)} action={action} className="grid gap-3">
      <FormError state={state} />
      <label className="flex items-start gap-2 text-sm">
        <Checkbox name="enabled" defaultChecked={enabled} className="mt-0.5" />
        <span>
          <span className="font-medium">Let CRM users connect Claude</span>
          <span className="text-muted-foreground block">
            Turning this off stops every connection at once (nothing is deleted); people may need to reconnect after it&apos;s back on.
          </span>
        </span>
      </label>
      <Button className="w-fit" pending={pending}>
        Save
      </Button>
    </form>
  );
}
