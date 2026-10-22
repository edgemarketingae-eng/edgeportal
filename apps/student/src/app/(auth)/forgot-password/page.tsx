"use client";

import { Button } from "@edge/ui/components/button";
import { Field, FormError, FormMessage, type ActionState } from "@edge/ui/forms/field";
import { authClient, authErrorMessage } from "@edge/web/auth-client";
import Link from "next/link";
import { useActionState } from "react";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(async (_prev: ActionState, form: FormData): Promise<ActionState> => {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    if (!email.includes("@")) return { fieldErrors: { email: "Enter a valid email" }, values: { email } };
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    if (error) return { error: authErrorMessage(error), values: { email } };
    return { ok: true, message: "If an account exists for that email, a reset link is on its way. It expires in one hour." };
  }, {});
  return (
    <div className="grid gap-6">
      <div>
        <h2 className="font-display text-2xl uppercase">Reset password</h2>
        <p className="text-muted-foreground mt-1 text-sm">We will email you a link to choose a new password. You can also sign in with a one-time code to your mobile.</p>
      </div>
      {state.ok ? (
        <FormMessage state={state} />
      ) : (
        <form action={action} className="grid gap-4">
          <FormError state={state} />
          <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={state.values?.email} error={state.fieldErrors?.email} required />
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
      <Link href="/login" className="text-edge-emerald text-center text-sm underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
