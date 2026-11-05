import { classRoutes, hrRoutes } from "@edge/contracts";
import { formatDate, formatDateTime } from "@edge/domain/dates";
import { formatMonth } from "@edge/domain/hr/calendar";
import { formatDays } from "@edge/domain/hr/leave";
import { InstallAppHint } from "@edge/ui/blocks/install-app";
import { PayAmount } from "@edge/ui/blocks/pay-amount";
import { StatCard } from "@edge/ui/blocks/stat-card";
import { Alert, AlertDescription } from "@edge/ui/components/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { NotSetUp } from "@/components/hr/shared";
import { can, load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Staff portal" };

export default async function StaffHome(props: PageProps<"/staff">) {
  const v = await requireStaff();
  const { error } = await props.searchParams;
  return (
    <>
      {error === "forbidden" ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>You don&apos;t have access to that page.</AlertDescription>
        </Alert>
      ) : null}
      <PageHeader help="/staff/docs/dashboard" title={`Hello, ${v.user.name.split(" ")[0]}`} description={v.staff.title ?? undefined} />
      <InstallAppHint appName="Edge Console" className="mb-6" />
      <HrOverview />
      {can(v, "staff.access") ? <TeachingOverview /> : null}
    </>
  );
}

/** The person's own leave and latest pay, and what's waiting for HR if they're the one who acts on it. */
async function HrOverview() {
  const h = await load(() => api(hrRoutes.home));
  const q = h.queue;
  return (
    <div className="mb-6 grid gap-4">
      {!h.setUp ? <NotSetUp /> : null}
      {!h.workUpdateToday ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Today's work update"
            value="Not written"
            hint="Add a few points on what you worked on"
            href="/staff/updates"
            tone="warn"
          />
        </div>
      ) : null}
      {q ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Leave to approve" value={q.leave} href="/staff/hr/leave?status=PENDING" tone={q.leave ? "warn" : undefined} />
          <StatCard label="Open HR requests" value={q.requests} href="/staff/hr/requests" tone={q.requests ? "warn" : undefined} />
          <StatCard
            label="Advances to approve"
            value={q.advances}
            href="/staff/hr/advances?status=PENDING"
            tone={q.advances ? "warn" : undefined}
          />
          <StatCard label="Records to set up" value={q.notSetUp} href="/staff/hr/team" tone={q.notSetUp ? "warn" : undefined} />
        </div>
      ) : null}
      {h.setUp ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {h.balances
            .filter((b) => b.tracksBalance)
            .slice(0, 2)
            .map((b) => (
              <StatCard key={b.typeKey} label={b.name} value={formatDays(b.balanceCenti)} href="/staff/leave" />
            ))}
          <StatCard
            label="Latest payslip"
            value={h.latestPayslip ? <PayAmount totals={h.latestPayslip.totals} lines={h.latestPayslip.lines} /> : "None yet"}
            hint={h.latestPayslip ? formatMonth(h.latestPayslip.month) : undefined}
          />
          <StatCard
            label="Pending with HR"
            value={h.pendingLeave + h.openRequests}
            hint={h.repayingAdvances ? "Repaying an advance" : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Batches and next classes, for people who teach. */
async function TeachingOverview() {
  const { scopeAll, batches, upcoming } = await load(() => api(classRoutes.staffOverview));
  return (
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
  );
}
