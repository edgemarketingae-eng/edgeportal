"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Select } from "../components/select";
import { cn } from "../lib/utils";
import { FilterLink, useListNavigate } from "./filter-bar";

const SIZES = [25, 50, 100];

/** 1 … 4 5 [6] 7 8 … 20 */
function pageList(page: number, last: number): (number | "gap")[] {
  const keep = new Set([1, last, page - 1, page, page + 1].filter((p) => p >= 1 && p <= last));
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

/**
 * Pager for a server-paged list. Keeps every other query param, so filters survive; links navigate in place
 * (inside a FilterScope the results dim while the next page loads).
 */
export function Pagination({
  page,
  pageSize,
  total,
  noun = "results",
  defaultSize = 50,
  param = "page",
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  noun?: string;
  defaultSize?: number;
  /** Query param for the page number, when a page has more than one list. */
  param?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const navigate = useListNavigate();
  const sizeParam = param === "page" ? "pageSize" : `${param}Size`;
  const href = (p: number, size = pageSize) => {
    const q = new URLSearchParams(search.toString());
    if (p <= 1) q.delete(param);
    else q.set(param, String(p));
    if (size === defaultSize) q.delete(sizeParam);
    else q.set(sizeParam, String(size));
    const qs = q.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const top = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const item =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm font-medium tabular-nums transition-colors";
  return (
    <nav aria-label="Pagination" className={cn("mt-4 flex flex-wrap items-center justify-between gap-3 text-sm", className)}>
      <p className="text-muted-foreground tabular-nums">
        {total <= pageSize
          ? `${total.toLocaleString("en")} ${noun}`
          : `Showing ${from.toLocaleString("en")}–${to.toLocaleString("en")} of ${total.toLocaleString("en")} ${noun}`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {last > 1 ? (
          <div className="flex items-center gap-1">
            {page > 1 ? (
              <FilterLink href={href(page - 1)} onClick={top} aria-label="Previous page" className={cn(item, "bg-card hover:bg-muted")}>
                <ChevronLeft className="size-4" />
              </FilterLink>
            ) : (
              <span aria-hidden className={cn(item, "text-muted-foreground/50")}>
                <ChevronLeft className="size-4" />
              </span>
            )}
            {pageList(page, last).map((p, i) =>
              p === "gap" ? (
                <span key={`gap-${i}`} className="text-muted-foreground px-1">
                  …
                </span>
              ) : (
                <FilterLink
                  key={p}
                  href={href(p)}
                  onClick={top}
                  aria-label={`Page ${p}`}
                  aria-current={p === page ? "page" : undefined}
                  className={cn(item, p === page ? "border-edge-emerald bg-edge-mint/50 text-edge-emerald" : "bg-card hover:bg-muted")}
                >
                  {p}
                </FilterLink>
              ),
            )}
            {page < last ? (
              <FilterLink href={href(page + 1)} onClick={top} aria-label="Next page" className={cn(item, "bg-card hover:bg-muted")}>
                <ChevronRight className="size-4" />
              </FilterLink>
            ) : (
              <span aria-hidden className={cn(item, "text-muted-foreground/50")}>
                <ChevronRight className="size-4" />
              </span>
            )}
          </div>
        ) : null}
        {total > SIZES[0]! ? (
          <div className="text-muted-foreground flex items-center gap-2">
            <span aria-hidden>Rows</span>
            <Select
              size="sm"
              wrapperClassName="w-20"
              value={pageSize}
              aria-label="Rows per page"
              onChange={(e) => navigate(href(1, Number(e.target.value)))}
            >
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
