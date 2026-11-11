import { crmRoutes } from "@edge/contracts";
import { fractionToPercent } from "@edge/domain/crm/commission";
import { DEPOSIT_STATUSES } from "@edge/domain/crm/enums";
import { DEPOSIT_SEQUENCE_LABELS, DEPOSIT_STATUS_LABELS } from "@edge/domain/crm/labels";
import { formatDate } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { DateRangeFilter } from "@edge/ui/blocks/date-range-filter";
import { FilterBar, FilterLink, FilterResults, FilterScope, FilterSelect } from "@edge/ui/blocks/filter-bar";
import { Pagination } from "@edge/ui/blocks/pagination";
import { TableEmpty } from "@edge/ui/blocks/empty-state";
import { StatCard } from "@edge/ui/blocks/stat-card";
import { DepositStatusBadge } from "@edge/ui/blocks/status-badges";
import { Card } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeleteDepositButton, RejectDepositDialog, VerifyDepositDialog } from "@/components/crm/deposit-actions";
import { DeleteButton } from "@/components/delete-button";
import { pageRange } from "@/lib/date-range";
import { can, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Deposits" };

const usd = (minor: number) => formatMoney(minor, "USD");

export default async function DepositsPage(props: PageProps<"/deposits">) {
  const v = await requireCrm("crm.read");
  const canPurge = can(v, "records.delete");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? sp[k] : undefined);
  // Today by deposit date unless a range is picked; older `period=` links map onto a range.
  const dr = pageRange(sp, { legacy: { param: "period", map: { month: "month", lastMonth: "lastMonth", year: "year", all: "all" } } });
  const f = {
    status: DEPOSIT_STATUSES.find((s) => s === one("status")),
    staff: one("staff"),
    page: Number(one("page")) || 1,
    pageSize: Number(one("pageSize")) || 50,
  };
  const d = await load(() =>
    api(crmRoutes.deposits, { query: { ...f, ...(dr.all ? { period: "all" as const } : { from: dr.from, to: dr.to }) } }),
  );
  const s = d.summary;
  const current = new URLSearchParams(
    Object.entries(sp).filter(([k, x]) => !["page", "pageSize"].includes(k) && typeof x === "string" && x) as [string, string][],
  );
  const views = [
    { label: "Today", query: "" },
    { label: "Pending review", query: "range=all&status=PENDING" },
    { label: "This month", query: "range=month" },
    { label: "All", query: "range=all" },
  ];
  const now = [...current.entries()]
    .sort()
    .map(([k, x]) => `${k}=${x}`)
    .join("&");

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
      <div className="mb-3 flex flex-wrap gap-1.5">
        {views.map((x) => {
          const active = x.query === now;
          return (
            <FilterLink
              key={x.label}
              href={`/deposits${x.query ? `?${x.query}` : ""}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${active ? "border-edge-emerald bg-edge-mint/40 text-edge-emerald" : "text-muted-foreground hover:text-foreground"}`}
            >
              {x.label}
            </FilterLink>
          );
        })}
      </div>
      <FilterBar search={false}>
        <DateRangeFilter {...dr.filter} prefix="Deposited" />
        <FilterSelect name="status" label="Status" value={f.status} options={DEPOSIT_STATUSES.map((x) => [x, DEPOSIT_STATUS_LABELS[x]])} />
        {d.manage ? (
          <FilterSelect name="staff" label="Credited to" allLabel="Everyone" value={f.staff} options={d.staff.map((u) => [u.id, u.name])} />
        ) : null}
      </FilterBar>
      <FilterResults>
        <div className={`mb-6 grid gap-4 ${s.month ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3"}`}>
          <StatCard
            label="Waiting for verification"
            value={s.pendingCount}
            hint={
              dr.all
                ? s.pendingCount
                  ? usd(s.pendingMinor)
                  : "nothing pending"
                : `${s.pendingCount ? usd(s.pendingMinor) : "none"} · ${dr.filter.label.toLowerCase()} · open for all dates`
            }
            href="/deposits?range=all&status=PENDING"
            tone={s.pendingCount ? "warn" : undefined}
          />
          <StatCard
            label="Verified deposits"
            value={usd(s.verifiedMinor)}
            hint={`${s.verifiedCount} deposit${s.verifiedCount === 1 ? "" : "s"}`}
          />
          <StatCard label={d.manage ? "Commission earned" : "My commission"} value={usd(s.commissionMinor)} hint="on verified deposits" />
          {s.month ? (
            <StatCard
              label="Later deposits this month"
              value={usd(s.month.laterMinor)}
              hint={
                `${fractionToPercent(s.month.pct)}% on all of them` +
                (s.month.next
                  ? ` · ${usd(s.month.next.fromMinor - s.month.laterMinor)} more for ${fractionToPercent(s.month.next.pct)}%`
                  : " · top slab")
              }
            />
          ) : null}
        </div>
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden md:table-cell">Date</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead className="hidden lg:table-cell">Deposit</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden md:table-cell">Counts for</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Commission</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.rows.length === 0 ? (
                <TableEmpty colSpan={8} icon={<Wallet />} title="No deposits match.">
                  Deposits are logged on the lead page, from its Deposits card.
                </TableEmpty>
              ) : (
                d.rows.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="hidden whitespace-nowrap md:table-cell">{formatDate(x.depositedAt)}</TableCell>
                    <TableCell>
                      <Link href={`/leads/${x.lead.id}`} className="text-edge-emerald font-semibold hover:underline">
                        {x.lead.name}
                      </Link>
                      <span className="text-muted-foreground block text-xs">
                        <span className="md:hidden">{formatDate(x.depositedAt)} · </span>
                        JetaFX {x.jetaFxClientId ?? "–"}
                        {x.reference ? ` · ref ${x.reference}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{DEPOSIT_SEQUENCE_LABELS[x.sequence]}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{formatMoney(x.amountMinor, x.currency)}</TableCell>
                    <TableCell className="hidden md:table-cell">
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
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {x.commissionMinor != null ? (
                        <>
                          {formatMoney(x.commissionMinor, x.currency)}
                          {x.commissionPct ? (
                            <span className="text-muted-foreground block text-xs">
                              {fractionToPercent(x.commissionPct)}%{x.slabBaseMinor != null ? ` · month ${usd(x.slabBaseMinor)}` : ""}
                            </span>
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
                        {x.canDelete ? (
                          <DeleteDepositButton id={x.id} />
                        ) : canPurge ? (
                          <DeleteButton type="deposit" id={x.id} iconOnly label="Delete deposit" />
                        ) : null}
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
