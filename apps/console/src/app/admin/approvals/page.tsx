import { adminRoutes } from "@edge/contracts";
import { formatDateTime } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { ActionButton } from "@edge/ui/blocks/action-dialog";
import { GATEWAY_LABELS } from "@edge/ui/blocks/payment-status-badge";
import { PaymentStateBadge } from "@edge/ui/blocks/status-badges";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent } from "@edge/ui/components/card";
import { Pagination } from "@edge/ui/blocks/pagination";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { approveAction } from "@/app/admin/enrollment-actions";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage(props: PageProps<"/admin/approvals">) {
  await requireStaff("enrollment.approve");
  const sp = await props.searchParams;
  const data = await load(() => api(adminRoutes.approvals, { query: { page: Number(sp.page) || 1, pageSize: Number(sp.pageSize) || 50 } }));
  const rows = data.rows;
  return (
    <>
      <PageHeader
        help="/admin/docs/approvals"
        title="Approvals"
        description="Students who have paid and are waiting for verification. Oldest first."
      />
      {rows.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center">Nothing to approve. Nice work.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((e) => (
            <Card key={e.enrollmentId}>
              <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center">
                <div className="flex-1">
                  <Link href={`/admin/students/${e.studentId}`} className="text-edge-emerald font-semibold hover:underline">
                    {e.name}
                  </Link>
                  <p className="text-muted-foreground text-sm">
                    {e.email} · {e.phoneNumber ?? "no mobile"} · {e.country}
                    {e.jetaFxClientId ? ` · Jeta FX ${e.jetaFxClientId}` : ""}
                  </p>
                  <p className="mt-1 text-sm">
                    {e.batchName} · <PaymentStateBadge state={e.paymentState} />
                  </p>
                  <ul className="text-muted-foreground mt-2 text-xs">
                    {e.payments.map((p) => (
                      <li key={p.id}>
                        {p.succeededAt ? formatDateTime(p.succeededAt) : "-"} · {GATEWAY_LABELS[p.gateway] ?? p.gateway} ·{" "}
                        {formatMoney(p.totalMinor, p.currency)} (course {formatMoney(p.courseMinor, p.currency)}) · ref {p.reference}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex gap-2">
                  <ActionButton action={approveAction} hidden={{ enrollmentId: e.enrollmentId }} size="default">
                    Approve
                  </ActionButton>
                  <Button asChild variant="outline">
                    <Link href={`/admin/students/${e.studentId}`}>Review</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="approvals" />
    </>
  );
}
