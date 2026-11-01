import { hrRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { HALF_DAY_LABELS, LEAVE_LEDGER_LABELS } from "@edge/domain/hr/labels";
import { formatDays } from "@edge/domain/hr/leave";
import { ActionButton } from "@edge/ui/blocks/action-dialog";
import { Disclosure } from "@edge/ui/blocks/disclosure";
import { TableEmpty } from "@edge/ui/blocks/empty-state";
import { StatCard } from "@edge/ui/blocks/stat-card";
import { LeaveStatusBadge } from "@edge/ui/blocks/status-badges";
import { Card } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { CalendarOff } from "lucide-react";
import type { Metadata } from "next";
import { LeaveDialog } from "@/components/hr/leave-dialog";
import { FileLink, NotSetUp } from "@/components/hr/shared";
import { applyLeaveAction, withdrawLeaveAction } from "@/lib/actions/hr";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "My leave" };

export default async function MyLeavePage() {
  await requireStaff();
  const l = await load(() => api(hrRoutes.myLeave));
  const types = l.balances.filter((b) => b.active);
  return (
    <>
      <PageHeader
        help="/staff/docs/leave"
        title="My leave"
        description={l.setUp ? `Leave year ${l.year}` : undefined}
        actions={
          l.setUp ? <LeaveDialog action={applyLeaveAction} types={types} title="Apply for leave" triggerLabel="Apply for leave" /> : null
        }
      />
      {!l.setUp ? <NotSetUp /> : null}
      {l.setUp ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {l.balances
              .filter((b) => b.tracksBalance)
              .map((b) => (
                <StatCard
                  key={b.typeKey}
                  label={b.name}
                  value={formatDays(b.balanceCenti)}
                  hint={`${formatDays(b.takenCenti)} taken this year`}
                  tone={b.balanceCenti < 0 ? "danger" : undefined}
                />
              ))}
          </div>
          <Card className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leave</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {l.requests.length === 0 ? <TableEmpty colSpan={5} icon={<CalendarOff />} title="No leave requests yet." /> : null}
                {l.requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-normal">
                      <span className="font-medium">{r.typeName}</span>
                      {r.reason ? <div className="text-muted-foreground text-xs">{r.reason}</div> : null}
                      {r.attachment ? <FileLink file={r.attachment} /> : null}
                      {r.decisionNote ? <div className="text-muted-foreground text-xs">HR: {r.decisionNote}</div> : null}
                    </TableCell>
                    <TableCell>
                      {formatDate(r.fromDay)}
                      {r.toDay !== r.fromDay ? ` to ${formatDate(r.toDay)}` : ""}
                      {r.halfDay ? <span className="text-muted-foreground block text-xs">{HALF_DAY_LABELS[r.halfDay]} only</span> : null}
                    </TableCell>
                    <TableCell>{formatDays(r.centiDays)}</TableCell>
                    <TableCell>
                      <LeaveStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {r.status === "PENDING" ? (
                        <ActionButton action={withdrawLeaveAction} hidden={{ id: r.id }} variant="ghost">
                          Withdraw
                        </ActionButton>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          {l.ledger.length ? (
            <Disclosure summary="Balance history" className="mt-6">
              <ul className="divide-y text-sm">
                {l.ledger.map((row) => (
                  <li key={row.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0">
                      {LEAVE_LEDGER_LABELS[row.kind]}: {row.typeName}
                      {row.note ? <span className="text-muted-foreground block text-xs">{row.note}</span> : null}
                    </span>
                    <span className="whitespace-nowrap tabular-nums">
                      {row.centiDays > 0 ? "+" : ""}
                      {formatDays(row.centiDays)}
                    </span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          ) : null}
        </>
      ) : null}
    </>
  );
}
