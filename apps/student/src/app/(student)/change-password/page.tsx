"use client";

import { Button } from "@edge/ui/components/button";
import { Card, CardContent } from "@edge/ui/components/card";
import { Field, FormError, FormMessage, type ActionState } from "@edge/ui/forms/field";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { authClient, authErrorMessage } from "@edge/web/auth-client";
import { useActionState } from "react";

export default function ChangePasswordPage() {
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
    return { ok: true, message: "Password changed. Other devices have been signed out." };
  }, {});
  return (
    <>
      <PageHeader title="Change password" />
      <Card className="max-w-lg">
        <CardContent className="pt-6">
          <form action={action} className="grid gap-4">
            <FormMessage state={state} />
            <FormError state={state} />
            <Field label="Current password" name="current" type="password" autoComplete="current-password" required />
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
            <Button type="submit" className="w-fit" pending={pending}>
              Save password
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
