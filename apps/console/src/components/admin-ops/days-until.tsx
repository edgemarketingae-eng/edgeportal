"use client";

import { daysUntil } from "@edge/domain/dates";

/** Whole days from today (Dubai) until a YYYY-MM-DD date. Computed here because Server Components have no clock. */
function days(date: string) {
  return daysUntil(new Date(`${date}T00:00:00.000Z`), new Date());
}

/** "(12 days)" after a due date. */
export function DaysLeft({ date }: { date: string }) {
  return <span suppressHydrationWarning>({days(date)} days)</span>;
}

/** "in 3 days" / "due today" / "2 days overdue", coloured by urgency. */
export function DueIn({ date }: { date: string }) {
  const d = days(date);
  return (
    <span
      suppressHydrationWarning
      className={`block text-xs ${d < 0 ? "text-destructive" : d <= 3 ? "text-amber-700" : "text-muted-foreground"}`}
    >
      {d < 0 ? `${-d} days overdue` : d === 0 ? "due today" : `in ${d} days`}
    </span>
  );
}
