import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent } from "../components/card";
import { cn } from "../lib/utils";

export function StatCard({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "warn" | "danger";
}) {
  const body = (
    <Card
      className={cn(
        "h-full transition-colors",
        href && "hover:border-edge-emerald",
        tone === "warn" && "border-amber-400/60",
        tone === "danger" && "border-destructive/40",
      )}
    >
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
        {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
