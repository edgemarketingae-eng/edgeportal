import { paymentRoutes } from "@edge/contracts";
import { formatDateTime } from "@edge/domain/dates";
import { GATEWAYS, PAYMENT_STATUSES, SYNC_STATUSES } from "@edge/domain/enums";
import { formatMoney } from "@edge/domain/money";
import { FilterBar, FilterResults, FilterScope, FilterSelect } from "@edge/ui/blocks/filter-bar";
import { GATEWAY_LABELS, KIND_LABELS, PaymentStatusBadge } from "@edge/ui/blocks/payment-status-badge";
import { SyncBadge } from "@edge/ui/blocks/status-badges";
import { Card } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { Pagination } from "@edge/ui/blocks/pagination";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Payments" };

export default async function AdminPaymentsPage(props: PageProps<"/admin/payments">) {
  await requireStaff("payment.read");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? sp[k] : undefined);
  // Ignore unknown enum values instead of letting the API reject the whole request.
  const pick = <T extends string>(k: string, allowed: readonly T[]) => allowed.find((a) => a === one(k));
  const f = {
    q: one("q"),
    status: pick("status", PAYMENT_STATUSES),
    gateway: pick("gateway", GATEWAYS),
    odoo: pick("odoo", SYNC_STATUSES),
    page: Number(one("page")) || 1,
    pageSize: Number(one("pageSize")) || 50,
  };
  const { rows, summary, total, page, pageSize } = await load(() => api(paymentRoutes.adminPayments, { query: f }));
  return (
    <FilterScope>
      <PageHeader
        help="/admin/docs/payments"
        title="Payments"
        description={`Succeeded across all matching payments: ${formatMoney(summary.totalMinor)} · VAT on courses ${formatMoney(summary.courseVatMinor)} · processing fees ${formatMoney(summary.feesMinor)}`}
      />
      <FilterBar q={f.q} placeholder="Name, email, reference…">
        <FilterSelect
          name="status"
          label="Status"
          value={f.status}
          options={[
            ["SUCCEEDED", "Paid"],
            ["PENDING", "Pending"],
            ["FAILED", "Failed"],
            ["CANCELLED", "Cancelled"],
            ["EXPIRED", "Expired"],
          ]}
        />
        <FilterSelect
          name="gateway"
          label="Method"
          value={f.gateway}
          options={Object.entries(GATEWAY_LABELS).filter(([k]) => k !== "MOCK")}
        />
        <FilterSelect
          name="odoo"
          label="Odoo"
          value={f.odoo}
          options={[
            ["PENDING", "Pending"],
            ["SYNCED", "Synced"],
            ["FAILED", "Failed"],
          ]}
        />
      </FilterBar>
      <FilterResults>
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Student</TableHead>
                <TableHead className="hidden md:table-cell">Type</TableHead>
                <TableHead className="hidden md:table-cell">Method</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Odoo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground py-10 text-center">
                    No payments match.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/admin/payments/${p.id}`} className="text-edge-emerald hover:underline">
                        {formatDateTime(p.succeededAt ?? p.createdAt)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/admin/students/${p.studentId}`} className="hover:underline">
                        {p.studentName}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{KIND_LABELS[p.kind]}</TableCell>
                    <TableCell className="hidden md:table-cell">{GATEWAY_LABELS[p.gateway]}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatMoney(p.totalMinor, p.currency)}</TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {p.status === "SUCCEEDED" ? <SyncBadge status={p.odoo.status} /> : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
        <Pagination page={page} pageSize={pageSize} total={total} noun="payments" />
      </FilterResults>
    </FilterScope>
  );
}
