import { crmRoutes } from "@edge/contracts";
import { LEADERBOARD_PERIODS } from "@edge/domain/crm/enums";
import { LEADERBOARD_PERIOD_LABELS } from "@edge/domain/crm/labels";
import { formatMoney } from "@edge/domain/money";
import { FilterBar, FilterResults, FilterScope, FilterSelect } from "@edge/ui/blocks/filter-bar";
import { StatCard } from "@edge/ui/blocks/stat-card";
import { Card } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { can, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Leaderboard" };

const usd = (minor: number) => formatMoney(minor, "USD");
const MEDAL: Record<number, string> = {
  1: "bg-amber-100 text-amber-900",
  2: "bg-slate-100 text-slate-800",
  3: "bg-orange-100 text-orange-900",
};

export default async function LeaderboardPage(props: PageProps<"/leaderboard">) {
  const v = await requireCrm("crm.read");
  const sp = await props.searchParams;
  const period = LEADERBOARD_PERIODS.find((p) => p === sp.period) ?? "month";
  const project = typeof sp.project === "string" && sp.project ? sp.project : undefined;
  const [b, options] = await Promise.all([
    load(() => api(crmRoutes.leaderboard, { query: { period, project } })),
    load(() => api(crmRoutes.options)),
  ]);
  const seller = can(v, "crm.write");

  return (
    <FilterScope>
      <PageHeader
        help="/docs/leaderboard"
        title="Leaderboard"
        description={`${LEADERBOARD_PERIOD_LABELS[period]} · ranked by conversions, then verified deposits`}
        actions={
          <FilterBar search={false} className="mb-0">
            <FilterSelect
              name="period"
              label="Period"
              allLabel={LEADERBOARD_PERIOD_LABELS.month}
              value={period === "month" ? undefined : period}
              options={LEADERBOARD_PERIODS.filter((p) => p !== "month").map((p) => [p, LEADERBOARD_PERIOD_LABELS[p]])}
            />
            <FilterSelect
              name="project"
              label="Project"
              allLabel="All projects"
              value={project}
              options={options.projects.map((p) => [p.id, p.name])}
            />
          </FilterBar>
        }
      />
      <FilterResults>
        {seller ? (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="My conversions" value={b.me.conversions} hint={LEADERBOARD_PERIOD_LABELS[period]} />
            <StatCard label="My verified deposits" value={usd(b.me.depositsMinor)} />
            <StatCard label="My commission" value={usd(b.me.commissionMinor)} hint="on verified deposits" href="/deposits" />
            <StatCard
              label="Waiting for verification"
              value={b.me.pendingCount}
              hint={b.me.pendingCount ? usd(b.me.pendingMinor) : "nothing pending"}
              href="/deposits?status=PENDING"
              tone={b.me.pendingCount ? "warn" : undefined}
            />
          </div>
        ) : null}
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Sales executive</TableHead>
                <TableHead className="text-right">Conversions</TableHead>
                {b.products.map((p) => (
                  <TableHead key={p.id} className="hidden text-right md:table-cell">
                    {p.name}
                  </TableHead>
                ))}
                <TableHead className="text-right">New leads</TableHead>
                <TableHead className="text-right" title="Of the new leads, how many converted">
                  Converted
                </TableHead>
                <TableHead className="text-right">Verified deposits</TableHead>
                {b.showCommission ? <TableHead className="text-right">Commission</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {b.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7 + b.products.length} className="text-muted-foreground py-6 text-center">
                    No sales executives yet.
                  </TableCell>
                </TableRow>
              ) : (
                b.rows.map((r) => (
                  <TableRow key={r.id} className={r.isMe ? "bg-edge-mint/30" : undefined}>
                    <TableCell>
                      <span
                        className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-bold ${MEDAL[r.rank] ?? ""}`}
                      >
                        {r.rank}
                      </span>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {r.name}
                      {r.isMe ? <span className="text-muted-foreground font-normal"> (you)</span> : null}
                    </TableCell>
                    <TableCell className="text-right text-base font-bold tabular-nums">{r.conversions}</TableCell>
                    {b.products.map((p) => (
                      <TableCell key={p.id} className="text-muted-foreground hidden text-right tabular-nums md:table-cell">
                        {r.byProduct[p.id] ?? 0}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{r.newLeads}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.convertedLeads}
                      {r.conversionRate != null ? <span className="text-muted-foreground text-xs"> ({r.conversionRate}%)</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{usd(r.depositsMinor)}</TableCell>
                    {b.showCommission ? (
                      <TableCell className="text-right font-semibold tabular-nums">{usd(r.commissionMinor ?? 0)}</TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
        <p className="text-muted-foreground mt-3 text-xs">
          A conversion is a lead joining a product (Inner Circle, the premium course, a club), credited to the lead&apos;s owner at the
          time. New leads are the leads they own that were created in the period. Deposits count once an admin has verified them.
        </p>
      </FilterResults>
    </FilterScope>
  );
}
