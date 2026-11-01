import { hrRoutes } from "@edge/contracts";
import { formatMonth } from "@edge/domain/hr/calendar";
import { TableEmpty } from "@edge/ui/blocks/empty-state";
import { PayAmount } from "@edge/ui/blocks/pay-amount";
import { Card } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "My salary" };

export default async function MySalaryPage() {
  await requireStaff();
  const rows = await load(() => api(hrRoutes.myPayslips));
  return (
    <>
      <PageHeader help="/staff/docs/salary" title="My salary" description="Your payslip appears here once HR closes the month." />
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? <TableEmpty colSpan={2} icon={<Wallet />} title="No payslips yet." /> : null}
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link href={`/staff/salary/${s.month}`} className="text-edge-emerald font-semibold hover:underline">
                    {formatMonth(s.month)}
                  </Link>
                </TableCell>
                <TableCell>
                  <PayAmount totals={s.totals} lines={s.lines} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
