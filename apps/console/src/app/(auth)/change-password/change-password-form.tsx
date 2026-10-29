"use client";

import { Button } from "@edge/ui/components/button";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { authClient, authErrorMessage, hardNavigate } from "@edge/web/auth-client";
import { useActionState } from "react";

export function ChangePasswordForm({ temporary }: { temporary: boolean }) {
  const [state, action, pending] = useActionState(async (_prev: ActionState, form: FormData): Promise<ActionState> => {
    const newPassword = String(form.get("password") ?? "");
    if (newPassword.length < 8) return { fieldErrors: { password: "At least 8 characters" } };
    if (newPassword !== form.get("confirm")) return { fieldErrors: { confirm: "Passwords do not match" } };
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("current") ?? ""),
      newPassword,
      revokeOtherSessions: true,
    });
    if (error) return { error: authErrorMessage(error) };
    return hardNavigate("/"); // the API clears mustChangePassword; "/" picks the next step
  }, {});
  return (
    <form action={action} className="grid gap-4">
      <FormError state={state} />
      <Field
        label={temporary ? "Temporary password" : "Current password"}
        name="current"
        type="password"
        autoComplete="current-password"
        required
      />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
        required
      />
      <Field
        label="Confirm new password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirm}
        required
      />
      <Button type="submit" size="lg" pending={pending}>
        Save password
      </Button>
    </form>
  );
}
