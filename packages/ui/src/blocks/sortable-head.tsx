"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "../lib/utils";
import { TableHead } from "../components/table";
import { FilterLink } from "./filter-bar";

export interface SortState {
  /** The column the list is sorted by. */
  sort: string;
  dir: "asc" | "desc";
}

/**
 * A column header that sorts the list (in the URL, without a reload): a first click sorts by the column in its natural
 * direction, the next click flips it. `query` is the list's current query string; paging restarts at page 1.
 */
export function SortableHead({
  column,
  children,
  current,
  query,
  defaultDir = "asc",
  className,
}: {
  column: string;
  children: string;
  current: SortState;
  query: string;
  defaultDir?: "asc" | "desc";
  className?: string;
}) {
  const active = current.sort === column;
  const dir = active ? (current.dir === "asc" ? "desc" : "asc") : defaultDir;
  const params = new URLSearchParams(query);
  params.set("sort", column);
  params.set("dir", dir);
  params.delete("page");
  const Icon = !active ? ArrowUpDown : current.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={active ? (current.dir === "asc" ? "ascending" : "descending") : "none"}>
      <FilterLink
        href={`?${params}`}
        scroll={false}
        aria-label={`Sort by ${children}${active ? (dir === "asc" ? ", ascending" : ", descending") : ""}`}
        className={cn(
          "group hover:text-foreground -mx-1 inline-flex items-center gap-1 rounded px-1 uppercase transition-colors",
          active && "text-foreground",
        )}
      >
        {children}
        <Icon aria-hidden className={cn("size-3.5 shrink-0", active ? "opacity-100" : "opacity-35 group-hover:opacity-80")} />
      </FilterLink>
    </TableHead>
  );
}
