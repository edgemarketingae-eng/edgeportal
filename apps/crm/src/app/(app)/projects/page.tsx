import { crmRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { Disclosure } from "@edge/ui/blocks/disclosure";
import { EmptyState } from "@edge/ui/blocks/empty-state";
import { ProjectStatusBadge } from "@edge/ui/blocks/status-badges";
import { Alert, AlertDescription } from "@edge/ui/components/alert";
import { Badge } from "@edge/ui/components/badge";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { CircleCheck, FolderKanban, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { can, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage(props: PageProps<"/projects">) {
  const v = await requireCrm("crm.read");
  const sp = await props.searchParams;
  const projects = await load(() => api(crmRoutes.projects, { query: {} }));
  const active = projects.filter((p) => p.status !== "ARCHIVED");
  const archived = projects.filter((p) => p.status === "ARCHIVED");
  const manage = can(v, "crm.projects.manage");
  return (
    <>
      <PageHeader
        help="/docs/projects"
        title="Projects"
        description="Sales campaigns with their own team. A project manager runs everything inside; executives work their own leads and the project's pool."
        actions={
          manage ? (
            <Button asChild size="sm">
              <Link href="/projects/new">
                <Plus /> New project
              </Link>
            </Button>
          ) : null
        }
      />
      {sp.deleted ? (
        <Alert variant="success" className="mb-4">
          <CircleCheck aria-hidden />
          <AlertDescription>Project deleted.</AlertDescription>
        </Alert>
      ) : null}
      {active.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderKanban />}
            title="No active projects"
            action={
              manage ? (
                <Button asChild size="sm">
                  <Link href="/projects/new">
                    <Plus /> New project
                  </Link>
                </Button>
              ) : null
            }
          >
            {manage ? "Start one for a campaign or batch, then add its team." : "A CRM manager adds you to projects; they show up here."}
          </EmptyState>
        </Card>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {active.map((p) => (
          // General (open to everyone) gets a dashed edge; cards draw theirs with a ring, which can't be dashed.
          <Card key={p.id} className={p.isDefault ? "border-foreground/20 border border-dashed ring-0" : undefined}>
            <CardHeader>
              <CardTitle>
                <Link href={`/projects/${p.id}`} className="text-edge-emerald hover:underline">
                  {p.name}
                </Link>
              </CardTitle>
              <CardDescription>
                {p.code}
                {p.courseTitle ? ` · ${p.courseTitle}` : ""}
                {p.batchName ? ` · ${p.batchName}` : ""}
                {p.startDate || p.endDate
                  ? ` · ${p.startDate ? formatDate(p.startDate) : "…"} – ${p.endDate ? formatDate(p.endDate) : "…"}`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-2xl font-bold tabular-nums">{p.stats.openLeads}</p>
                  <p className="text-muted-foreground text-xs">open leads</p>
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">
                    {p.stats.convertedMonth}
                    {p.targetConversions ? (
                      <span className="text-muted-foreground text-sm font-normal"> / {p.targetConversions}</span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground text-xs">converted this month</p>
                </div>
                <div>
                  <p className={`text-2xl font-bold tabular-nums ${p.stats.overdueTasks ? "text-destructive" : ""}`}>
                    {p.stats.overdueTasks}
                  </p>
                  <p className="text-muted-foreground text-xs">overdue tasks</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <ProjectStatusBadge status={p.status} />
                {p.isDefault ? (
                  <Badge variant="outline">Open to everyone</Badge>
                ) : (
                  <Badge variant="outline">{p.stats.team} on the team</Badge>
                )}
                {p.managers.length ? (
                  <span className="text-muted-foreground text-xs">PM: {p.managers.map((m) => m.name).join(", ")}</span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {archived.length ? (
        <Disclosure summary={`${archived.length} archived`} className="mt-6">
          <ul className="grid gap-1 text-sm">
            {archived.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="hover:underline">
                  {p.name}
                </Link>{" "}
                <span className="text-muted-foreground">· {p.code}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </>
  );
}
