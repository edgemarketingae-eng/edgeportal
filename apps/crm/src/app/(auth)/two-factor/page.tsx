"use client";

import { OtpInput } from "@edge/ui/blocks/otp-input";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { authClient, authErrorMessage, hardNavigate } from "@edge/web/auth-client";
import Link from "next/link";
import { useActionState, useState } from "react";

/** Second sign-in step: the two-factor cookie from /api/v1/auth/sign-in is exchanged for a session. */
export default function TwoFactorPage() {
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [state, action, pending] = useActionState(async (_prev: ActionState, form: FormData): Promise<ActionState> => {
    const code = String(form.get("code") ?? "").replace(/\s/g, "");
    const trustDevice = form.get("trustDevice") === "on";
    const { error } =
      mode === "totp"
        ? await authClient.twoFactor.verifyTotp({ code, trustDevice })
        : await authClient.twoFactor.verifyBackupCode({ code, trustDevice });
    if (error) return { error: authErrorMessage(error, "That code did not work. Try again.") };
    return hardNavigate("/");
  }, {});
  return (
    <div className="grid gap-6">
      <div>
        <h2 className="font-display text-2xl uppercase">Two-factor sign-in</h2>
        <p className="text-muted-foreground mt-1 text-sm">Your account is protected with an authenticator app.</p>
      </div>
      <form action={action} className="grid gap-4">
        <FormError state={state} />
        {mode === "totp" ? (
          <div className="grid gap-2 text-center">
            <p className="text-muted-foreground text-sm">Enter the 6-digit code from your authenticator app.</p>
            <OtpInput />
          </div>
        ) : (
          <Field label="Backup code" name="code" autoComplete="one-time-code" required />
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="trustDevice" /> Trust this device for 30 days
        </label>
        <Button size="lg" pending={pending}>
          Verify
        </Button>
        <Button type="button" variant="link" onClick={() => setMode(mode === "totp" ? "backup" : "totp")}>
          {mode === "totp" ? "Use a backup code instead" : "Use the authenticator app"}
        </Button>
      </form>
      <Link href="/login" className="text-edge-emerald text-center text-sm hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
