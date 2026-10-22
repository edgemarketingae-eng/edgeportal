"use client";

import { OtpInput } from "@edge/ui/blocks/otp-input";
import { Button } from "@edge/ui/components/button";
import { Field, FormError, FormMessage, type ActionState } from "@edge/ui/forms/field";
import { authClient, authErrorMessage, hardNavigate } from "@edge/web/auth-client";
import QRCode from "qrcode";
import { useActionState } from "react";

type Setup = ActionState & { qr?: string; secret?: string; backupCodes?: string[] };

export function TwoFactorSetup({ enabled, required }: { enabled: boolean; required: boolean }) {
  const [start, startAction, starting] = useActionState(async (_prev: Setup, form: FormData): Promise<Setup> => {
    const { data, error } = await authClient.twoFactor.enable({ password: String(form.get("password") ?? ""), method: "totp" });
    if (error || !data) return { error: authErrorMessage(error) };
    if (data.method !== "totp") return { error: "Unexpected two-factor method." };
    return {
      step: "verify",
      qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 }),
      secret: new URL(data.totpURI).searchParams.get("secret") ?? "",
      backupCodes: data.backupCodes,
    };
  }, {});
  const [confirm, confirmAction, confirming] = useActionState(async (_prev: ActionState, form: FormData): Promise<ActionState> => {
    const { error } = await authClient.twoFactor.verifyTotp({ code: String(form.get("code") ?? "").replace(/\s/g, "") });
    if (error) return { error: authErrorMessage(error, "That code did not work. Try again.") };
    return hardNavigate("/");
  }, {});
  const [disable, disableAction, disabling] = useActionState(async (_prev: ActionState, form: FormData): Promise<ActionState> => {
    const { error } = await authClient.twoFactor.disable({ password: String(form.get("password") ?? "") });
    if (error) return { error: authErrorMessage(error) };
    return hardNavigate("/security?disabled=1");
  }, {});

  if (enabled) {
    return (
      <div className="grid gap-4">
        <p className="bg-edge-mint/40 text-edge-emerald rounded-md px-3 py-2 text-sm">Two-factor authentication is on for your account.</p>
        {!required ? (
          <form action={disableAction} className="grid gap-3">
            <FormMessage state={disable} />
            <FormError state={disable} />
            <Field label="Password to turn it off" name="password" type="password" autoComplete="current-password" required />
            <Button variant="outline" className="w-fit" disabled={disabling}>
              Turn off two-factor
            </Button>
          </form>
        ) : null}
      </div>
    );
  }

  if (start.step === "verify" && start.qr) {
    return (
      <div className="grid gap-5">
        <ol className="text-muted-foreground grid list-decimal gap-1 pl-5 text-sm">
          <li>Open Google Authenticator, Microsoft Authenticator or 1Password.</li>
          <li>Scan this QR code.</li>
          <li>Enter the 6-digit code it shows.</li>
        </ol>
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated in the browser */}
        <img src={start.qr} alt="QR code for your authenticator app" width={220} height={220} className="rounded-lg border bg-white p-2" />
        <p className="text-muted-foreground text-xs">
          Can&apos;t scan? Enter this setup key:{" "}
          <code data-testid="totp-secret" className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono">
            {start.secret}
          </code>
        </p>
        <div className="bg-muted/50 rounded-lg border p-3">
          <p className="mb-2 text-sm font-semibold">Backup codes</p>
          <p className="text-muted-foreground mb-2 text-xs">Save these somewhere safe. Each works once if you lose your phone.</p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
            {start.backupCodes?.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <form action={confirmAction} className="grid gap-3">
          <FormError state={confirm} />
          <OtpInput autoFocus={false} />
          <Button className="w-fit" disabled={confirming}>
            {confirming ? "Checking…" : "Turn on two-factor"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <form action={startAction} className="grid gap-3">
      <FormError state={start} />
      <Field label="Confirm your password" name="password" type="password" autoComplete="current-password" required />
      <Button className="w-fit" disabled={starting}>
        {starting ? "Preparing…" : "Set up authenticator app"}
      </Button>
    </form>
  );
}
