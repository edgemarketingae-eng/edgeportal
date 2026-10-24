"use client";

import { authRoutes } from "@edge/contracts";
import { OtpInput } from "@edge/ui/blocks/otp-input";
import { Button } from "@edge/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@edge/ui/components/tabs";
import { Field, FormError, FormMessage, type ActionState } from "@edge/ui/forms/field";
import { toActionState } from "@edge/web/actions";
import { hardNavigate, postAuth } from "@edge/web/auth-client";
import Link from "next/link";
import { useActionState } from "react";
import { ChannelPicker } from "@/components/channel-picker";

const initial: ActionState = {};
const str = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

function PasswordForm() {
  const [state, action, pending] = useActionState(async (_prev: ActionState, form: FormData): Promise<ActionState> => {
    const values = { identifier: str(form, "identifier") };
    try {
      const res = await postAuth(authRoutes.signInPassword, {
        identifier: values.identifier,
        password: String(form.get("password") ?? ""),
        app: "student",
      });
      return hardNavigate(res.home ?? "/dashboard");
    } catch (e) {
      return toActionState(e, values);
    }
  }, initial);
  return (
    <form action={action} className="grid gap-4">
      <FormError state={state} />
      <Field
        label="Email or mobile number"
        name="identifier"
        autoComplete="username"
        defaultValue={state.values?.identifier}
        error={state.fieldErrors?.identifier}
        placeholder="you@example.com or your mobile with country code"
        required
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        error={state.fieldErrors?.password}
        required
      />
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

function OtpForm() {
  const [sendState, sendAction, sending] = useActionState(async (_prev: ActionState, form: FormData): Promise<ActionState> => {
    const values = { phone: str(form, "phone") };
    try {
      const res = await postAuth(authRoutes.sendLoginOtp, { phone: values.phone, channel: str(form, "channel") || "sms" });
      return { step: "code", message: res.message, values: { phone: res.phone } };
    } catch (e) {
      return toActionState(e, values);
    }
  }, initial);
  const [verifyState, verifyAction, verifying] = useActionState(async (_prev: ActionState, form: FormData): Promise<ActionState> => {
    const values = { phone: str(form, "phone") };
    try {
      const res = await postAuth(authRoutes.verifyLoginOtp, { phone: values.phone, code: str(form, "code").replace(/\D/g, "") });
      return hardNavigate(res.home ?? "/dashboard");
    } catch (e) {
      return { ...toActionState(e, values), step: "code" };
    }
  }, initial);
  const onCodeStep = sendState.step === "code" || verifyState.step === "code";
  const phone = verifyState.values?.phone ?? sendState.values?.phone ?? "";

  if (!onCodeStep) {
    return (
      <form action={sendAction} className="grid gap-4">
        <FormError state={sendState} />
        <Field
          label="Mobile number"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={sendState.values?.phone}
          error={sendState.fieldErrors?.phone}
          required
        />
        <ChannelPicker />
        <Button type="submit" size="lg" disabled={sending}>
          {sending ? "Sending…" : "Send code"}
        </Button>
      </form>
    );
  }
  return (
    <div className="grid gap-2">
      <form action={verifyAction} className="grid gap-4">
        <FormMessage state={sendState} />
        <FormError state={verifyState} />
        <input type="hidden" name="phone" value={phone} />
        <div className="grid gap-2 text-center">
          <p className="text-muted-foreground text-sm">Enter the 6-digit code sent to {phone}</p>
          <OtpInput />
          {verifyState.fieldErrors?.code ? <p className="text-destructive text-xs">{verifyState.fieldErrors.code}</p> : null}
        </div>
        <Button type="submit" size="lg" disabled={verifying}>
          {verifying ? "Verifying…" : "Verify and sign in"}
        </Button>
      </form>
      <form action={sendAction}>
        <input type="hidden" name="phone" value={phone} />
        <input type="hidden" name="channel" value="sms" />
        <Button type="submit" variant="link" className="w-full" disabled={sending}>
          Resend code
        </Button>
      </form>
    </div>
  );
}

export function LoginForm() {
  return (
    <Tabs defaultValue="password" className="w-full">
      <TabsList className="mb-4 grid w-full grid-cols-2">
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="otp">One-time code</TabsTrigger>
      </TabsList>
      <TabsContent value="password">
        <PasswordForm />
      </TabsContent>
      <TabsContent value="otp">
        <OtpForm />
      </TabsContent>
    </Tabs>
  );
}
