"use client";

import { authRoutes } from "@edge/contracts";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { CountrySelect, PhoneInput } from "@edge/ui/forms/phone-input";
import { HOME_COUNTRY } from "@edge/domain/countries";
import { toActionState } from "@edge/web/actions";
import { hardNavigate, postAuth } from "@edge/web/auth-client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { ChannelPicker } from "@/components/channel-picker";

export function SignUpForm() {
  const [state, action, pending] = useActionState(async (_prev: ActionState, form: FormData): Promise<ActionState> => {
    const values = Object.fromEntries(
      ["name", "email", "phone", "country", "jetaFxClientId"].map((k) => [k, String(form.get(k) ?? "").trim()]),
    );
    try {
      await postAuth(authRoutes.studentSignup, {
        ...values,
        jetaFxClientId: values.jetaFxClientId || undefined,
        password: String(form.get("password") ?? ""),
        marketingConsent: form.get("marketingConsent") === "on",
        terms: form.get("terms") === "on",
        channel: String(form.get("channel") ?? "sms"),
      });
      return hardNavigate("/verify-phone");
    } catch (e) {
      return toActionState(e, values);
    }
  }, {});
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};
  // Residence follows the phone's country until the person picks one themselves.
  const [country, setCountry] = useState(v.country || HOME_COUNTRY);
  const [countryTouched, setCountryTouched] = useState(false);
  return (
    <form action={action} className="grid gap-4">
      <FormError state={state} />
      <Field label="Full name" name="name" autoComplete="name" defaultValue={v.name} error={fe.name} required />
      <Field label="Email" name="email" type="email" autoComplete="email" defaultValue={v.email} error={fe.email} required />
      <Field
        label="Mobile number (WhatsApp)"
        name="phone"
        error={fe.phone}
        hint="Pick your country code. We will send a verification code to this number."
      >
        <PhoneInput
          id="phone"
          name="phone"
          defaultValue={v.phone}
          defaultCountry={country}
          aria-invalid={!!fe.phone || undefined}
          onCountryChange={(c) => (countryTouched ? null : setCountry(c))}
          required
        />
      </Field>
      <Field label="Country of residence" name="country" error={fe.country} hint="Decides VAT and the payment methods you can use.">
        <CountrySelect
          id="country"
          name="country"
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setCountryTouched(true);
          }}
          aria-invalid={!!fe.country || undefined}
          required
        />
      </Field>
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        error={fe.password}
        hint="At least 8 characters."
        required
      />
      <Field label="Jeta FX client ID (optional)" name="jetaFxClientId" defaultValue={v.jetaFxClientId} error={fe.jetaFxClientId} />
      <ChannelPicker />
      <div className="bg-muted/60 grid gap-3 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <Checkbox id="terms" name="terms" className="mt-0.5" />
          <Label htmlFor="terms" className="text-sm leading-snug font-normal">
            I agree to the academy terms and confirm that course fees are non-refundable.
          </Label>
        </div>
        {fe.terms ? <p className="text-destructive text-xs">{fe.terms}</p> : null}
        <div className="flex items-start gap-2">
          <Checkbox id="marketingConsent" name="marketingConsent" className="mt-0.5" defaultChecked />
          <Label htmlFor="marketingConsent" className="text-sm leading-snug font-normal">
            Send me academy news and webinar invites by email and WhatsApp.
          </Label>
        </div>
      </div>
      <Button type="submit" size="lg" pending={pending}>
        Create account
      </Button>
      <p className="text-muted-foreground text-center text-sm">
        Already registered?{" "}
        <Link href="/login" className="text-edge-emerald font-semibold underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
