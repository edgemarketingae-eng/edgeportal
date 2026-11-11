import { addDays, format, parseISO } from "date-fns";
import { dubaiDateString } from "./dates";

/**
 * Date filters on CRM lists: a preset or a custom range of Dubai calendar days. Pages resolve the preset to
 * `from`/`to` (YYYY-MM-DD, both inclusive) and the API filters on those, so "today" means today in Dubai.
 */
export const DATE_RANGES = ["today", "yesterday", "7d", "30d", "month", "lastMonth", "year", "all", "custom"] as const;
export type DateRange = (typeof DATE_RANGES)[number];
/** The presets offered in the picker (custom comes from the calendar). */
export const DATE_RANGE_PRESETS = [
  "today",
  "yesterday",
  "7d",
  "30d",
  "month",
  "lastMonth",
  "year",
  "all",
] as const satisfies readonly DateRange[];

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
  lastMonth: "Last month",
  year: "This year",
  all: "All time",
  custom: "Custom",
};

export interface ResolvedRange {
  range: DateRange;
  /** First day (YYYY-MM-DD), or null for no lower bound. */
  from: string | null;
  /** Last day, inclusive, or null for no upper bound. */
  to: string | null;
  label: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (s: string | null | undefined): s is string => !!s && DAY.test(s) && !Number.isNaN(parseISO(s).getTime());
const shift = (ymd: string, days: number) => format(addDays(parseISO(ymd), days), "yyyy-MM-dd");

export const isDateRange = (s: unknown): s is DateRange => typeof s === "string" && (DATE_RANGES as readonly string[]).includes(s);

/** "11 Nov 2026", "3 – 9 Nov 2026", "28 Oct – 3 Nov 2026", "30 Dec 2025 – 2 Jan 2026". */
export function formatRange(from: string, to: string) {
  if (from === to) return format(parseISO(from), "d MMM yyyy");
  const a = parseISO(from);
  const b = parseISO(to);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${format(a, "d")} – ${format(b, "d MMM yyyy")}`;
  if (from.slice(0, 4) === to.slice(0, 4)) return `${format(a, "d MMM")} – ${format(b, "d MMM yyyy")}`;
  return `${format(a, "d MMM yyyy")} – ${format(b, "d MMM yyyy")}`;
}

/**
 * A preset (or a custom from/to) as Dubai days at `now`. An unknown preset, or custom without a valid `from`,
 * falls back to `fallback`. A reversed custom range is swapped; a missing `to` means the single day `from`.
 */
export function resolveDateRange(
  input: { range?: string | null; from?: string | null; to?: string | null },
  now: Date,
  fallback: DateRange = "today",
): ResolvedRange {
  const today = dubaiDateString(now);
  const range = isDateRange(input.range) ? input.range : fallback;
  const out = (from: string | null, to: string | null): ResolvedRange => ({ range, from, to, label: DATE_RANGE_LABELS[range] });
  switch (range) {
    case "today":
      return out(today, today);
    case "yesterday":
      return out(shift(today, -1), shift(today, -1));
    case "7d":
      return out(shift(today, -6), today);
    case "30d":
      return out(shift(today, -29), today);
    case "month":
      return out(`${today.slice(0, 7)}-01`, today);
    case "lastMonth": {
      const first = `${today.slice(0, 7)}-01`;
      const lastOfPrev = shift(first, -1);
      return out(`${lastOfPrev.slice(0, 7)}-01`, lastOfPrev);
    }
    case "year":
      return out(`${today.slice(0, 4)}-01-01`, today);
    case "all":
      return out(null, null);
    case "custom": {
      if (!validDay(input.from)) return resolveDateRange({ range: fallback === "custom" ? "today" : fallback }, now);
      let from = input.from;
      let to = validDay(input.to) ? input.to : from;
      if (to < from) [from, to] = [to, from];
      return { range, from, to, label: formatRange(from, to) };
    }
  }
}
