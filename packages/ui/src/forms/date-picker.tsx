"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { cn } from "cn";
import { Button } from "../components/button";
import { Calendar } from "../components/calendar";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../components/popover";
import { controlClass, controlSize } from "../lib/control";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "2026-11-03", "3/11/2026" (day first, as in the UAE), "3 Nov 2026" or "Tue 3 Nov 2026" → "2026-11-03". */
export function parseDateText(text: string): string | null {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s+/, "")
    .replace(/\s+/g, " ");
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return iso(+m[3]!, +m[2]!, +m[1]!);
  m = /^(\d{1,2}) ([a-z]{3})[a-z]*\.? (\d{4})$/.exec(t);
  if (m && MONTHS.includes(m[2]!)) return iso(+m[3]!, MONTHS.indexOf(m[2]!) + 1, +m[1]!);
  return null;
}

/** "2026-11-03" → "Tue 3 Nov 2026" (fixed locale and zone so server and browser agree). */
export function formatDateValue(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d))
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .replace(",", "");
}

const toLocalDate = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : undefined;
};
const fromLocalDate = (d: Date) => iso(d.getFullYear(), d.getMonth() + 1, d.getDate())!;
const todayValue = () => fromLocalDate(new Date());

function split(value: string | undefined, mode: "date" | "datetime") {
  const [date = "", time = ""] = (value ?? "").split("T");
  return { date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "", time: mode === "datetime" ? time.slice(0, 5) : "" };
}

export interface DatePickerProps {
  name: string;
  id?: string;
  /** "date" posts `yyyy-mm-dd`; "datetime" posts `yyyy-mm-ddTHH:mm`, like the native inputs it replaces. */
  mode?: "date" | "datetime";
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  /** Time used when a date is picked before a time (datetime mode). */
  defaultTime?: string;
}

/**
 * A date (or date + time) field: type a date or pick it from a calendar. Posts through a hidden input with
 * the same value format as `<input type="date">` / `"datetime-local"`, so server actions need no changes.
 */
export function DatePicker({
  name,
  id,
  mode = "date",
  defaultValue,
  required,
  disabled,
  placeholder,
  className,
  defaultTime = "10:00",
  ...aria
}: DatePickerProps) {
  const initial = split(defaultValue, mode);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [text, setText] = useState(initial.date ? formatDateValue(initial.date) : "");
  const [open, setOpen] = useState(false);
  const [prevDefault, setPrevDefault] = useState(defaultValue);
  if (defaultValue !== prevDefault) {
    setPrevDefault(defaultValue);
    const next = split(defaultValue, mode);
    setDate(next.date);
    setTime(next.time);
    setText(next.date ? formatDateValue(next.date) : "");
  }

  // Native fields go back to their default when the form resets (React does this after a form action).
  const hidden = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form) return;
    const onReset = () => {
      const d = split(defaultValue, mode);
      setDate(d.date);
      setTime(d.time);
      setText(d.date ? formatDateValue(d.date) : "");
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultValue, mode]);

  function choose(next: string) {
    setDate(next);
    setText(next ? formatDateValue(next) : "");
    if (mode === "datetime" && next && !time) setTime(defaultTime);
  }

  const value = mode === "date" ? date : date ? `${date}T${time || defaultTime}` : "";
  const selected = date ? toLocalDate(date) : undefined;

  return (
    <div data-slot="date-picker" className={cn("flex w-full flex-wrap gap-2", className)}>
      <input ref={hidden} type="hidden" name={name} value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative min-w-0 flex-[2_1_10rem]">
            <input
              id={id ?? name}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={text}
              required={required}
              disabled={disabled}
              placeholder={placeholder ?? "dd/mm/yyyy"}
              aria-invalid={aria["aria-invalid"]}
              aria-describedby={aria["aria-describedby"]}
              onChange={(e) => {
                setText(e.target.value);
                if (!e.target.value.trim()) setDate("");
                const parsed = parseDateText(e.target.value);
                if (parsed) {
                  setDate(parsed);
                  if (mode === "datetime" && !time) setTime(defaultTime);
                }
              }}
              onBlur={() => setText(date ? formatDateValue(date) : "")}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && e.altKey) setOpen(true);
              }}
              className={cn(controlClass, controlSize.md, "pr-10 tabular-nums")}
            />
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={disabled}
                aria-label="Open calendar"
                className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-edge-green/30 absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded-md transition-colors outline-none focus-visible:ring-2"
              >
                <CalendarDays className="size-4" />
              </button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>
        <PopoverContent align="start" className="w-auto gap-0 p-0">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            startMonth={new Date(2020, 0)}
            endMonth={new Date(new Date().getFullYear() + 5, 11)}
            selected={selected}
            defaultMonth={selected}
            onSelect={(d) => {
              choose(d ? fromLocalDate(d) : "");
              setOpen(false);
            }}
            className="p-3 [--cell-size:--spacing(9)]"
          />
          <div className="flex items-center justify-between border-t px-3 py-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => (choose(""), setOpen(false))}>
              Clear
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => (choose(todayValue()), setOpen(false))}>
              Today
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {mode === "datetime" ? (
        <div className="min-w-0 flex-[1_1_7rem]">
          <input
            type="time"
            aria-label="Time"
            value={time}
            disabled={disabled}
            onChange={(e) => setTime(e.target.value)}
            className={cn(controlClass, controlSize.md, "pr-2 tabular-nums")}
          />
        </div>
      ) : null}
    </div>
  );
}

/** A styled native time input (`HH:mm`); the browser supplies the clock button. */
export function TimeInput({ className, ...props }: ComponentProps<"input">) {
  return <input type="time" {...props} className={cn(controlClass, controlSize.md, "pr-2 tabular-nums", className)} />;
}
