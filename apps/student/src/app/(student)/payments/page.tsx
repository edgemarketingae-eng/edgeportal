import { paymentRoutes } from "@edge/contracts";
import { formatDateTime } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { GATEWAY_LABELS, KIND_LABELS, PaymentStatusBadge } from "@edge/ui/blocks/payment-status-badge";
import { Card } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { load, requireStudent } from "@/lib/load";

export const metadata: Metadata = { title: "Payments" };

export default async function PaymentsPage() {
  await requireStudent();
  const payments = await load(() => api(paymentRoutes.studentPayments));
  return (
    <>
      <PageHeader help="/docs/paying" title="Payments" description="Your payment history and receipts." />
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden sm:table-cell">Method</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-10 text-center">
                  No payments yet.
                </TableCell>
              </TableRow>
            ) : (
              payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/payments/${p.id}`} className="text-edge-emerald font-medium hover:underline">
                      {formatDateTime(p.succeededAt ?? p.createdAt)}
                    </Link>
                  </TableCell>
                  <TableCell>{KIND_LABELS[p.kind]}</TableCell>
                  <TableCell className="hidden sm:table-cell">{GATEWAY_LABELS[p.gateway]}</TableCell>
                  <TableCell className="text-right font-semibold">{formatMoney(p.totalMinor, p.currency)}</TableCell>
                  <TableCell>
                    <PaymentStatusBadge status={p.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
