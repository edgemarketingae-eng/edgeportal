import { crmRoutes } from "@edge/contracts";
import { LEAD_STAGES } from "@edge/domain/crm/enums";
import { LEAD_STAGE_LABELS, PROJECT_STATUS_LABELS } from "@edge/domain/crm/labels";
import { formatDate } from "@edge/domain/dates";
import { TableEmpty } from "@edge/ui/blocks/empty-state";
import { Alert, AlertDescription } from "@edge/ui/components/alert";
import { StatCard } from "@edge/ui/blocks/stat-card";
import { Badge } from "@edge/ui/components/badge";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FollowUpDue } from "@/components/crm/due";
import { LeadsTable } from "@/components/crm/leads-table";
import { ProjectForm } from "@/components/crm/project-form";
import { AddMemberDialog, DeleteProjectDialog, RemoveMemberButton } from "@/components/crm/project-team";
import { can, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Project" };

const FUNNEL = LEAD_STAGES.filter((s) => s !== "LOST");

export default async function ProjectPage(props: PageProps<"/projects/[id]">) {
  const v = await requireCrm("crm.read");
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  const { project: p, byStage, team, recentLeads, openTasks, options } = await load(() => api(crmRoutes.project, { params: { id } }));
  const canSetManagers = can(v, "crm.projects.manage");
  const max = Math.max(1, ...FUNNEL.map((s) => byStage[s] ?? 0));
  const notOnTeam = options.staff.filter((s) => !team.some((t) => t.id === s.id));
  const leadCount = Object.values(byStage).reduce((sum, n) => sum + n, 0);
  const canDelete = can(v, "crm.projects.delete") && !p.isDefault;
  const deleteBlockers = [
    leadCount ? `move its ${leadCount} lead${leadCount === 1 ? "" : "s"} to another project` : null,
    p.stats.team ? `remove ${p.stats.team === 1 ? "the 1 person" : `the ${p.stats.team} people`} on its team` : null,
  ]
    .filter(Boolean)
    .join(" and ");
  return (
    <>
      <PageHeader
        back={{ href: "/projects", label: "Projects" }}
        help="/docs/projects"
        title={p.name}
        description={
          <>
            {p.code} · {PROJECT_STATUS_LABELS[p.status]}
            {p.courseTitle ? ` · ${p.courseTitle}` : ""}
            {p.batchName ? ` · ${p.batchName}` : ""}
            {p.startDate || p.endDate
              ? ` · ${p.startDate ? formatDate(p.startDate) : "…"} – ${p.endDate ? formatDate(p.endDate) : "…"}`
              : ""}
            {p.description ? ` · ${p.description}` : ""}
          </>
        }
        actions={
          <>
            {can(v, "crm.write") && p.status !== "ARCHIVED" ? (
              <Button asChild size="sm">
                <Link href={`/leads/new?project=${p.id}`}>
                  <Plus /> Lead
                </Link>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href={`/leads?project=${p.id}`}>All leads</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/tasks?project=${p.id}`}>Board</Link>
            </Button>
          </>
        }
      />
      {sp.created ? (
        <Alert variant="success" className="mb-4">
          <AlertDescription>Project created.</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open leads"
          value={p.stats.openLeads}
          href={`/leads?project=${p.id}`}
          hint={p.targetLeads ? `target ${p.targetLeads}` : undefined}
        />
        <StatCard
          label="Converted this month"
          value={p.stats.convertedMonth}
          hint={p.targetConversions ? `target ${p.targetConversions}` : undefined}
          href={`/leads?project=${p.id}&stage=CONVERTED`}
        />
        <StatCard
          label="Overdue tasks"
          value={p.stats.overdueTasks}
          tone={p.stats.overdueTasks ? "danger" : undefined}
          href={`/tasks?project=${p.id}&view=list`}
        />
        <StatCard
          label="Team"
          value={p.isDefault ? "Everyone" : p.stats.team}
          hint={
            p.isDefault
              ? "The default project is open to every CRM user"
              : `${p.managers.length} manager${p.managers.length === 1 ? "" : "s"}`
          }
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Funnel</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {FUNNEL.map((s) => {
              const n = byStage[s] ?? 0;
              return (
                <Link
                  key={s}
                  href={`/leads?project=${p.id}&stage=${s}`}
                  className="group grid grid-cols-[110px_1fr_40px] items-center gap-3 text-sm"
                >
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

        <Card className="p-0">
          <CardHeader className="px-6 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Team</CardTitle>
              {p.canManage && !p.isDefault ? <AddMemberDialog projectId={p.id} staff={notOnTeam} canSetManagers={canSetManagers} /> : null}
            </div>
          </CardHeader>
          {p.isDefault ? (
            <CardContent className="text-muted-foreground grid gap-2 text-sm">
              <p>Everyone with CRM access works in General, so it has no team to manage. Website leads land here.</p>
              <p>
                Round-robin shares General leads across every active sales executive. To give a group its own leads and team, create a
                project.
              </p>
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                  <TableHead className="text-right">Converted</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  {p.canManage ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.length === 0 ? (
                  <TableEmpty colSpan={5} title="Nobody on the team yet." />
                ) : (
                  team.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Link href={`/leads?project=${p.id}&owner=${m.id}`} className="font-semibold hover:underline">
                          {m.name}
                        </Link>
                        <div className="text-muted-foreground flex flex-wrap gap-1 text-xs">
                          <Badge variant="outline">{m.role === "manager" ? "Project manager" : "Sales executive"}</Badge>
                          {m.roles.map((r) => (
                            <span key={r}>{r}</span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{m.openLeads}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.convertedMonth}</TableCell>
                      <TableCell className={`text-right tabular-nums ${m.overdueTasks ? "text-destructive font-semibold" : ""}`}>
                        {m.overdueTasks}
                      </TableCell>
                      {p.canManage ? (
                        <TableCell className="text-right">
                          {m.role === "member" || canSetManagers ? (
                            <RemoveMemberButton projectId={p.id} userId={m.id} name={m.name} />
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Recent leads</h2>
        <LeadsTable rows={recentLeads} total={recentLeads.length} filters="" assignees={[]} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Open tasks</CardTitle>
        </CardHeader>
        <CardContent>
          {openTasks.length === 0 ? (
            <p className="text-muted-foreground text-sm">No open tasks.</p>
          ) : (
            <ul className="divide-y text-sm">
              {openTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <Link href={`/tasks/${t.id}`} className="text-edge-emerald font-semibold hover:underline">
                      {t.title}
                    </Link>
                    <span className="text-muted-foreground">
                      {" "}
                      {t.leadName ? `· ${t.leadName}` : ""} · {t.assignee?.name ?? "unassigned"}
                    </span>
                  </span>
                  {t.dueAt ? <FollowUpDue at={t.dueAt} className="text-xs whitespace-nowrap" /> : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {p.canManage ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Edit project</CardTitle>
          </CardHeader>
          <CardContent>
            <ProjectForm
              values={{
                id: p.id,
                name: p.name,
                code: p.code,
                description: p.description ?? "",
                status: p.status,
                courseId: p.courseId ?? "",
                batchId: p.batchId ?? "",
                startDate: p.startDate ?? "",
                endDate: p.endDate ?? "",
                targetLeads: p.targetLeads?.toString() ?? "",
                targetConversions: p.targetConversions?.toString() ?? "",
                managerIds: p.managers.map((m) => m.id),
                memberIds: p.members.map((m) => m.id),
              }}
              staff={options.staff}
              courses={options.courses}
              batches={options.batches}
              canSetManagers={canSetManagers}
              isDefault={p.isDefault}
            />
          </CardContent>
        </Card>
      ) : null}

      {canDelete ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Delete project</CardTitle>
            <CardDescription>
              {deleteBlockers
                ? `Only an empty project can be deleted: ${deleteBlockers} first.`
                : "Nothing is left in this project: no leads and no team."}
            </CardDescription>
          </CardHeader>
          {deleteBlockers ? null : (
            <CardContent>
              <DeleteProjectDialog projectId={p.id} name={p.name} />
            </CardContent>
          )}
        </Card>
      ) : null}
    </>
  );
}
