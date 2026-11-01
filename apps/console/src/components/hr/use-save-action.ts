"use client";

import type { ActionState } from "@edge/ui/forms/field";
import { useActionState } from "react";
import { toast } from "sonner";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/**
 * A form action that toasts on success. It toasts inside the action, not in an effect: these forms are keyed on the
 * saved data, so a successful save remounts them and an effect would never see the result.
 */
export function useSaveAction(action: Action) {
  return useActionState(async (prev: ActionState, form: FormData) => {
    const result = await action(prev, form);
    if (result.ok) toast.success(result.message ?? "Saved");
    return result;
  }, {} as ActionState);
}
