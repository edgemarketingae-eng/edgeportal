import { classRoutes } from "@edge/contracts";
import { formatDate, formatDateTime } from "@edge/domain/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Staff portal" };

export default async function StaffHome() {
  const v = await requireStaff("staff.access");
  const { scopeAll, batches, upcoming } = await load(() => api(classRoutes.staffOverview));
  return (
    <>
      <PageHeader help="/staff/docs/dashboard" title={`Hello, ${v.user.name.split(" ")[0]}`} description={v.staff.title ?? undefined} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{scopeAll ? "Running batches" : "My batches"}</CardTitle>
          </CardHeader>
          <CardContent>
            {batches.length === 0 ? (
              <p className="text-muted-foreground text-sm">No active batches assigned to you.</p>
            ) : (
              <ul className="divide-y text-sm">
                {batches.map((b) => (
                  <li key={b.id} className="flex justify-between py-2">
                    <span>
                      <span className="font-medium">{b.name}</span>
                      <span className="text-muted-foreground block text-xs">Starts {formatDate(b.startDate)}</span>
                    </span>
                    <span className="text-muted-foreground">{b.activeStudents} active</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Next classes</CardTitle>
            <CardDescription>
              <Link href="/staff/classes" className="text-edge-emerald hover:underline">
                Schedule or edit classes
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing scheduled.</p>
            ) : (
              <ul className="divide-y text-sm">
                {upcoming.map((s) => (
                  <li key={s.id} className="flex justify-between gap-3 py-2">
                    <span>
                      <span className="font-medium">{s.title}</span>
                      <span className="text-muted-foreground block text-xs">{s.batchName}</span>
                    </span>
                    <span className="text-muted-foreground text-right">{formatDateTime(s.startsAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
