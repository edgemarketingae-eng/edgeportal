"use client";

import { Button } from "../components/button";
import { Field, type ActionState } from "../forms/field";
import { ActionDialog } from "./action-dialog";

/** Change the address a staff member signs in with (console Staff & roles and CRM Team). */
export function ChangeEmailButton({
  action,
  userId,
  email,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  userId: string;
  email: string;
}) {
  return (
    <ActionDialog
      action={action}
      hidden={{ userId }}
      title="Change sign-in email"
      description="They sign in with the new address from now on. Their password stays the same and they stay signed in. Both addresses get an email about the change."
      trigger={
        <Button variant="outline" size="sm">
          Change email
        </Button>
      }
      submitLabel="Change email"
      size="md"
    >
      <Field id="change-email" label="New sign-in email" name="email" type="email" defaultValue={email} required autoComplete="off" />
    </ActionDialog>
  );
}
