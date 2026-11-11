import "server-only";
import { isDateRange, resolveDateRange, type DateRange } from "@edge/domain/date-ranges";

type Params = Record<string, string | string[] | undefined>;

/**
 * The date filter of a list page. A range in the URL (`range`, plus `from`/`to` for a custom one) always applies; an
 * older preset param (`legacy`, e.g. leads' `created=week`) maps onto one. Otherwise the page shows today, except while
 * searching, which looks across all dates (people search for someone whatever day they came in).
 */
export function pageRange(sp: Params, opts: { searching?: boolean; legacy?: { param: string; map: Record<string, DateRange> } } = {}) {
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  let explicit = isDateRange(one("range")) ? (one("range") as DateRange) : undefined;
  if (!explicit && opts.legacy) explicit = opts.legacy.map[one(opts.legacy.param) ?? ""];
  const now = new Date();
  const r = explicit
    ? resolveDateRange({ range: explicit, from: one("from"), to: one("to") }, now)
    : resolveDateRange({ range: opts.searching ? "all" : "today" }, now);
  const label = explicit ? r.label : opts.searching ? "All dates (searching)" : "Today";
  return {
    /** For the API: Dubai days, both inclusive; both undefined = all dates. */
    from: r.from ?? undefined,
    to: r.to ?? undefined,
    all: r.from == null && r.to == null,
    /** Props for <DateRangeFilter>. */
    filter: {
      range: explicit ? r.range : undefined,
      from: r.range === "custom" ? r.from : undefined,
      to: r.range === "custom" ? r.to : undefined,
      label,
    },
  };
}
