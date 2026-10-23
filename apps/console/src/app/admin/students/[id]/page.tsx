import { adminRoutes, paymentRoutes } from "@edge/contracts";
import { LEAD_SOURCE_LABELS } from "@edge/domain/crm/labels";
import { formatDate, formatDateTime } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { GATEWAY_LABELS, KIND_LABELS, PaymentStatusBadge } from "@edge/ui/blocks/payment-status-badge";
import { EnrollmentBadge, PaymentStateBadge, SyncBadge } from "@edge/ui/blocks/status-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { DaysLeft } from "@/components/admin-ops/days-until";
import { EnrollmentControls } from "@/components/admin-ops/enrollment-controls";
import { can, load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Student" };

const EVENT_LABELS: Record<string, string> = {
  CREATED: "Enrolled",
  PAYMENT_SUCCEEDED: "Payment received",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  LOCKED: "Locked",
  UNLOCKED: "Unlocked",
  DUE_CHANGED: "Due date changed",
  BATCH_CHANGED: "Batch changed",
};

export default async function StudentDetailPage(props: PageProps<"/admin/students/[id]">) {
  const v = await requireStaff("student.read");
  const { id } = await props.params;
  const canSeePayments = can(v, "payment.read");
  const [{ student: s, enrollment: e, events, batches, lead }, payments] = await Promise.all([
    load(() => api(adminRoutes.student, { params: { id } })),
    canSeePayments ? load(() => api(paymentRoutes.adminStudentPayments, { params: { id } })) : null,
  ]);

  return (
    <>
      <PageHeader
        title={s.name}
        description={
          <>
            {s.email} · {s.phoneNumber ?? `${s.pendingPhone ?? "no mobile"} (unverified)`} · {s.country}
          </>
        }
        actions={
          <EnrollmentControls
            studentId={s.id}
            enrollment={
              e ? { id: e.id, status: e.status, paymentState: e.paymentState, balanceDueOn: e.balanceDueOn, batchId: e.batchId } : null
            }
            batches={batches}
            can={{
              approve: can(v, "enrollment.approve"),
              lock: can(v, "enrollment.lock"),
              editTerms: can(v, "enrollment.editTerms"),
              assignBatch: can(v, "enrollment.assignBatch"),
              recordManual: can(v, "payment.recordManual"),
            }}
          />
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Enrollment</CardTitle>
          </CardHeader>
          <CardContent>
            {e ? (
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Batch</dt>
                  <dd className="font-semibold">{e.batchName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    <EnrollmentBadge status={e.status} lockReason={e.lockReason} /> <PaymentStateBadge state={e.paymentState} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Course fee (ex VAT)</dt>
                  <dd className="font-semibold">{formatMoney(e.feeMinor, e.currency)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Paid / remaining</dt>
                  <dd className="font-semibold">
                    {formatMoney(e.paidCourseMinor, e.currency)} / {formatMoney(e.remainingMinor, e.currency)}
                  </dd>
                </div>
                {e.balanceDueOn && e.paymentState === "PARTIALLY_PAID" ? (
                  <div>
                    <dt className="text-muted-foreground">Balance due</dt>
                    <dd className="font-semibold">
                      {formatDate(e.balanceDueOn)} <DaysLeft date={e.balanceDueOn} />
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-muted-foreground">VAT treatment</dt>
                  <dd>
                    {e.vatTreatment
                      ? `${e.vatTreatment === "STANDARD" ? "5% VAT" : "Zero-rated"} (${e.taxCountry})`
                      : "Set at first payment"}
                  </dd>
                </div>
                {e.lockNote ? (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Lock note</dt>
                    <dd>{e.lockNote}</dd>
                  </div>
                ) : null}
                {e.rejectionReason ? (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Rejection reason</dt>
                    <dd>{e.rejectionReason}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm">Not enrolled in a batch. Use “Assign to batch”.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Jeta FX client ID</p>
              <p className="font-semibold">{s.jetaFxClientId ?? "-"}</p>
              {s.jetaHistory.length ? (
                <ul className="text-muted-foreground mt-1 text-xs">
                  {s.jetaHistory.slice(0, 10).map((h, i) => (
                    <li key={`${h.changedAt}-${i}`}>
                      {formatDate(h.changedAt)}: {h.oldValue ?? "∅"} → {h.newValue ?? "∅"}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div>
              <p className="text-muted-foreground">Marketing consent</p>
              <p>{s.marketingConsent ? `Yes (${s.marketingConsentAt ? formatDate(s.marketingConsentAt) : ""})` : "No"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Registered</p>
              <p>{formatDateTime(s.createdAt)}</p>
            </div>
            {lead && can(v, "crm.access") ? (
              <div className="border-t pt-3">
                <p className="text-muted-foreground">Lead origin</p>
                <p className="font-semibold">
                  {(LEAD_SOURCE_LABELS as Record<string, string>)[lead.source] ?? lead.source}
                  {lead.sourceDetail ? <span className="text-muted-foreground font-normal"> · {lead.sourceDetail}</span> : null}
                </p>
                <p className="text-muted-foreground text-xs">
                  {lead.projectName ? `${lead.projectName} · ` : ""}
                  {lead.campaign ? `Campaign ${lead.campaign} · ` : ""}
                  {lead.ownerName ? `Owner ${lead.ownerName} · ` : ""}
                  Lead since {formatDate(lead.createdAt)}
                  {lead.convertedAt ? `, converted ${formatDate(lead.convertedAt)}` : ""}
                </p>
                <a href={lead.href} className="text-edge-emerald text-xs font-semibold hover:underline">
                  Open in the CRM
                </a>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {payments ? (
        <Card className="mt-4 p-0">
          <CardHeader className="px-6 pt-6">
            <CardTitle>Payments</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Course</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Odoo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground py-6 text-center">
                    No payments.
                  </TableCell>
                </TableRow>
              ) : (
                payments.map((pay) => (
                  <TableRow key={pay.id}>
                    <TableCell>
                      <Link href={`/admin/payments/${pay.id}`} className="text-edge-emerald hover:underline">
                        {formatDateTime(pay.succeededAt ?? pay.createdAt)}
                      </Link>
                    </TableCell>
                    <TableCell>{KIND_LABELS[pay.kind]}</TableCell>
                    <TableCell>{GATEWAY_LABELS[pay.gateway]}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(pay.courseMinor, pay.currency)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatMoney(pay.totalMinor, pay.currency)}</TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={pay.status} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {pay.status === "SUCCEEDED" ? <SyncBadge status={pay.odoo.status} /> : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      ) : null}

      {e && events.length ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3 border-l pl-4 text-sm">
              {events.map((ev) => (
                <li key={ev.id} className="relative">
                  <span className="bg-edge-emerald absolute top-1.5 -left-[21px] size-2.5 rounded-full" />
                  <p className="font-medium">
                    {EVENT_LABELS[ev.type] ?? ev.type}
                    {ev.toStatus && ev.fromStatus !== ev.toStatus ? (
                      <span className="text-muted-foreground"> → {ev.toStatus.replace("_", " ").toLowerCase()}</span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatDateTime(ev.createdAt)} ·{" "}
                    {ev.actorType === "USER" ? (ev.actorName ?? "Staff") : ev.actorType === "WEBHOOK" ? "Payment gateway" : "System"}
                    {typeof ev.data.reason === "string" ? ` · ${ev.data.reason}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
