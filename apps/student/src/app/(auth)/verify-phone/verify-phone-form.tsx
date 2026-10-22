"use client";

import { authRoutes } from "@edge/contracts";
import { OtpInput } from "@edge/ui/blocks/otp-input";
import { Button } from "@edge/ui/components/button";
import { Field, FormError, FormMessage, type ActionState } from "@edge/ui/forms/field";
import { toActionState } from "@edge/web/actions";
import { hardNavigate, postAuth } from "@edge/web/auth-client";
import { useActionState, useState } from "react";
import { ChannelPicker } from "@/components/channel-picker";

export function VerifyPhoneForm({ phone: initialPhone }: { phone: string }) {
  const [changing, setChanging] = useState(false);
  const [state, action, pending] = useActionState(async (_prev: ActionState, form: FormData): Promise<ActionState> => {
    try {
      const res = await postAuth(authRoutes.verifyPhone, { code: String(form.get("code") ?? "").replace(/\D/g, "") });
      return hardNavigate(res.home);
    } catch (e) {
      return toActionState(e);
    }
  }, {});
  const [resendState, resend, resending] = useActionState(async (_prev: ActionState, form: FormData): Promise<ActionState> => {
    try {
      const newPhone = String(form.get("newPhone") ?? "").trim();
      const res = await postAuth(authRoutes.resendPhoneOtp, { newPhone: newPhone || undefined, channel: String(form.get("channel") ?? "sms") });
      setChanging(false);
      return { message: res.message, values: { phone: res.phone } };
    } catch (e) {
      return toActionState(e);
    }
  }, {});
  const phone = resendState.values?.phone ?? initialPhone;

  return (
    <div className="grid gap-5">
      <form action={action} className="grid gap-4">
        <FormMessage state={resendState} />
        <FormError state={state} />
        <FormError state={resendState} />
        <p className="text-muted-foreground text-center text-sm">
          Enter the 6-digit code we sent to <span className="text-foreground font-semibold">{phone}</span>
        </p>
        <OtpInput />
        {state.fieldErrors?.code ? <p className="text-destructive text-center text-xs">{state.fieldErrors.code}</p> : null}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Verifying…" : "Verify mobile number"}
        </Button>
      </form>
      <form action={resend} className="grid gap-3 rounded-lg border p-4">
        {changing ? <Field label="New mobile number" name="newPhone" type="tel" placeholder="+971 50 123 4567" error={resendState.fieldErrors?.newPhone} required /> : null}
        <ChannelPicker />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="submit" variant="outline" size="sm" disabled={resending}>
            {resending ? "Sending…" : changing ? "Send code to new number" : "Resend code"}
          </Button>
          <Button type="button" variant="link" size="sm" onClick={() => setChanging((c) => !c)}>
            {changing ? "Keep current number" : "Wrong number?"}
          </Button>
        </div>
      </form>
    </div>
  );
}
