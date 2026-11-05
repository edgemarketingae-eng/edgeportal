import { hrRoutes } from "@edge/contracts";
import { formatDate, formatDateTime } from "@edge/domain/dates";
import { EmptyState } from "@edge/ui/blocks/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { ListChecks } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DayNav, Points, WorkUpdateForm } from "@/components/hr/work-update-form";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Work updates" };

export default async function MyWorkUpdatesPage(props: PageProps<"/staff/updates">) {
  await requireStaff();
  const sp = await props.searchParams;
  const day = typeof sp.day === "string" ? sp.day : undefined;
  const data = await load(() => api(hrRoutes.myUpdates, { query: { day } }));
  const isToday = data.day === data.today;
  const recent = data.recent.filter((r) => r.day !== data.day);
  return (
    <>
      <PageHeader
        help="/staff/docs/work-updates"
        title="Work updates"
        description="A few short points on what you worked on each day. HR can read them."
        actions={<DayNav day={data.day} min={data.earliest} max={data.today} basePath="/staff/updates" />}
      />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{isToday ? "Today" : formatDate(data.day)}</CardTitle>
          <CardDescription>
            {data.updatedAt
              ? `Saved ${formatDateTime(data.updatedAt)}`
              : isToday
                ? "Nothing saved yet today."
                : "Nothing saved for this day."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WorkUpdateForm key={`${data.day}:${data.updatedAt ?? ""}`} data={data} />
        </CardContent>
      </Card>
      <h2 className="mb-3 text-sm font-semibold">Recent days</h2>
      {recent.length === 0 ? (
        <Card>
          <EmptyState icon={<ListChecks />} title="No other days yet." />
        </Card>
      ) : (
        <div className="grid gap-3">
          {recent.map((r) => (
            <Card key={r.day}>
              <CardContent className="grid gap-2">
                <Link href={`/staff/updates?day=${r.day}`} className="text-sm font-semibold hover:underline">
                  {formatDate(r.day)}
                </Link>
                <Points items={r.items} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
