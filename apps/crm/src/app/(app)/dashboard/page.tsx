import { crmRoutes } from "@edge/contracts";
import { LEAD_STAGES } from "@edge/domain/crm/enums";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS } from "@edge/domain/crm/labels";
import { FilterBar, FilterResults, FilterScope, FilterSelect } from "@edge/ui/blocks/filter-bar";
import { StatCard } from "@edge/ui/blocks/stat-card";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FollowUpDue } from "@/components/crm/due";
import { can, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Dashboard" };

const FUNNEL = LEAD_STAGES.filter((s) => s !== "LOST");

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const v = await requireCrm("crm.read");
  const sp = await props.searchParams;
  const project = typeof sp.project === "string" && sp.project ? sp.project : undefined;
  const [d, options] = await Promise.all([
    load(() => api(crmRoutes.dashboard, { query: { project } })),
    load(() => api(crmRoutes.options)),
  ]);
  const max = Math.max(1, ...FUNNEL.map((s) => d.byStage[s] ?? 0));
  const pct = (source: { leads: number }, n: number) => (source.leads ? `${Math.round((n / source.leads) * 100)}%` : "–");
  const q = project ? `&project=${project}` : "";

  return (
    <FilterScope>
      <PageHeader
        help="/docs/dashboard"
        title="Dashboard"
        description={d.scopeAll ? "Every lead in the academy" : "Your projects, leads and tasks"}
        actions={
          <>
            <FilterBar search={false} className="mb-0">
              <FilterSelect
                name="project"
                label="Project"
                allLabel="All my projects"
                value={project}
                options={options.projects.map((p) => [p.id, p.name])}
              />
            </FilterBar>
            {can(v, "crm.write") ? (
              <Button asChild size="sm">
                <Link href="/leads/new">
                  <Plus /> New lead
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {sp.error === "forbidden" ? (
        <p className="border-destructive/30 bg-destructive/10 text-destructive mb-4 rounded-md border px-3 py-2 text-sm">
          You do not have permission for that page.
        </p>
      ) : null}
      <FilterResults>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Open leads" value={d.openLeads} href={`/leads?${q.slice(1)}`} />
          <StatCard label="New this week" value={d.newWeek} hint={`${d.newToday} today`} href={`/leads?created=week&view=all${q}`} />
          <StatCard
            label={`Untouched > ${d.slaHours}h`}
            value={d.uncontactedOverSla}
            tone={d.uncontactedOverSla ? "warn" : undefined}
            hint="New leads nobody has contacted"
            href={`/leads?stage=NEW&sort=created${q}`}
          />
          <StatCard
            label="Overdue tasks"
            value={d.overdueTasks}
            tone={d.overdueTasks ? "danger" : undefined}
            hint={`${d.dueToday} due today`}
            href="/tasks?view=list"
          />
          <StatCard
            label="Converted this month"
            value={d.convertedMonth}
            hint={`${d.lostMonth} lost`}
            href={`/leads?stage=CONVERTED${q}`}
          />
          <StatCard
            label="Win rate (90 days)"
            value={d.winRate90d == null ? "–" : `${d.winRate90d}%`}
            hint="converted ÷ (converted + lost)"
          />
          <StatCard
            label="First response"
            value={d.medianResponseHours == null ? "–" : `${d.medianResponseHours}h`}
            hint="median, last 30 days"
          />
          <StatCard label="Lost this month" value={d.lostMonth} href={`/leads?stage=LOST${q}`} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Funnel</CardTitle>
              <CardDescription>Leads currently in each stage</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {FUNNEL.map((s) => {
                const n = d.byStage[s] ?? 0;
                return (
                  <Link key={s} href={`/leads?stage=${s}${q}`} className="group grid grid-cols-[110px_1fr_40px] items-center gap-3 text-sm">
                    <span className="text-muted-foreground group-hover:text-foreground">{LEAD_STAGE_LABELS[s]}</span>
                    <span className="bg-muted h-5 overflow-hidden rounded">
                      <span
                        className={`block h-full ${s === "CONVERTED" ? "bg-edge-green" : "bg-edge-emerald/70"}`}
                        style={{ width: `${Math.max(n ? 4 : 0, (n / max) * 100)}%` }}
                      />
                    </span>
                    <span className="text-right font-semibold tabular-nums">{n}</span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>My tasks today</CardTitle>
              <CardDescription>Overdue and due today, oldest first</CardDescription>
            </CardHeader>
            <CardContent>
              {d.myTasks.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nothing due. Nice.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {d.myTasks.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        <Link
                          href={t.leadId ? `/leads/${t.leadId}` : `/tasks/${t.id}`}
                          className="text-edge-emerald font-semibold hover:underline"
                        >
                          {t.leadName ?? t.title}
                        </Link>
                        {t.leadName ? <span className="text-muted-foreground"> · {t.title}</span> : null}
                      </span>
                      {t.dueAt ? <FollowUpDue at={t.dueAt} className="text-xs whitespace-nowrap" /> : null}
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/tasks" className="text-edge-emerald mt-3 inline-block text-sm font-semibold hover:underline">
                Open the board
              </Link>
            </CardContent>
          </Card>

          <Card className="p-0">
            <CardHeader className="px-6 pt-6">
              <CardTitle>Projects</CardTitle>
              <CardDescription>Open leads, conversions this month against target, overdue tasks</CardDescription>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Converted</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.projects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground py-6 text-center">
                      No active projects.
                    </TableCell>
                  </TableRow>
                ) : (
                  d.projects.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/projects/${p.id}`} className="text-edge-emerald font-semibold hover:underline">
                          {p.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.open}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.convertedMonth}
                        {p.targetConversions ? <span className="text-muted-foreground text-xs"> / {p.targetConversions}</span> : null}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums ${p.overdue ? "text-destructive font-semibold" : ""}`}>
                        {p.overdue}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          <Card className="p-0">
            <CardHeader className="px-6 pt-6">
              <CardTitle>By source</CardTitle>
              <CardDescription>Where leads come from and how far they get</CardDescription>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Contacted</TableHead>
                  <TableHead className="text-right">Converted</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.bySource.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground py-6 text-center">
                      No leads yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  d.bySource.map((s) => (
                    <TableRow key={s.source}>
                      <TableCell>
                        <Link href={`/leads?source=${s.source}&view=all${q}`} className="hover:underline">
                          {(LEAD_SOURCE_LABELS as Record<string, string>)[s.source] ?? s.source}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.leads}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.contacted} <span className="text-muted-foreground text-xs">({pct(s, s.contacted)})</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.converted} <span className="text-muted-foreground text-xs">({pct(s, s.converted)})</span>
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{s.paid}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          {d.owners.length ? (
            <Card className="p-0 lg:col-span-2">
              <CardHeader className="px-6 pt-6">
                <CardTitle>Team</CardTitle>
                <CardDescription>Open leads, overdue tasks and conversions this month per person</CardDescription>
              </CardHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                    <TableHead className="text-right">Converted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.owners.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link href={`/leads?owner=${o.id}${q}`} className="hover:underline">
                          {o.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{o.open}</TableCell>
                      <TableCell className={`text-right tabular-nums ${o.overdue ? "text-destructive font-semibold" : ""}`}>
                        {o.overdue}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{o.convertedMonth}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : null}
        </div>
      </FilterResults>
    </FilterScope>
  );
}
