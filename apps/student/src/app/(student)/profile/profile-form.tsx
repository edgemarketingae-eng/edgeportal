"use client";

import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Field, FormError, FormMessage, type ActionState } from "@edge/ui/forms/field";
import { useActionState } from "react";
import { updateProfileAction } from "./actions";

export function ProfileForm({
  name,
  jetaFxClientId,
  marketingConsent,
}: {
  name: string;
  jetaFxClientId: string;
  marketingConsent: boolean;
}) {
  const [state, action, pending] = useActionState(updateProfileAction, {} as ActionState);
  return (
    <form action={action} className="grid gap-4">
      <FormMessage state={state} />
      <FormError state={state} />
      <Field label="Full name" name="name" defaultValue={name} error={state.fieldErrors?.name} required />
      <Field
        label="Jeta FX client ID"
        name="jetaFxClientId"
        defaultValue={jetaFxClientId}
        error={state.fieldErrors?.jetaFxClientId}
        hint="Optional. Changes are recorded."
      />
      <div className="flex items-start gap-2">
        <Checkbox id="marketingConsent" name="marketingConsent" defaultChecked={marketingConsent} className="mt-0.5" />
        <Label htmlFor="marketingConsent" className="font-normal">
          Send me academy news and webinar invites by email and WhatsApp.
        </Label>
      </div>
      <Button type="submit" className="w-fit" pending={pending}>
        Save changes
      </Button>
    </form>
  );
}
