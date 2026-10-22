import { paymentRoutes } from "@edge/contracts";
import { formatDateTime } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { ActionButton } from "@edge/ui/blocks/action-dialog";
import { GATEWAY_LABELS, KIND_LABELS, PaymentStatusBadge } from "@edge/ui/blocks/payment-status-badge";
import { SyncBadge } from "@edge/ui/blocks/status-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { recheckPaymentAction, retryOdooAction } from "@/app/admin/payments/actions";
import { can, load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Payment" };

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}

export default async function AdminPaymentPage(props: PageProps<"/admin/payments/[id]">) {
  const v = await requireStaff("payment.read");
  const { id } = await props.params;
  const p = await load(() => api(paymentRoutes.adminPayment, { params: { id } }));
  const c = p.currency;
  return (
    <>
      <PageHeader
        title={`${formatMoney(p.totalMinor, c)} · ${KIND_LABELS[p.kind]}`}
        description={
          <>
            <Link href={`/admin/students/${p.studentId}`} className="text-edge-emerald hover:underline">
              {p.studentName}
            </Link>{" "}
            · {p.batchName}
          </>
        }
        actions={
          <>
            {p.status !== "SUCCEEDED" && p.gateway !== "MANUAL" ? (
              <ActionButton action={recheckPaymentAction} hidden={{ paymentId: p.id }} variant="outline">
                Re-check with gateway
              </ActionButton>
            ) : null}
            {p.status === "SUCCEEDED" && p.odoo.status !== "SYNCED" && can(v, "odoo.retry") ? (
              <ActionButton action={retryOdooAction} hidden={{ paymentId: p.id }} variant="outline">
                Retry Odoo sync
              </ActionButton>
            ) : null}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y text-sm">
              <Row k="Status" v={<PaymentStatusBadge status={p.status} />} />
              <Row k="Method" v={`${GATEWAY_LABELS[p.gateway]} (${p.feeRateKey})`} />
              <Row k="Billing country / VAT" v={`${p.billingCountry} · ${p.vatTreatment === "STANDARD" ? "5% VAT" : "zero-rated"}`} />
              <Row k="Course" v={formatMoney(p.courseMinor, c)} />
              <Row k="VAT on course" v={formatMoney(p.courseVatMinor, c)} />
              <Row k="Processing fee" v={formatMoney(p.processingFeeMinor, c)} />
              <Row k="VAT on processing fee" v={formatMoney(p.processingFeeVatMinor, c)} />
              <Row k="Total charged" v={<b>{formatMoney(p.totalMinor, c)}</b>} />
              <Row k="Created" v={formatDateTime(p.createdAt)} />
              {p.succeededAt ? <Row k="Paid" v={formatDateTime(p.succeededAt)} /> : null}
              {p.failureReason ? <Row k="Failure" v={p.failureReason} /> : null}
              <Row k="Our reference" v={<span className="font-mono text-xs">{p.id}</span>} />
              {p.externalSessionId ? (
                <Row k="Gateway session" v={<span className="font-mono text-xs">{p.externalSessionId}</span>} />
              ) : null}
              {p.externalPaymentId ? (
                <Row k="Gateway payment" v={<span className="font-mono text-xs">{p.externalPaymentId}</span>} />
              ) : null}
              {p.manualReference ? <Row k="Manual reference" v={p.manualReference} /> : null}
              {p.notes ? <Row k="Notes" v={p.notes} /> : null}
            </dl>
          </CardContent>
        </Card>
        <div className="grid h-fit gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Odoo {p.status === "SUCCEEDED" ? <SyncBadge status={p.odoo.status} /> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {p.odoo.invoiceName ? <p>Invoice {p.odoo.invoiceName}</p> : <p className="text-muted-foreground">No invoice yet.</p>}
              {p.odoo.lastError ? <p className="bg-destructive/10 text-destructive rounded p-2 text-xs">{p.odoo.lastError}</p> : null}
              {p.odooLogs.length ? (
                <ul className="text-muted-foreground text-xs">
                  {p.odooLogs.map((l) => (
                    <li key={l.id}>
                      {formatDateTime(l.createdAt)} · {l.step} · {l.ok ? "ok" : `failed: ${l.error?.slice(0, 120)}`}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Gateway events</CardTitle>
            </CardHeader>
            <CardContent>
              {p.events.length === 0 ? (
                <p className="text-muted-foreground text-sm">No webhooks received.</p>
              ) : (
                <ul className="grid gap-1 text-xs">
                  {p.events.map((ev) => (
                    <li key={ev.id} className="flex justify-between gap-2">
                      <span className="font-mono">{ev.type}</span>
                      <span className="text-muted-foreground">
                        {formatDateTime(ev.receivedAt)} {ev.error ? "· error" : ev.processedAt ? "· processed" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
