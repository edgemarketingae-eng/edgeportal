"use client";

import type { EmployeeRecord, HrSettingsDto, PayRevisionDto } from "@edge/contracts";
import { PAY_CURRENCIES } from "@edge/domain/hr/enums";
import { WEEKDAY_LABELS } from "@edge/domain/hr/labels";
import { toMajor } from "@edge/domain/money";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Input } from "@edge/ui/components/input";
import { Label } from "@edge/ui/components/label";
import { Select } from "@edge/ui/components/select";
import { Field, FormError } from "@edge/ui/forms/field";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { saveEmployeeAction, savePayAction } from "@/lib/actions/hr";
import { useSaveAction } from "./use-save-action";

export function EmployeeForm({
  id,
  record,
  leaveTypes,
}: {
  id: string;
  record: EmployeeRecord | null;
  leaveTypes: HrSettingsDto["leaveTypes"] | null;
}) {
  const [state, action, pending] = useSaveAction(saveEmployeeAction);
  const [ownOff, setOwnOff] = useState(!!record?.weeklyOffOverride);
  const [overrides, setOverrides] = useState(record?.leaveOverrides ?? []);
  const accruing = leaveTypes?.filter((t) => t.accrual !== "NONE" && t.active) ?? [];
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="leaveOverrides" value={JSON.stringify(overrides)} />
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Joined on" name="joinedOn" type="date" defaultValue={record?.joinedOn} required error={state.fieldErrors?.joinedOn} />
        <Field
          label="Left on"
          name="leftOn"
          type="date"
          defaultValue={record?.leftOn ?? undefined}
          error={state.fieldErrors?.leftOn}
          hint="Setting this cancels leave after that date."
        />
        <Field label="Employee code" name="employeeCode" defaultValue={record?.employeeCode ?? ""} />
        <Field label="Department" name="department" defaultValue={record?.department ?? ""} />
        <Field label="Nationality" name="nationality" defaultValue={record?.nationality ?? ""} />
        <Field label="Passport number" name="passportNumber" defaultValue={record?.passportNumber ?? ""} />
        <Field label="Emirates ID" name="emiratesId" defaultValue={record?.emiratesId ?? ""} />
        <Field label="Emergency contact" name="emergencyName" defaultValue={record?.emergencyName ?? ""} />
        <Field label="Emergency phone" name="emergencyPhone" defaultValue={record?.emergencyPhone ?? ""} />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Checkbox id="ownWeeklyOff" name="ownWeeklyOff" checked={ownOff} onCheckedChange={(v) => setOwnOff(v === true)} />
          <Label htmlFor="ownWeeklyOff" className="font-normal">
            This person has a different weekly off
          </Label>
        </div>
        {ownOff ? (
          <div className="flex flex-wrap gap-3 pl-6">
            {WEEKDAY_LABELS.map((d, i) => (
              <div key={d} className="flex items-center gap-1.5">
                <Checkbox id={`off-${i}`} name="weeklyOff" value={String(i)} defaultChecked={record?.weeklyOffOverride?.includes(i)} />
                <Label htmlFor={`off-${i}`} className="font-normal">
                  {d}
                </Label>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {accruing.length ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Leave days per year for this person</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accruing.map((t) => (
              <Field
                key={t.key}
                label={t.name}
                name={`override-${t.key}`}
                inputMode="decimal"
                placeholder={`${t.daysPerYear} (company rule)`}
                defaultValue={overrides.find((o) => o.typeKey === t.key)?.daysPerYear ?? ""}
                onChange={(e) => {
                  const value = e.target.value.trim();
                  const rest = overrides.filter((o) => o.typeKey !== t.key);
                  setOverrides(
                    value === "" || Number.isNaN(Number(value)) ? rest : [...rest, { typeKey: t.key, daysPerYear: Number(value) }],
                  );
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
      <Button className="w-fit" pending={pending}>
        {record ? "Save" : "Set up record"}
      </Button>
    </form>
  );
}

export function PayForm({ id, current, earliestMonth }: { id: string; current: PayRevisionDto | null; earliestMonth: string }) {
  const [state, action, pending] = useSaveAction(savePayAction);
  const [allowances, setAllowances] = useState(
    (current?.allowances ?? []).map((a) => ({ label: a.label, amount: String(toMajor(a.amountMinor)) })),
  );
  const set = (i: number, patch: Partial<{ label: string; amount: string }>) =>
    setAllowances(allowances.map((a, n) => (n === i ? { ...a, ...patch } : a)));
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="allowances" value={JSON.stringify(allowances)} />
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field
          label="Applies from (YYYY-MM)"
          name="fromMonth"
          defaultValue={earliestMonth}
          required
          pattern="\d{4}-\d{2}"
          error={state.fieldErrors?.fromMonth}
        />
        <Field label="Currency" name="currency" error={state.fieldErrors?.currency}>
          <Select id="currency" name="currency" defaultValue={current?.currency ?? "AED"}>
            {PAY_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Base salary"
          name="base"
          inputMode="decimal"
          defaultValue={current ? String(toMajor(current.baseMinor)) : ""}
          required
          hint="Use 0 if they aren't paid a salary."
          error={state.fieldErrors?.base}
        />
      </div>
      <div className="grid gap-2">
        <p className="text-sm font-medium">Allowances</p>
        {allowances.map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input aria-label="Allowance name" placeholder="Housing" value={a.label} onChange={(e) => set(i, { label: e.target.value })} />
            <Input
              aria-label="Allowance amount"
              inputMode="decimal"
              placeholder="500"
              className="w-32"
              value={a.amount}
              onChange={(e) => set(i, { amount: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove allowance"
              onClick={() => setAllowances(allowances.filter((_, n) => n !== i))}
            >
              <X />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => setAllowances([...allowances, { label: "", amount: "" }])}
        >
          <Plus /> Add allowance
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Bank" name="bankName" defaultValue={current?.bankName ?? ""} />
        <Field label="Account name" name="accountName" defaultValue={current?.accountName ?? ""} />
        <Field label="IBAN or account number" name="iban" defaultValue={current?.iban ?? ""} />
      </div>
      <Field id="pay-note" label="Note" name="note" defaultValue="" />
      <Button className="w-fit" pending={pending}>
        Save pay
      </Button>
    </form>
  );
}
