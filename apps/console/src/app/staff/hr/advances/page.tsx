import { hrRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { ADVANCE_STATUSES } from "@edge/domain/hr/enums";
import { ADVANCE_STATUS_LABELS } from "@edge/domain/hr/labels";
import { addMonths, formatMonth, monthOf } from "@edge/domain/hr/calendar";
import { formatPayAmount } from "@edge/domain/hr/pay";
import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { EmptyState } from "@edge/ui/blocks/empty-state";
import { FilterBar, FilterResults, FilterSelect } from "@edge/ui/blocks/filter-bar";
import { Pagination } from "@edge/ui/blocks/pagination";
import { AdvanceStatusBadge } from "@edge/ui/blocks/status-badges";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent } from "@edge/ui/components/card";
import { Field } from "@edge/ui/forms/field";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { HandCoins } from "lucide-react";
import type { Metadata } from "next";
import { RescheduleDialog } from "@/components/hr/reschedule-dialog";
import { approveAdvanceAction, rejectAdvanceAction } from "@/lib/actions/hr";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Advance approvals" };

type Status = (typeof ADVANCE_STATUSES)[number];

export default async function AdvanceApprovalsPage(props: PageProps<"/staff/hr/advances">) {
  await requireStaff("hr.payroll");
  const sp = await props.searchParams;
  const status = ADVANCE_STATUSES.includes(sp.status as Status) ? (sp.status as Status) : undefined;
  const [page, months] = await Promise.all([
    load(() => api(hrRoutes.advances, { query: { status, page: Number(sp.page) || 1, pageSize: Number(sp.pageSize) || 50 } })),
    load(() => api(hrRoutes.payrollMonths)),
  ]);
  const closed = months.rows.find((m) => m.status === "CLOSED")?.month;
  const today = new Date().toISOString().slice(0, 10);
  const firstOpen = closed ? addMonths(closed, 1) : monthOf(new Date(`${today}T00:00:00.000Z`));
  return (
    <>
      <PageHeader help="/staff/docs/hr-advances" title="Advance approvals" />
      <FilterBar search={false}>
        <FilterSelect name="status" label="Status" value={status} options={ADVANCE_STATUSES.map((s) => [s, ADVANCE_STATUS_LABELS[s]])} />
      </FilterBar>
      <FilterResults>
        {page.rows.length === 0 ? (
          <Card>
            <EmptyState icon={<HandCoins />} title="No advances here." />
          </Card>
        ) : (
          <div className="grid gap-4">
            {page.rows.map((a) => (
              <Card key={a.id}>
                <CardContent className="grid gap-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {a.employee.name}: <span className="tabular-nums">{formatPayAmount(a.amountMinor, a.currency)}</span>
                    </span>
                    <AdvanceStatusBadge status={a.status} />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Requested {formatDate(a.createdAt)}
                    {a.paidOn ? `, paid ${formatDate(a.paidOn)}` : ""}
                    {a.status === "APPROVED" ? `, ${formatPayAmount(a.remainingMinor, a.currency)} left` : ""}
                  </p>
                  {a.reason ? <p>{a.reason}</p> : null}
                  {a.installments.length ? (
                    <ul className="divide-y">
                      {a.installments.map((i) => (
                        <li key={i.month} className="flex justify-between gap-3 py-1.5">
                          <span>{formatMonth(i.month)}</span>
                          <span className="tabular-nums">
                            {formatPayAmount(i.amountMinor, a.currency)} {i.status === "DEDUCTED" ? "(repaid)" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {a.status === "PENDING" ? (
                    <div className="flex gap-2 pt-1">
                      <ActionDialog
                        action={approveAdvanceAction}
                        hidden={{ id: a.id }}
                        title={`Approve for ${a.employee.name}?`}
                        submitLabel="Approve"
                        trigger={<Button size="sm">Approve</Button>}
                      >
                        <Field
                          label="First repayment month (YYYY-MM)"
                          name="firstMonth"
                          defaultValue={firstOpen}
                          required
                          pattern="\d{4}-\d{2}"
                        />
                        <Field label="Repay over how many months?" name="months" type="number" min={1} max={24} defaultValue="1" required />
                        <Field label="Paid on" name="paidOn" type="date" defaultValue={today} required />
                        <Field label="Note" name="note" />
                      </ActionDialog>
                      <ActionDialog
                        action={rejectAdvanceAction}
                        hidden={{ id: a.id }}
                        destructive
                        title={`Reject for ${a.employee.name}?`}
                        submitLabel="Reject"
                        trigger={
                          <Button size="sm" variant="outline">
                            Reject
                          </Button>
                        }
                      >
                        <Field label="Reason" name="note" />
                      </ActionDialog>
                    </div>
                  ) : null}
                  {a.status === "APPROVED" ? <RescheduleDialog advance={a} /> : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} noun="advances" />
      </FilterResults>
    </>
  );
}
