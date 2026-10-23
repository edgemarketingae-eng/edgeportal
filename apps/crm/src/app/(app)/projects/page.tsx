import { crmRoutes } from "@edge/contracts";
import { PROJECT_STATUS_LABELS } from "@edge/domain/crm/labels";
import { formatDate } from "@edge/domain/dates";
import { Badge } from "@edge/ui/components/badge";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { can, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const v = await requireCrm("crm.read");
  const projects = await load(() => api(crmRoutes.projects, { query: {} }));
  const active = projects.filter((p) => p.status !== "ARCHIVED");
  const archived = projects.filter((p) => p.status === "ARCHIVED");
  return (
    <>
      <PageHeader
        title="Projects"
        description="Sales campaigns with their own team. A project manager runs everything inside; executives work their own leads and the project's pool."
        actions={
          can(v, "crm.projects.manage") ? (
            <Button asChild size="sm">
              <Link href="/projects/new">
                <Plus /> New project
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {active.map((p) => (
          <Card key={p.id} className={p.isDefault ? "border-dashed" : undefined}>
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
                {p.startDate || p.endDate ? ` · ${p.startDate ? formatDate(p.startDate) : "…"} – ${p.endDate ? formatDate(p.endDate) : "…"}` : ""}
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
                    {p.targetConversions ? <span className="text-muted-foreground text-sm font-normal"> / {p.targetConversions}</span> : null}
                  </p>
                  <p className="text-muted-foreground text-xs">converted this month</p>
                </div>
                <div>
                  <p className={`text-2xl font-bold tabular-nums ${p.stats.overdueTasks ? "text-destructive" : ""}`}>{p.stats.overdueTasks}</p>
                  <p className="text-muted-foreground text-xs">overdue tasks</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">{PROJECT_STATUS_LABELS[p.status]}</Badge>
                {p.isDefault ? <Badge variant="outline">Open to everyone</Badge> : <Badge variant="outline">{p.stats.team} on the team</Badge>}
                {p.managers.length ? <span className="text-muted-foreground text-xs">PM: {p.managers.map((m) => m.name).join(", ")}</span> : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {archived.length ? (
        <details className="mt-6">
          <summary className="text-muted-foreground cursor-pointer text-sm">{archived.length} archived</summary>
          <ul className="mt-2 grid gap-1 text-sm">
            {archived.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="hover:underline">
                  {p.name}
                </Link>{" "}
                <span className="text-muted-foreground">· {p.code}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
