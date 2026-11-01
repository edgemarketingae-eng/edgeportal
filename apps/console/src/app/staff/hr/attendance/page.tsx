import { hrRoutes } from "@edge/contracts";
import { ATTENDANCE_LABELS } from "@edge/domain/hr/labels";
import { EmptyState } from "@edge/ui/blocks/empty-state";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { UserCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AttendanceDayForm } from "@/components/hr/attendance-form";
import { MonthNav } from "@/components/hr/shared";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Mark attendance" };

const LETTER: Record<string, string> = { PRESENT: "P", ABSENT: "A", HALF_DAY: "H", LATE: "L", LEAVE: "V" };

export default async function MarkAttendancePage(props: PageProps<"/staff/hr/attendance">) {
  await requireStaff("hr.manage");
  const sp = await props.searchParams;
  const view = sp.view === "month" ? "month" : "day";
  return (
    <>
      <PageHeader
        help="/staff/docs/hr-attendance"
        title="Mark attendance"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={view === "day" ? "/staff/hr/attendance?view=month" : "/staff/hr/attendance"}>
              {view === "day" ? "Month view" : "Mark a day"}
            </Link>
          </Button>
        }
      />
      {view === "day" ? (
        <DayView day={typeof sp.day === "string" ? sp.day : undefined} />
      ) : (
        <MonthView month={typeof sp.month === "string" ? sp.month : undefined} />
      )}
    </>
  );
}

async function DayView({ day }: { day?: string }) {
  const sheet = await load(() => api(hrRoutes.attendanceDay, { query: { day } }));
  if (!sheet.rows.length)
    return (
      <Card>
        <EmptyState icon={<UserCheck />} title="Nobody to mark on this day.">
          Set people up on the Team page first.
        </EmptyState>
      </Card>
    );
  return <AttendanceDayForm key={sheet.day + JSON.stringify(sheet.rows.map((r) => r.status))} sheet={sheet} />;
}

async function MonthView({ month }: { month?: string }) {
  const m = await load(() => api(hrRoutes.attendanceMonth, { query: { month } }));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={m.month} basePath="/staff/hr/attendance" extra="view=month" />
        <p className="text-muted-foreground text-xs">
          {Object.entries(LETTER)
            .map(([k, v]) => `${v} ${ATTENDANCE_LABELS[k as keyof typeof ATTENDANCE_LABELS]}`)
            .join(", ")}
          , dot: day off
        </p>
      </div>
      <Card className="p-0">
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="bg-card sticky left-0">Name</TableHead>
                {m.days.map((d) => (
                  <TableHead key={d} className="px-1 text-center">
                    {Number(d.slice(8))}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {m.people.map((p) => (
                <TableRow key={p.employeeId}>
                  <TableCell className="bg-card sticky left-0 font-medium">{p.name}</TableCell>
                  {m.days.map((d) => {
                    const mark = p.marks[d];
                    return (
                      <TableCell key={d} className="px-1 text-center" title={mark?.note ?? mark?.holidayName ?? undefined}>
                        {mark?.status ? LETTER[mark.status] : mark?.off ? <span className="text-muted-foreground">·</span> : null}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
