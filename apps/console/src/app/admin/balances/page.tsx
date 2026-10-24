import { adminRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { EnrollmentBadge } from "@edge/ui/blocks/status-badges";
import { Button } from "@edge/ui/components/button";
import { Card } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { Pagination } from "@edge/ui/blocks/pagination";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DueIn } from "@/components/admin-ops/days-until";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Advance & balances" };

export default async function BalancesPage(props: PageProps<"/admin/balances">) {
  await requireStaff("enrollment.read");
  const sp = await props.searchParams;
  const data = await load(() => api(adminRoutes.balances, { query: { page: Number(sp.page) || 1, pageSize: Number(sp.pageSize) || 50 } }));
  const rows = data.rows;
  return (
    <>
      <PageHeader
        help="/admin/docs/balances"
        title="Advance & balances"
        description="Students who paid an advance, soonest due first. Access locks automatically when the due day ends."
        actions={
          <Button asChild variant="outline" size="sm">
            <a href="/admin/students/export?payment=PARTIALLY_PAID" download>
              <Download /> Export CSV
            </a>
          </Button>
        }
      />
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-10 text-center">
                  No outstanding balances.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((e) => (
                <TableRow key={e.enrollmentId}>
                  <TableCell>
                    <Link href={`/admin/students/${e.studentId}`} className="text-edge-emerald font-semibold hover:underline">
                      {e.name}
                    </Link>
                    <div className="text-muted-foreground text-xs">{e.phoneNumber}</div>
                  </TableCell>
                  <TableCell>{e.batchName}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(e.paidCourseMinor, e.currency)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatMoney(e.remainingMinor, e.currency)}</TableCell>
                  <TableCell>
                    {e.balanceDueOn ? formatDate(e.balanceDueOn) : "-"}
                    {e.balanceDueOn ? <DueIn date={e.balanceDueOn} /> : null}
                  </TableCell>
                  <TableCell>
                    <EnrollmentBadge status={e.status} lockReason={e.lockReason} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="students" />
    </>
  );
}
