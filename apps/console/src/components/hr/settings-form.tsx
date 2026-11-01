"use client";

import type { HrSettingsDto } from "@edge/contracts";
import { LEAVE_ACCRUALS } from "@edge/domain/hr/enums";
import { WEEKDAY_LABELS } from "@edge/domain/hr/labels";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Input } from "@edge/ui/components/input";
import { Label } from "@edge/ui/components/label";
import { Select } from "@edge/ui/components/select";
import { DatePicker } from "@edge/ui/forms/date-picker";
import { FormError } from "@edge/ui/forms/field";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { saveHrSettingsAction } from "@/lib/actions/hr";
import { useSaveAction } from "./use-save-action";

const ACCRUAL_LABELS: Record<(typeof LEAVE_ACCRUALS)[number], string> = {
  MONTHLY: "Added monthly",
  YEARLY: "Given each January",
  NONE: "No balance kept",
};
type LeaveType = Omit<HrSettingsDto["leaveTypes"][number], "key"> & { key?: string };

export function HrSettingsForm({ settings }: { settings: HrSettingsDto }) {
  const [state, action, pending] = useSaveAction(saveHrSettingsAction);
  const [types, setTypes] = useState<LeaveType[]>(settings.leaveTypes);
  const [weeklyOff, setWeeklyOff] = useState(settings.weeklyOffDays);
  const [holidays, setHolidays] = useState(settings.holidays);
  const setType = (i: number, patch: Partial<LeaveType>) => setTypes(types.map((t, n) => (n === i ? { ...t, ...patch } : t)));
  const setHoliday = (i: number, patch: Partial<HrSettingsDto["holidays"][number]>) =>
    setHolidays(holidays.map((h, n) => (n === i ? { ...h, ...patch } : h)));
  return (
    <form action={action} className="grid gap-6">
      <input type="hidden" name="payload" value={JSON.stringify({ leaveTypes: types, weeklyOffDays: weeklyOff, holidays })} />
      <FormError state={state} />
      <Card>
        <CardHeader>
          <CardTitle>Leave types</CardTitle>
          <CardDescription>
            Carry forward is the most days that move into next year. Used types can be switched off, never removed.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {types.map((t, i) => (
            <div key={t.key ?? i} className="grid gap-3 rounded-lg border p-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="grid gap-1.5">
                  <Label htmlFor={`name-${i}`}>Name</Label>
                  <Input id={`name-${i}`} value={t.name} onChange={(e) => setType(i, { name: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`accrual-${i}`}>Balance</Label>
                  <Select
                    id={`accrual-${i}`}
                    value={t.accrual}
                    onChange={(e) => setType(i, { accrual: e.target.value as LeaveType["accrual"] })}
                  >
                    {LEAVE_ACCRUALS.map((a) => (
                      <option key={a} value={a}>
                        {ACCRUAL_LABELS[a]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`days-${i}`}>Days per year</Label>
                  <Input
                    id={`days-${i}`}
                    type="number"
                    min={0}
                    max={366}
                    step="0.5"
                    value={t.daysPerYear}
                    onChange={(e) => setType(i, { daysPerYear: Number(e.target.value) })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`carry-${i}`}>Carry forward days</Label>
                  <Input
                    id={`carry-${i}`}
                    type="number"
                    min={0}
                    max={366}
                    step="0.5"
                    value={t.carryForwardDays}
                    onChange={(e) => setType(i, { carryForwardDays: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                {(
                  [
                    ["paid", "Paid"],
                    ["needsAttachment", "Needs a document"],
                    ["active", "Active"],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field} className="flex items-center gap-1.5">
                    <Checkbox id={`${field}-${i}`} checked={t[field]} onCheckedChange={(v) => setType(i, { [field]: v === true })} />
                    <Label htmlFor={`${field}-${i}`} className="font-normal">
                      {label}
                    </Label>
                  </div>
                ))}
                {!t.key ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setTypes(types.filter((_, n) => n !== i))}>
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() =>
              setTypes([
                ...types,
                { name: "", paid: true, accrual: "NONE", daysPerYear: 0, carryForwardDays: 0, needsAttachment: false, active: true },
              ])
            }
          >
            <Plus /> Add a leave type
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Weekly off</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          {WEEKDAY_LABELS.map((d, i) => (
            <div key={d} className="flex items-center gap-1.5">
              <Checkbox
                id={`weekly-${i}`}
                checked={weeklyOff.includes(i)}
                onCheckedChange={(v) => setWeeklyOff(v === true ? [...weeklyOff, i] : weeklyOff.filter((x) => x !== i))}
              />
              <Label htmlFor={`weekly-${i}`} className="font-normal">
                {d}
              </Label>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Holidays</CardTitle>
          <CardDescription>Holidays aren&apos;t counted as leave days.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {holidays.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-48 shrink-0">
                <DatePicker
                  id={`holiday-${i}`}
                  name={`holiday-${i}`}
                  mode="date"
                  defaultValue={h.day}
                  onValueChange={(day) => setHoliday(i, { day })}
                  aria-label="Date"
                />
              </div>
              <Input aria-label="Holiday name" value={h.name} onChange={(e) => setHoliday(i, { name: e.target.value })} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove holiday"
                onClick={() => setHolidays(holidays.filter((_, n) => n !== i))}
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
            onClick={() => setHolidays([...holidays, { day: "", name: "" }])}
          >
            <Plus /> Add a holiday
          </Button>
        </CardContent>
      </Card>
      <Button className="w-fit" pending={pending}>
        Save settings
      </Button>
    </form>
  );
}
