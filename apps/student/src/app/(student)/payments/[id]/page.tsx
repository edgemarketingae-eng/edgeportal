import { paymentRoutes } from "@edge/contracts";
import { formatDateTime } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { AutoRefresh } from "@edge/ui/blocks/auto-refresh";
import { GATEWAY_LABELS, KIND_LABELS, PaymentStatusBadge } from "@edge/ui/blocks/payment-status-badge";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { load, requireStudent } from "@/lib/load";

export const metadata: Metadata = { title: "Payment" };

export default async function PaymentPage(props: PageProps<"/payments/[id]">) {
  const { id } = await props.params;
  await requireStudent();
  const p = await load(() => api(paymentRoutes.studentPayment, { params: { id } }));
  const waiting = ["CREATED", "PENDING", "AUTHORIZED"].includes(p.status);
  const ok = p.status === "SUCCEEDED";
  const pendingApproval = ok && p.enrollmentStatus === "PENDING_APPROVAL";

  return (
    <>
      {waiting ? <AutoRefresh /> : null}
      <PageHeader title="Payment" description={`${KIND_LABELS[p.kind]} · ${p.batchName}`} />
      <Card className="max-w-2xl">
        <CardContent className="grid gap-6 pt-6">
          <div className="flex items-start gap-3">
            {ok ? <CheckCircle2 className="text-edge-emerald size-8" /> : waiting ? <Clock className="size-8 text-amber-600" /> : <XCircle className="text-destructive size-8" />}
            <div>
              <p className="text-lg font-semibold">{ok ? "Payment successful" : waiting ? "Confirming your payment…" : p.status === "FAILED" ? "Payment failed" : "Payment not completed"}</p>
              <p className="text-muted-foreground text-sm">
                {ok
                  ? pendingApproval
                    ? "Thank you! Our team is verifying your registration and will activate your access shortly."
                    : "Thank you! A receipt has been emailed to you."
                  : waiting
                    ? "This page updates automatically. It can take a few seconds."
                    : (p.failureReason ?? "No money was taken. You can try again with any method.")}
              </p>
            </div>
          </div>
          <dl className="bg-muted/50 grid gap-2 rounded-lg p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <PaymentStatusBadge status={p.status} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Method</dt>
              <dd>{GATEWAY_LABELS[p.gateway]}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Course amount</dt>
              <dd>{formatMoney(p.courseMinor, p.currency)}</dd>
            </div>
            {p.courseVatMinor ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">VAT (5%)</dt>
                <dd>{formatMoney(p.courseVatMinor, p.currency)}</dd>
              </div>
            ) : null}
            {p.processingFeeMinor + p.processingFeeVatMinor ? (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Payment processing fee</dt>
                <dd>{formatMoney(p.processingFeeMinor + p.processingFeeVatMinor, p.currency)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t pt-2 font-bold">
              <dt>Total</dt>
              <dd>{formatMoney(p.totalMinor, p.currency)}</dd>
            </div>
            <div className="text-muted-foreground flex justify-between text-xs">
              <dt>Reference</dt>
              <dd className="font-mono">{p.id}</dd>
            </div>
            {p.succeededAt ? (
              <div className="text-muted-foreground flex justify-between text-xs">
                <dt>Paid on</dt>
                <dd>{formatDateTime(p.succeededAt)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="flex flex-wrap gap-2">
            {p.odoo.invoiceUrl ? (
              <Button asChild variant="outline">
                <a href={p.odoo.invoiceUrl} target="_blank" rel="noreferrer">
                  Download invoice
                </a>
              </Button>
            ) : null}
            {!ok && !waiting ? (
              <Button asChild>
                <Link href={p.kind === "BALANCE" ? "/checkout/balance" : "/checkout"}>Try again</Link>
              </Button>
            ) : null}
            <Button asChild variant="ghost">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
