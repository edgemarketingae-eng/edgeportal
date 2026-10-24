import { adminRoutes } from "@edge/contracts";
import { formatDateTime } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { StatCard } from "@edge/ui/blocks/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Admin overview" };

export default async function AdminHome() {
  await requireStaff("admin.access");
  const d = await load(() => api(adminRoutes.dashboard));
  const count = (s: string) => d.byStatus[s] ?? 0;

  return (
    <>
      <PageHeader help="/admin/docs/overview" title="Overview" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Needs approval"
          value={count("PENDING_APPROVAL")}
          href="/admin/approvals"
          tone={count("PENDING_APPROVAL") ? "warn" : undefined}
          hint="Paid, waiting for verification"
        />
        <StatCard label="Active students" value={count("ACTIVE")} href="/admin/students?status=ACTIVE" />
        <StatCard
          label="Balance due in 7 days"
          value={d.balanceDueSoon}
          href="/admin/balances"
          tone={d.balanceDueSoon ? "warn" : undefined}
        />
        <StatCard
          label="Locked"
          value={count("LOCKED")}
          href="/admin/students?status=LOCKED"
          tone={count("LOCKED") ? "danger" : undefined}
        />
        <StatCard
          label="Collected today"
          value={formatMoney(d.collectedToday.totalMinor)}
          hint={`${d.collectedToday.count} payments`}
          href="/admin/payments"
        />
        <StatCard
          label="Collected this month"
          value={formatMoney(d.collectedMonth.totalMinor)}
          hint={`${d.collectedMonth.count} payments`}
          href="/admin/payments"
        />
        <StatCard
          label="Awaiting payment"
          value={count("PENDING_PAYMENT")}
          href="/admin/students?status=PENDING_PAYMENT"
          hint="Signed up, not paid yet"
        />
        <StatCard
          label="Odoo sync failures"
          value={d.odooFailures}
          href="/admin/payments?odoo=FAILED"
          tone={d.odooFailures ? "danger" : undefined}
        />
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Upcoming live classes</CardTitle>
        </CardHeader>
        <CardContent>
          {d.upcomingClasses.length === 0 ? (
            <p className="text-muted-foreground text-sm">No classes scheduled.</p>
          ) : (
            <ul className="divide-y text-sm">
              {d.upcomingClasses.map((s) => (
                <li key={s.id} className="flex justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">{s.title}</span> <span className="text-muted-foreground">· {s.batchName}</span>
                  </span>
                  <span className="text-muted-foreground">{formatDateTime(s.startsAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/admin/classes" className="text-edge-emerald mt-3 inline-block text-sm font-semibold hover:underline">
            Manage classes
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
