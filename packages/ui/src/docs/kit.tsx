import { Info, Lightbulb, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

/** Building blocks for writing docs content. Keep sentences short and name buttons exactly as the app shows them. */

export function P({ children }: { children: ReactNode }) {
  return <p className="text-foreground/85 leading-relaxed">{children}</p>;
}

/** The exact name of a button, menu or field, as it appears on screen. */
export function Ui({ children }: { children: ReactNode }) {
  return (
    <span className="bg-muted text-foreground rounded-md border px-1.5 py-0.5 text-[0.85em] font-semibold whitespace-nowrap">
      {children}
    </span>
  );
}

/** A link to a page in the same app. */
export function To({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-edge-emerald font-semibold underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

export function Steps({ children }: { children: ReactNode[] | ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  return (
    <ol className="grid gap-3">
      {items.map((c, i) => (
        <li key={i} className="flex gap-3">
          <span className="bg-edge-ink text-edge-green mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold">
            {i + 1}
          </span>
          <div className="text-foreground/85 min-w-0 leading-relaxed">{c}</div>
        </li>
      ))}
    </ol>
  );
}

export function List({ children }: { children: ReactNode[] | ReactNode }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  return (
    <ul className="grid gap-2">
      {items.map((c, i) => (
        <li key={i} className="text-foreground/85 flex gap-2.5 leading-relaxed">
          <span className="bg-edge-emerald mt-2.5 size-1.5 shrink-0 rounded-full" />
          <div className="min-w-0">{c}</div>
        </li>
      ))}
    </ul>
  );
}

const NOTE = {
  tip: { icon: Lightbulb, className: "border-edge-emerald/25 bg-edge-mint/35", iconClass: "text-edge-emerald", label: "Tip" },
  info: { icon: Info, className: "border-sky-500/25 bg-sky-500/8", iconClass: "text-sky-700", label: "Good to know" },
  warning: { icon: TriangleAlert, className: "border-amber-500/30 bg-amber-500/10", iconClass: "text-amber-700", label: "Careful" },
};

export function Note({ kind = "info", title, children }: { kind?: keyof typeof NOTE; title?: string; children: ReactNode }) {
  const n = NOTE[kind];
  const Icon = n.icon;
  return (
    <div className={cn("flex gap-3 rounded-xl border px-4 py-3", n.className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", n.iconClass)} />
      <div className="text-foreground/85 grid gap-1 text-sm leading-relaxed">
        <p className="text-foreground font-semibold">{title ?? n.label}</p>
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Two-column reference table: a term (status, role, field) and what it means. */
export function Terms({ rows, head }: { rows: [ReactNode, ReactNode][]; head?: [string, string] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        {head ? (
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-4 py-2.5 font-semibold">{head[0]}</th>
              <th className="px-4 py-2.5 font-semibold">{head[1]}</th>
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map(([t, d], i) => (
            <tr key={i} className="border-t align-top first:border-t-0">
              <td className="w-1/3 px-4 py-2.5 font-semibold whitespace-nowrap">{t}</td>
              <td className="text-foreground/85 px-4 py-2.5 leading-relaxed">{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A simple flow, e.g. New → Contacted → Qualified. */
export function Flow({ steps }: { steps: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      {steps.map((s, i) => (
        <span key={s} className="flex items-center gap-1.5">
          <span className="bg-card rounded-full border px-3 py-1 font-semibold">{s}</span>
          {i < steps.length - 1 ? <span className="text-muted-foreground">→</span> : null}
        </span>
      ))}
    </div>
  );
}
