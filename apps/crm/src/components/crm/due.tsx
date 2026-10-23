"use client";

import { daysUntil, dubaiDateOnly, formatDateTime, formatTime } from "@edge/domain/dates";

/** Due label for a follow-up instant: overdue / today / in N days, coloured by urgency. */
export function FollowUpDue({ at, className = "" }: { at: string; className?: string }) {
  const d = daysUntil(dubaiDateOnly(new Date(at)), new Date());
  const tone = d < 0 ? "text-destructive" : d === 0 ? "text-amber-700" : "text-muted-foreground";
  const label = d < 0 ? `${-d} day${d === -1 ? "" : "s"} overdue` : d === 0 ? `today ${formatTime(at)}` : d === 1 ? `tomorrow ${formatTime(at)}` : formatDateTime(at);
  return (
    <span suppressHydrationWarning className={`${tone} ${className}`} title={formatDateTime(at)}>
      {label}
    </span>
  );
}

/** Minutes since `at`; computed here because Server Components have no clock. */
function minutesAgo(at: string) {
  return Math.round((Date.now() - new Date(at).getTime()) / 60_000);
}

/** "3h ago" style, falling back to the full date after a week. */
export function TimeAgo({ at, className = "" }: { at: string; className?: string }) {
  const m = minutesAgo(at);
  const label = m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 24 * 60 ? `${Math.round(m / 60)}h ago` : m < 7 * 24 * 60 ? `${Math.round(m / (24 * 60))}d ago` : formatDateTime(at);
  return (
    <span suppressHydrationWarning className={className} title={formatDateTime(at)}>
      {label}
    </span>
  );
}
