import { hrRoutes } from "@edge/contracts";
import { formatMonth } from "@edge/domain/hr/calendar";
import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { TableEmpty } from "@edge/ui/blocks/empty-state";
import { Badge } from "@edge/ui/components/badge";
import { Button } from "@edge/ui/components/button";
import { Card } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { Field } from "@edge/ui/forms/field";
import { tone } from "@edge/ui/lib/tones";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { Banknote } from "lucide-react";
import { formatPayTotal } from "@edge/domain/hr/pay";
import type { Metadata } from "next";
import Link from "next/link";
import { startMonthAction } from "@/lib/actions/hr";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Salary months" };

export default async function SalaryMonthsPage() {
  await requireStaff("hr.payroll");
  const d = await load(() => api(hrRoutes.payrollMonths));
  return (
    <>
      <PageHeader
        help="/staff/docs/hr-salary"
        title="Salary months"
        description="Months run in order, one at a time. A closed month is final."
        actions={
          d.next ? (
            <ActionDialog
              action={startMonthAction}
              hidden={d.firstRun ? {} : { month: d.next }}
              title={d.firstRun ? "Start the first salary month" : `Start ${formatMonth(d.next)}?`}
              description={
                d.firstRun
                  ? "Salaries begin here. Earlier months are never paid through this page."
                  : "This builds a draft for everyone. Staff see nothing until you close it."
              }
              submitLabel="Start"
              trigger={<Button size="sm">Start {d.firstRun ? "first month" : formatMonth(d.next)}</Button>}
            >
              {d.firstRun ? <Field label="Month (YYYY-MM)" name="month" defaultValue={d.next} required pattern="\d{4}-\d{2}" /> : null}
            </ActionDialog>
          ) : null
        }
      />
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead>People</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {d.rows.length === 0 ? <TableEmpty colSpan={4} icon={<Banknote />} title="No salary months yet." /> : null}
            {d.rows.map((m) => (
              <TableRow key={m.month}>
                <TableCell>
                  <Link href={`/staff/hr/salary/${m.month}`} className="text-edge-emerald font-semibold hover:underline">
                    {formatMonth(m.month)}
                  </Link>
                </TableCell>
                <TableCell>{m.people}</TableCell>
                <TableCell className="tabular-nums">{formatPayTotal(m.totals)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={m.status === "DRAFT" ? tone.warning : tone.success}>
                    {m.status === "DRAFT" ? "Draft" : "Closed"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
