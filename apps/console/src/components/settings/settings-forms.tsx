"use client";

import { GATEWAYS } from "@edge/domain/enums";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Input } from "@edge/ui/components/input";
import { Label } from "@edge/ui/components/label";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveFeeRateAction, saveGeneralSettingsAction, saveOdooMappingAction } from "@/app/admin/settings/actions";

const JOURNAL_GATEWAYS = GATEWAYS.filter((g) => g !== "MOCK");

function useToast(state: ActionState) {
  useEffect(() => {
    if (state.ok) toast.success(state.message ?? "Saved");
    if (state.error) toast.error(state.error);
  }, [state]);
}

/** React resets a form after every action; remounting with the submitted values keeps them after an error. */
const formKey = (state: ActionState) => JSON.stringify(state.values ?? {});

export interface FeeRateRow {
  key: string;
  gateway: string;
  label: string;
  pctPercent: string;
  fixed: string;
  enabled: boolean;
  min: string;
  max: string;
  countries: string;
}

export function FeeRateForm({ r }: { r: FeeRateRow }) {
  const [state, action, pending] = useActionState(saveFeeRateAction, {} as ActionState);
  useToast(state);
  const v = state.values;
  return (
    <form
      key={formKey(state)}
      action={action}
      className="bg-card grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_auto_auto]"
    >
      <input type="hidden" name="key" value={r.key} />
      <div className="grid gap-1">
        <Label className="text-xs">
          {r.key} <span className="text-muted-foreground">({r.gateway})</span>
        </Label>
        <Input name="label" defaultValue={v?.label ?? r.label} className="h-8" />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Fee %</Label>
        <Input name="pctPercent" defaultValue={v?.pctPercent ?? r.pctPercent} inputMode="decimal" className="h-8" />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Fixed AED</Label>
        <Input name="fixed" defaultValue={v?.fixed ?? r.fixed} inputMode="decimal" className="h-8" />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Min total</Label>
        <Input name="min" defaultValue={v?.min ?? r.min} inputMode="decimal" className="h-8" />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Max total</Label>
        <Input name="max" defaultValue={v?.max ?? r.max} inputMode="decimal" className="h-8" />
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Countries</Label>
        <Input name="countries" defaultValue={v?.countries ?? r.countries} placeholder="all" className="h-8" />
      </div>
      <label className="flex h-8 items-center gap-1.5 text-xs">
        <Checkbox name="enabled" defaultChecked={v ? v.enabled === "on" : r.enabled} /> On
      </label>
      <Button size="sm" disabled={pending}>
        Save
      </Button>
    </form>
  );
}

export interface GeneralValues {
  vatCountries: string;
  vatRate: string;
  reminderOffsets: string;
  joinWindowMinutes: string;
  checkoutExpiryMinutes: string;
  name: string;
  supportEmail: string;
  supportWhatsapp: string;
  website: string;
}

export function GeneralSettingsForm({ v: initial }: { v: GeneralValues }) {
  const [state, action, pending] = useActionState(saveGeneralSettingsAction, {} as ActionState);
  useToast(state);
  const v = { ...initial, ...state.values };
  return (
    <form key={formKey(state)} action={action} className="grid gap-4">
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Countries that pay 5% VAT on the course"
          name="vatCountries"
          defaultValue={v.vatCountries}
          hint="ISO codes, e.g. AE"
        />
        <Field label="Course VAT rate %" name="vatRate" defaultValue={v.vatRate} inputMode="decimal" />
        <Field
          label="Balance reminder days before due"
          name="reminderOffsets"
          defaultValue={v.reminderOffsets}
          hint="e.g. 7, 3, 1, 0 (0 = on the due day)"
        />
        <Field label="Join button opens (minutes before class)" name="joinWindowMinutes" type="number" defaultValue={v.joinWindowMinutes} />
        <Field
          label="Checkout link valid for (minutes)"
          name="checkoutExpiryMinutes"
          type="number"
          defaultValue={v.checkoutExpiryMinutes}
        />
        <Field label="Academy name" name="name" defaultValue={v.name} />
        <Field label="Support email" name="supportEmail" type="email" defaultValue={v.supportEmail} />
        <Field label="Support WhatsApp" name="supportWhatsapp" defaultValue={v.supportWhatsapp} />
        <Field label="Website" name="website" defaultValue={v.website} />
      </div>
      <Button className="w-fit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}

export interface OdooValues {
  courseProductId: string;
  feeProductId: string;
  taxStandardId: string;
  taxZeroRatedId: string;
  journals: Record<string, string>;
}

export function OdooMappingForm({ v: initial, disabled }: { v: OdooValues; disabled: boolean }) {
  const [state, action, pending] = useActionState(saveOdooMappingAction, {} as ActionState);
  useToast(state);
  const s = state.values;
  return (
    <form key={formKey(state)} action={action} className="grid gap-4">
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <Field label="Course product ID" name="courseProductId" defaultValue={s?.courseProductId ?? initial.courseProductId} />
        <Field label="Processing fee product ID" name="feeProductId" defaultValue={s?.feeProductId ?? initial.feeProductId} />
        <Field label="Tax ID: 5% VAT (sales)" name="taxStandardId" defaultValue={s?.taxStandardId ?? initial.taxStandardId} />
        <Field label="Tax ID: zero-rated export (sales)" name="taxZeroRatedId" defaultValue={s?.taxZeroRatedId ?? initial.taxZeroRatedId} />
        {JOURNAL_GATEWAYS.map((g) => (
          <Field
            key={g}
            label={`Journal ID for ${g.toLowerCase()} payments`}
            name={`journal_${g}`}
            defaultValue={s?.[`journal_${g}`] ?? initial.journals[g] ?? ""}
          />
        ))}
      </fieldset>
      <Button className="w-fit" disabled={pending || disabled}>
        {pending ? "Saving…" : "Save Odoo mapping"}
      </Button>
    </form>
  );
}
