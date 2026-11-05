"use client";

import { WORK_UPDATE_MAX_CHARS, WORK_UPDATE_MAX_ITEMS, type MyWorkUpdates } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Select } from "@edge/ui/components/select";
import { Textarea } from "@edge/ui/components/textarea";
import { DatePicker } from "@edge/ui/forms/date-picker";
import { FormError } from "@edge/ui/forms/field";
import { cn } from "@edge/ui/lib/utils";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { clearWorkUpdateAction, saveWorkUpdateAction } from "@/lib/actions/hr";
import { useSaveAction } from "./use-save-action";

/** Switches the page to another day through `?day=`. */
export function DayNav({ day, min, max, basePath }: { day: string; min?: string; max: string; basePath: string }) {
  const router = useRouter();
  return (
    <div className="w-60">
      <DatePicker
        key={day}
        id="pick-day"
        name="pick-day"
        mode="date"
        defaultValue={day}
        min={min}
        max={max}
        onValueChange={(d) => d && d !== day && router.push(`${basePath}?day=${d}`)}
        aria-label="Day"
      />
    </div>
  );
}

/** HR's person filter: picking someone shows their timeline; "Everyone" goes back to the day view. */
export function PersonPicker({ people, value, basePath }: { people: { id: string; name: string }[]; value?: string; basePath: string }) {
  const router = useRouter();
  return (
    <div className="w-64">
      <Select
        aria-label="Person"
        value={value ?? ""}
        onChange={(e) => router.push(e.target.value ? `${basePath}?person=${e.target.value}` : basePath)}
      >
        <option value="">Everyone, by day</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

type Row = { id: number; text: string };

/**
 * The person's points for one day. Rows keep their own ids so removing one in the middle doesn't move typing focus
 * or text into its neighbour. Enter starts a new point; the list is posted as JSON.
 */
export function WorkUpdateForm({ data }: { data: MyWorkUpdates }) {
  const [state, action, pending] = useSaveAction(saveWorkUpdateAction);
  const [rows, setRows] = useState<Row[]>(() => (data.items.length ? data.items : [""]).map((text, id) => ({ id, text })));
  const nextId = useRef(rows.length);
  const inputs = useRef(new Map<number, HTMLTextAreaElement>());
  const [focusId, setFocusId] = useState<number | null>(null);
  useEffect(() => {
    if (focusId !== null) inputs.current.get(focusId)?.focus();
  }, [focusId]);
  const readOnly = data.day < data.earliest;
  const full = rows.length >= WORK_UPDATE_MAX_ITEMS;

  const add = (after?: number) => {
    if (full) return;
    const row = { id: nextId.current++, text: "" };
    const at = after === undefined ? rows.length : rows.findIndex((r) => r.id === after) + 1;
    setRows([...rows.slice(0, at), row, ...rows.slice(at)]);
    setFocusId(row.id);
  };
  const remove = (id: number) => {
    const next = rows.filter((r) => r.id !== id);
    setRows(next.length ? next : [{ id: nextId.current++, text: "" }]);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, r: Row) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (r.text.trim()) add(r.id);
  };

  if (readOnly)
    return (
      <div className="grid gap-3">
        <p className="text-muted-foreground text-sm">Updates from before {formatDate(data.earliest)} can no longer be changed.</p>
        <Points items={data.items} />
      </div>
    );

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="day" value={data.day} />
      <input type="hidden" name="items" value={JSON.stringify(rows.map((r) => r.text))} />
      <ul className="grid gap-2">
        {rows.map((r, n) => (
          <li key={r.id} className="flex items-start gap-2">
            <span aria-hidden className="bg-edge-emerald mt-4 size-1.5 shrink-0 rounded-full" />
            <div className="grid min-w-0 flex-1 gap-1">
              <Textarea
                ref={(el) => {
                  if (el) inputs.current.set(r.id, el);
                  else inputs.current.delete(r.id);
                }}
                aria-label={`Point ${n + 1}`}
                rows={1}
                maxLength={WORK_UPDATE_MAX_CHARS}
                placeholder={n === 0 ? "What did you work on?" : "Another point"}
                value={r.text}
                onChange={(e) => setRows(rows.map((x) => (x.id === r.id ? { ...x, text: e.target.value.replace(/\n/g, " ") } : x)))}
                onKeyDown={(e) => onKeyDown(e, r)}
                className="min-h-10 py-2"
              />
              {r.text.length >= WORK_UPDATE_MAX_CHARS - 60 ? (
                <span
                  className={cn(
                    "text-muted-foreground text-right text-xs tabular-nums",
                    r.text.length >= WORK_UPDATE_MAX_CHARS && "text-amber-700 dark:text-amber-300",
                  )}
                >
                  {r.text.length}/{WORK_UPDATE_MAX_CHARS}
                </span>
              ) : null}
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove point ${n + 1}`} onClick={() => remove(r.id)}>
              <X />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {full ? (
          <p className="text-muted-foreground text-xs">That&apos;s the most points for one day ({WORK_UPDATE_MAX_ITEMS}).</p>
        ) : (
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => add()}>
            <Plus /> Add point
          </Button>
        )}
        <div className="flex gap-2">
          {data.items.length ? (
            <ActionDialog
              action={clearWorkUpdateAction}
              hidden={{ day: data.day }}
              title="Clear this day's update?"
              description="All the points for this day are removed."
              submitLabel="Clear"
              cancelLabel="Keep"
              destructive
              trigger={
                <Button type="button" variant="ghost" size="sm">
                  Clear
                </Button>
              }
            />
          ) : null}
          <Button size="sm" pending={pending}>
            Save
          </Button>
        </div>
      </div>
      <FormError state={state} />
    </form>
  );
}

export function Points({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-1.5 text-sm">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden className="bg-edge-emerald mt-2 size-1.5 shrink-0 rounded-full" />
          <span className="min-w-0 break-words whitespace-pre-wrap">{t}</span>
        </li>
      ))}
    </ul>
  );
}
