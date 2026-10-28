import { crmRoutes } from "@edge/contracts";
import { fractionToPercent } from "@edge/domain/crm/commission";
import { DEPOSIT_STATUSES, LEADERBOARD_PERIODS } from "@edge/domain/crm/enums";
import { DEPOSIT_SEQUENCE_LABELS, DEPOSIT_STATUS_LABELS, LEADERBOARD_PERIOD_LABELS } from "@edge/domain/crm/labels";
import { formatDate } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { FilterBar, FilterResults, FilterScope, FilterSelect } from "@edge/ui/blocks/filter-bar";
import { Pagination } from "@edge/ui/blocks/pagination";
import { StatCard } from "@edge/ui/blocks/stat-card";
import { DepositStatusBadge } from "@edge/ui/blocks/status-badges";
import { Card } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { DeleteDepositButton, RejectDepositDialog, VerifyDepositDialog } from "@/components/crm/deposit-actions";
import { load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Deposits" };

const usd = (minor: number) => formatMoney(minor, "USD");

export default async function DepositsPage(props: PageProps<"/deposits">) {
  await requireCrm("crm.read");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? sp[k] : undefined);
  const f = {
    status: DEPOSIT_STATUSES.find((s) => s === one("status")),
    period: LEADERBOARD_PERIODS.find((p) => p === one("period")),
    staff: one("staff"),
    page: Number(one("page")) || 1,
    pageSize: Number(one("pageSize")) || 50,
  };
  const d = await load(() => api(crmRoutes.deposits, { query: f }));
  const s = d.summary;

  return (
    <FilterScope>
      <PageHeader
        help="/docs/deposits"
        title="Deposits"
        description={
          d.manage
            ? "JetaFX deposits logged by sales. Verify each one against the broker's report; only verified deposits earn commission."
            : "Deposits on your leads and the commission they earned."
        }
      />
      <FilterBar search={false}>
        <FilterSelect name="status" label="Status" value={f.status} options={DEPOSIT_STATUSES.map((x) => [x, DEPOSIT_STATUS_LABELS[x]])} />
        <FilterSelect
          name="period"
          label="Period"
          allLabel="All time"
          value={f.period}
          options={LEADERBOARD_PERIODS.filter((p) => p !== "all").map((p) => [p, LEADERBOARD_PERIOD_LABELS[p]])}
        />
        {d.manage ? (
          <FilterSelect name="staff" label="Credited to" allLabel="Everyone" value={f.staff} options={d.staff.map((u) => [u.id, u.name])} />
        ) : null}
      </FilterBar>
      <FilterResults>
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Waiting for verification"
            value={s.pendingCount}
            hint={s.pendingCount ? usd(s.pendingMinor) : "nothing pending"}
            href="/deposits?status=PENDING"
            tone={s.pendingCount ? "warn" : undefined}
          />
          <StatCard
            label="Verified deposits"
            value={usd(s.verifiedMinor)}
            hint={`${s.verifiedCount} deposit${s.verifiedCount === 1 ? "" : "s"}`}
          />
          <StatCard label={d.manage ? "Commission earned" : "My commission"} value={usd(s.commissionMinor)} hint="on verified deposits" />
        </div>
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Deposit</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Counts for</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground py-6 text-center">
                    No deposits match.
                  </TableCell>
                </TableRow>
              ) : (
                d.rows.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(x.depositedAt)}</TableCell>
                    <TableCell>
                      <Link href={`/leads/${x.lead.id}`} className="text-edge-emerald font-semibold hover:underline">
                        {x.lead.name}
                      </Link>
                      <span className="text-muted-foreground block text-xs">
                        JetaFX {x.jetaFxClientId ?? "–"}
                        {x.reference ? ` · ref ${x.reference}` : ""}
                      </span>
                    </TableCell>
                    <TableCell>{DEPOSIT_SEQUENCE_LABELS[x.sequence]}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatMoney(x.amountMinor, x.currency)}</TableCell>
                    <TableCell>
                      {x.creditedTo?.name ?? "–"}
                      {x.loggedBy && x.loggedBy.id !== x.creditedTo?.id ? (
                        <span className="text-muted-foreground block text-xs">logged by {x.loggedBy.name}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <DepositStatusBadge status={x.status} />
                      {x.status === "REJECTED" && x.rejectReason ? (
                        <span className="text-muted-foreground block text-xs">{x.rejectReason}</span>
                      ) : null}
                      {x.reviewedBy && x.status !== "PENDING" ? (
                        <span className="text-muted-foreground block text-xs">by {x.reviewedBy.name}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {x.commissionMinor != null ? (
                        <>
                          {formatMoney(x.commissionMinor, x.currency)}
                          {x.commissionPct ? (
                            <span className="text-muted-foreground block text-xs">{fractionToPercent(x.commissionPct)}%</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        {d.manage && x.status === "PENDING" ? (
                          <VerifyDepositDialog
                            id={x.id}
                            leadName={x.lead.name}
                            amountMinor={x.amountMinor}
                            sequence={x.sequence}
                            depositedAt={x.depositedAt}
                            clientId={x.jetaFxClientId}
                          />
                        ) : null}
                        {d.manage && x.status !== "REJECTED" ? <RejectDepositDialog id={x.id} verified={x.status === "VERIFIED"} /> : null}
                        {x.canDelete ? <DeleteDepositButton id={x.id} /> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
        <Pagination page={d.page} pageSize={d.pageSize} total={d.total} noun="deposits" className="mt-4" />
      </FilterResults>
    </FilterScope>
  );
}
