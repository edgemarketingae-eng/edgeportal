"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { controlClass, controlSize } from "../lib/control";
import { cn } from "../lib/utils";

export interface DocCard {
  href: string;
  title: string;
  summary: string;
  group: string;
  icon: ReactNode;
  /** Section titles, searched along with the title and summary. */
  topics: string[];
}

/** Docs home: module cards grouped by area, with instant search over titles, summaries and section names. */
export function DocsGrid({ cards }: { cards: DocCard[] }) {
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (c: DocCard) => {
    const hay = [c.title, c.summary, ...c.topics].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const shown = cards.filter(match);
  const groups = [...new Set(shown.map((c) => c.group))];
  return (
    <div className="grid gap-8">
      <div className="relative max-w-xl">
        <Search aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the guides, e.g. “assign lead” or “balance due”"
          aria-label="Search the guides"
          className={cn(controlClass, controlSize.md, "h-11 pr-10 pl-10")}
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear search"
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      {shown.length === 0 ? <p className="text-muted-foreground">Nothing matches “{q}”. Try a shorter word.</p> : null}
      {groups.map((g) => (
        <section key={g} className="grid gap-3">
          <h2 className="text-muted-foreground font-sans text-xs font-bold tracking-[0.16em] uppercase">{g}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shown
              .filter((c) => c.group === g)
              .map((c) => {
                const hits = words.length ? c.topics.filter((t) => words.some((w) => t.toLowerCase().includes(w))).slice(0, 3) : [];
                return (
                  <Link
                    key={c.href}
                    href={c.href}
                    className="group bg-card hover:border-edge-emerald/50 flex gap-3 rounded-xl border p-4 transition-[border-color,box-shadow] hover:shadow-[0_4px_16px_rgb(2_26_26/0.06)]"
                  >
                    <span className="bg-edge-mint/50 text-edge-emerald grid size-10 shrink-0 place-items-center rounded-lg [&_svg]:size-5">
                      {c.icon}
                    </span>
                    <span className="grid min-w-0 gap-1">
                      <span className="group-hover:text-edge-emerald font-semibold transition-colors">{c.title}</span>
                      <span className="text-muted-foreground text-sm leading-snug">{c.summary}</span>
                      {hits.length ? <span className="text-edge-emerald text-xs">{hits.join(" · ")}</span> : null}
                    </span>
                  </Link>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
