"use client";

import { Button } from "@edge/ui/components/button";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { authClient, authErrorMessage, hardNavigate } from "@edge/web/auth-client";
import { useActionState } from "react";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(async (_prev: ActionState, form: FormData): Promise<ActionState> => {
    const password = String(form.get("password") ?? "");
    if (password.length < 8) return { fieldErrors: { password: "At least 8 characters" } };
    if (password !== form.get("confirm")) return { fieldErrors: { confirm: "Passwords do not match" } };
    const { error } = await authClient.resetPassword({ token, newPassword: password });
    if (error) return { error: authErrorMessage(error, "This reset link is invalid or has expired.") };
    return hardNavigate("/login?reset=1");
  }, {});
  return (
    <form action={action} className="grid gap-4">
      <FormError state={state} />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
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
        Set new password
      </Button>
    </form>
  );
}
