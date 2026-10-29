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
    // Cards draw their edge with a ring, so the tones colour the ring.
    <Card
      className={cn(
        "h-full transition-[box-shadow,--tw-ring-color]",
        href && "hover:ring-edge-emerald/60 hover:shadow-md",
        tone === "warn" && "ring-amber-400/70",
        tone === "danger" && "ring-destructive/45",
      )}
    >
      <CardContent>
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{label}</p>
        <p
          className={cn(
            "mt-1 text-3xl font-bold tabular-nums",
            tone === "warn" && "text-amber-800 dark:text-amber-300",
            tone === "danger" && "text-destructive",
          )}
        >
          {value}
        </p>
        {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
