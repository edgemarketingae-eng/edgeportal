"use client";

import { DATE_RANGE_LABELS, DATE_RANGE_PRESETS, formatRange } from "@edge/domain/date-ranges";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import type { DateRange as DayRange } from "react-day-picker";
import { Button } from "../components/button";
import { Calendar } from "../components/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../components/popover";
import { controlClass, controlSize } from "../lib/control";
import { PHONE_QUERY, useMediaQuery } from "../lib/use-media-query";
import { cn } from "../lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (s?: string | null) => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

/**
 * Date filter for a list's <FilterBar>: presets (Today, Last 7 days, This month…) or a custom range from the calendar,
 * optionally with which date it applies to. It lives in the URL as `range` (+ `from`/`to` for a custom range) through
 * hidden inputs, so FilterBar applies and clears it like any other filter; with no `range` the page shows its default.
 */
export function DateRangeFilter({
  range,
  from,
  to,
  label,
  prefix = "Date",
  field,
}: {
  /** The range picked in the URL; undefined = the page's default. */
  range?: string;
  /** A custom range's days (YYYY-MM-DD). */
  from?: string | null;
  to?: string | null;
  /** What the list is showing now, e.g. "Today" or "All dates (searching)". */
  label: string;
  /** Text before the label on the button. */
  prefix?: string;
  /** Which date the range applies to (e.g. a lead's Added / Last activity / Next follow-up date). */
  field?: { name: string; value: string; defaultValue: string; options: [string, string][] };
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayRange | undefined>();
  const phone = useMediaQuery(PHONE_QUERY);
  const trigger = useRef<HTMLButtonElement>(null);
  const explicit = !!range;
  const fieldLabel = field?.options.find(([v]) => v === field.value)?.[1];

  /** Writes the hidden inputs, then lets FilterBar apply the form (same URL rules as every other filter). */
  function apply(next: { range: string; from?: string; to?: string; field?: string }) {
    const form = trigger.current?.closest("form");
    if (!form) return;
    const put = (name: string, value: string) => {
      const el = form.querySelector<HTMLInputElement>(`input[type="hidden"][data-filter][name="${name}"]`);
      if (el) el.value = value;
    };
    put("range", next.range);
    put("from", next.from ?? "");
    put("to", next.to ?? "");
    if (field) put(field.name, next.field && next.field !== field.defaultValue ? next.field : "");
    setOpen(false);
    form.requestSubmit();
  }

  const current = { range: range ?? "", from: range === "custom" ? (from ?? "") : "", to: range === "custom" ? (to ?? "") : "" };
  const draftLabel = draft?.from ? formatRange(ymd(draft.from), ymd(draft.to ?? draft.from)) : null;

  return (
    <>
      {/* Remounted when the URL changes, so the inputs always hold what the page shows. */}
      <span key={`${current.range}|${current.from}|${current.to}|${field?.value ?? ""}`} hidden>
        <input type="hidden" name="range" defaultValue={current.range} data-filter {...(explicit ? { "data-filter-active": "" } : {})} />
        <input type="hidden" name="from" defaultValue={current.from} data-filter />
        <input type="hidden" name="to" defaultValue={current.to} data-filter />
        {field ? (
          <input
            type="hidden"
            name={field.name}
            defaultValue={field.value === field.defaultValue ? "" : field.value}
            data-filter
            {...(field.value !== field.defaultValue ? { "data-filter-active": "" } : {})}
          />
        ) : null}
      </span>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setDraft(range === "custom" ? { from: fromYmd(from), to: fromYmd(to) } : undefined);
        }}
      >
        <PopoverTrigger asChild>
          <button
            ref={trigger}
            type="button"
            className={cn(
              controlClass,
              controlSize.sm,
              "relative flex w-auto cursor-pointer items-center gap-2 pr-9 text-left",
              (explicit || (field && field.value !== field.defaultValue)) && "border-edge-emerald/45 bg-edge-mint/25",
            )}
          >
            <CalendarRange aria-hidden className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate">
              <span className="text-muted-foreground">{fieldLabel ?? prefix}:</span> {label}
            </span>
            <ChevronDown
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto max-w-[calc(100vw-1.5rem)] p-0">
          {field ? (
            <div className="border-b p-2">
              <p className="text-muted-foreground px-1 pb-1.5 text-xs font-medium">Date of</p>
              <div role="radiogroup" aria-label="Date of" className="bg-muted inline-flex gap-0.5 rounded-lg p-0.5">
                {field.options.map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={field.value === v}
                    onClick={() => (field.value === v ? null : apply({ ...current, field: v }))}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium",
                      field.value === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-col sm:flex-row">
            <ul className="grid grid-cols-2 gap-0.5 border-b p-2 sm:flex sm:w-40 sm:flex-col sm:border-r sm:border-b-0">
              {DATE_RANGE_PRESETS.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    onClick={() => apply({ range: p, field: field?.value })}
                    className={cn(
                      "hover:bg-muted flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
                      range === p && "text-edge-emerald font-semibold",
                    )}
                  >
                    {DATE_RANGE_LABELS[p]}
                    {range === p ? <Check aria-hidden className="size-3.5" /> : null}
                  </button>
                </li>
              ))}
            </ul>
            <div className="grid gap-2 p-2">
              <Calendar
                mode="range"
                numberOfMonths={phone ? 1 : 2}
                defaultMonth={draft?.from ?? (phone ? new Date() : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1))}
                selected={draft}
                onSelect={setDraft}
              />
              <div className="flex items-center justify-between gap-3 px-1">
                <span className="text-muted-foreground text-xs">{draftLabel ?? "Pick a start and end day"}</span>
                <Button
                  type="button"
                  size="sm"
                  disabled={!draft?.from}
                  onClick={() =>
                    draft?.from && apply({ range: "custom", from: ymd(draft.from), to: ymd(draft.to ?? draft.from), field: field?.value })
                  }
                >
                  Apply range
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
