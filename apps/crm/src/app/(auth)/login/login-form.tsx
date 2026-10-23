"use client";

import { authRoutes } from "@edge/contracts";
import { Button } from "@edge/ui/components/button";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { toActionState } from "@edge/web/actions";
import { hardNavigate, postAuth } from "@edge/web/auth-client";
import Link from "next/link";
import { useActionState } from "react";

export function LoginForm() {
  const [state, action, pending] = useActionState(async (_prev: ActionState, form: FormData): Promise<ActionState> => {
    const values = { identifier: String(form.get("identifier") ?? "").trim() };
    try {
      const res = await postAuth(authRoutes.signInPassword, { identifier: values.identifier, password: String(form.get("password") ?? ""), app: "crm" });
      return hardNavigate(res.twoFactorRedirect ? "/two-factor" : (res.home ?? "/"));
    } catch (e) {
      return toActionState(e, values);
    }
  }, {});
  return (
    <form action={action} className="grid gap-4">
      <FormError state={state} />
      <Field label="Work email" name="identifier" type="email" autoComplete="username" defaultValue={state.values?.identifier} error={state.fieldErrors?.identifier} required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" error={state.fieldErrors?.password} required />
      <div className="-mt-2 text-right text-sm">
        <Link href="/forgot-password" className="text-edge-emerald underline-offset-4 hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
