import { hrRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { LEAVE_REQUEST_STATUSES } from "@edge/domain/hr/enums";
import { HALF_DAY_LABELS, LEAVE_STATUS_LABELS } from "@edge/domain/hr/labels";
import { formatDays } from "@edge/domain/hr/leave";
import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { FilterBar, FilterResults, FilterSelect } from "@edge/ui/blocks/filter-bar";
import { TableEmpty } from "@edge/ui/blocks/empty-state";
import { Pagination } from "@edge/ui/blocks/pagination";
import { LeaveStatusBadge } from "@edge/ui/blocks/status-badges";
import { Button } from "@edge/ui/components/button";
import { Card } from "@edge/ui/components/card";
import { Checkbox } from "@edge/ui/components/checkbox";
import { Label } from "@edge/ui/components/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { Field } from "@edge/ui/forms/field";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import { FileLink } from "@/components/hr/shared";
import { approveLeaveAction, cancelLeaveAction, rejectLeaveAction } from "@/lib/actions/hr";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Leave approvals" };

type Status = (typeof LEAVE_REQUEST_STATUSES)[number];

export default async function LeaveApprovalsPage(props: PageProps<"/staff/hr/leave">) {
  await requireStaff("hr.manage");
  const sp = await props.searchParams;
  const status = LEAVE_REQUEST_STATUSES.includes(sp.status as Status) ? (sp.status as Status) : undefined;
  const page = await load(() =>
    api(hrRoutes.leaveRequests, { query: { status, page: Number(sp.page) || 1, pageSize: Number(sp.pageSize) || 50 } }),
  );
  return (
    <>
      <PageHeader help="/staff/docs/hr-leave" title="Leave approvals" />
      <FilterBar search={false}>
        <FilterSelect
          name="status"
          label="Status"
          value={status}
          options={LEAVE_REQUEST_STATUSES.map((s) => [s, LEAVE_STATUS_LABELS[s]])}
        />
      </FilterBar>
      <FilterResults>
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.rows.length === 0 ? <TableEmpty colSpan={5} icon={<ClipboardCheck />} title="No leave requests here." /> : null}
              {page.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-normal">
                    <span className="font-medium">{r.employee.name}</span>
                    <div className="text-muted-foreground text-xs">
                      {r.typeName}
                      {r.paid ? "" : " (unpaid)"}
                    </div>
                    {r.reason ? <div className="text-muted-foreground text-xs">{r.reason}</div> : null}
                    {r.attachment ? <FileLink file={r.attachment} /> : null}
                  </TableCell>
                  <TableCell>
                    {formatDate(r.fromDay)}
                    {r.toDay !== r.fromDay ? ` to ${formatDate(r.toDay)}` : ""}
                    {r.halfDay ? <span className="text-muted-foreground block text-xs">{HALF_DAY_LABELS[r.halfDay]} only</span> : null}
                  </TableCell>
                  <TableCell>
                    {formatDays(r.centiDays)}
                    {r.balanceAfterCenti !== null ? (
                      <span className="text-muted-foreground block text-xs">{formatDays(r.balanceAfterCenti)} left after</span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <LeaveStatusBadge status={r.status} />
                    {r.allowedNegative ? <span className="text-muted-foreground block text-xs">Negative allowed</span> : null}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {r.status === "PENDING" ? (
                      <div className="flex justify-end gap-2">
                        <ActionDialog
                          action={rejectLeaveAction}
                          hidden={{ id: r.id }}
                          destructive
                          title={`Reject leave for ${r.employee.name}?`}
                          submitLabel="Reject"
                          trigger={
                            <Button size="sm" variant="outline">
                              Reject
                            </Button>
                          }
                        >
                          <Field label="Reason" name="note" />
                        </ActionDialog>
                        <ActionDialog
                          action={approveLeaveAction}
                          hidden={{ id: r.id }}
                          title={`Approve leave for ${r.employee.name}?`}
                          submitLabel="Approve"
                          trigger={<Button size="sm">Approve</Button>}
                        >
                          <Field label="Note" name="note" />
                          {r.tracksBalance ? (
                            <div className="flex items-center gap-2">
                              <Checkbox id={`neg-${r.id}`} name="allowNegative" />
                              <Label htmlFor={`neg-${r.id}`} className="font-normal">
                                Allow negative balance
                              </Label>
                            </div>
                          ) : null}
                        </ActionDialog>
                      </div>
                    ) : r.status === "APPROVED" ? (
                      <ActionDialog
                        action={cancelLeaveAction}
                        hidden={{ id: r.id }}
                        destructive
                        title="Cancel this leave?"
                        description="Days in a closed salary month stay taken. The rest go back to the balance."
                        submitLabel="Cancel leave"
                        cancelLabel="Keep leave"
                        trigger={
                          <Button size="sm" variant="ghost">
                            Cancel
                          </Button>
                        }
                      >
                        <Field label="Reason" name="note" />
                      </ActionDialog>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} noun="requests" />
      </FilterResults>
    </>
  );
}
