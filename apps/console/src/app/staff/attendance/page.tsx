import { hrRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { formatDays } from "@edge/domain/hr/leave";
import { EmptyState } from "@edge/ui/blocks/empty-state";
import { StatCard } from "@edge/ui/blocks/stat-card";
import { AttendanceBadge } from "@edge/ui/blocks/status-badges";
import { Badge } from "@edge/ui/components/badge";
import { Card } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { CalendarCheck } from "lucide-react";
import type { Metadata } from "next";
import { MonthNav, NotSetUp } from "@/components/hr/shared";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "My attendance" };

export default async function MyAttendancePage(props: PageProps<"/staff/attendance">) {
  await requireStaff();
  const sp = await props.searchParams;
  const month = typeof sp.month === "string" ? sp.month : undefined;
  const a = await load(() => api(hrRoutes.myAttendance, { query: { month } }));
  return (
    <>
      <PageHeader
        help="/staff/docs/attendance"
        title="My attendance"
        description="Marked by HR."
        actions={<MonthNav month={a.month} basePath="/staff/attendance" />}
      />
      {!a.setUp ? <NotSetUp /> : null}
      {a.setUp ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard label="Present" value={a.summary.present} />
            <StatCard label="Late" value={a.summary.late} />
            <StatCard label="Half days" value={a.summary.halfDay} />
            <StatCard label="Absent" value={a.summary.absent} />
            <StatCard
              label="On leave"
              value={a.summary.leave}
              hint={a.summary.unpaidLeaveCenti ? `${formatDays(a.summary.unpaidLeaveCenti)} unpaid` : undefined}
            />
          </div>
          <Card className="p-0">
            {a.days.length === 0 ? (
              <EmptyState icon={<CalendarCheck />} title="Nothing to show for this month." />
            ) : (
              <ul className="divide-y">
                {a.days.map((d) => (
                  <li key={d.day} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span>
                      {formatDate(d.day)}
                      {d.note ? <span className="text-muted-foreground block text-xs">{d.note}</span> : null}
                    </span>
                    {d.status ? (
                      <AttendanceBadge status={d.status} />
                    ) : d.off ? (
                      <Badge variant="outline">{d.off === "HOLIDAY" ? (d.holidayName ?? "Holiday") : "Weekly off"}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">Not marked</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </>
  );
}
