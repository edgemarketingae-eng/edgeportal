import { crmRoutes, type TaskDto } from "@edge/contracts";
import { TASK_PRIORITIES } from "@edge/domain/crm/enums";
import { FOLLOWUP_TYPE_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@edge/domain/crm/labels";
import { daysUntil, dubaiDateOnly, formatDateTime } from "@edge/domain/dates";
import { FilterBar, FilterSelect } from "@edge/ui/blocks/filter-bar";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { FollowUpDue } from "@/components/crm/due";
import { AddTaskDialog, CancelTaskButton, CompleteTaskDialog, RescheduleTaskDialog } from "@/components/crm/task-actions";
import { TaskBoard } from "@/components/crm/task-board";
import { can, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Tasks" };

type Group = "Overdue" | "Today" | "This week" | "Later" | "No date";
function groupOf(t: TaskDto, now: Date): Group {
  if (!t.dueAt) return "No date";
  const d = daysUntil(dubaiDateOnly(new Date(t.dueAt)), now);
  return d < 0 ? "Overdue" : d === 0 ? "Today" : d < 7 ? "This week" : "Later";
}

export default async function TasksPage(props: PageProps<"/tasks">) {
  const v = await requireCrm("crm.read");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" && sp[k] ? sp[k] : undefined);
  const view = sp.view === "list" ? "list" : "board";
  const status = sp.status === "done" ? "done" : "open";
  const filters = { project: one("project"), assignee: one("assignee"), priority: TASK_PRIORITIES.find((p) => p === one("priority")) };
  const canWrite = can(v, "crm.write");
  const options = await load(() => api(crmRoutes.options));
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, x]) => typeof x === "string" && x && k !== "view" && k !== "status") as [string, string][]);
  const link = (extra: Record<string, string>) => `/tasks?${new URLSearchParams({ ...Object.fromEntries(qs), ...extra }).toString()}`;
  const assignees = uniq(Object.values(options.teams).flat());

  const header = (
    <>
      <PageHeader
        title="Tasks"
        description={view === "board" ? "Drag cards between columns to change their status" : status === "open" ? "Open tasks by due date" : "Recently closed"}
        actions={
          <>
            <Button asChild size="sm" variant={view === "board" ? "default" : "outline"}>
              <Link href={link({ view: "board" })}>Board</Link>
            </Button>
            <Button asChild size="sm" variant={view === "list" ? "default" : "outline"}>
              <Link href={link({ view: "list" })}>List</Link>
            </Button>
            {canWrite ? <AddTaskDialog options={options} meId={v.user.id} label="New task" /> : null}
          </>
        }
      />
      <FilterBar search={false}>
        <input type="hidden" name="view" value={view} />
        {status === "done" ? <input type="hidden" name="status" value="done" /> : null}
        <FilterSelect name="project" label="Project" value={filters.project} options={options.projects.map((p) => [p.id, p.name])} />
        <FilterSelect name="assignee" label="Assignee" value={filters.assignee} options={[["me", "Me"], ["unassigned", "Unassigned"], ...assignees.map((a) => [a.id, a.name] as [string, string])]} />
        <FilterSelect name="priority" label="Priority" value={filters.priority} options={TASK_PRIORITIES.map((p) => [p, TASK_PRIORITY_LABELS[p]])} />
      </FilterBar>
    </>
  );

  if (view === "board") {
    const board = await load(() => api(crmRoutes.board, { query: filters }));
    return (
      <>
        {header}
        <TaskBoard board={board} canWrite={canWrite} />
      </>
    );
  }

  const tasks = await load(() => api(crmRoutes.tasks, { query: { ...filters, scope: "all", status } }));
  const now = new Date();
  const groups: Group[] = ["Overdue", "Today", "This week", "Later", "No date"];
  const grouped = new Map<Group, TaskDto[]>(groups.map((g) => [g, []]));
  if (status === "open") for (const t of tasks) grouped.get(groupOf(t, now))!.push(t);
  const row = (t: TaskDto) => (
    <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-medium">
          <Link href={`/tasks/${t.id}`} className="text-edge-emerald hover:underline">
            {t.title}
          </Link>
          <span className="text-muted-foreground">
            {" "}
            · {FOLLOWUP_TYPE_LABELS[t.type]} · {TASK_PRIORITY_LABELS[t.priority]}
            {t.leadName ? (
              <>
                {" "}
                ·{" "}
                <Link href={`/leads/${t.leadId}`} className="hover:underline">
                  {t.leadName}
                </Link>
              </>
            ) : (
              ` · ${t.project.name}`
            )}
          </span>
        </p>
        <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
          {status === "open" ? t.dueAt ? <FollowUpDue at={t.dueAt} /> : <span>no due date</span> : <span>{t.completedAt ? `${TASK_STATUS_LABELS[t.status]} ${formatDateTime(t.completedAt)}` : TASK_STATUS_LABELS[t.status]}</span>}
          {t.assignee ? <span>· {t.assignee.name}</span> : <span>· unassigned</span>}
        </p>
      </div>
      {canWrite && status === "open" ? (
        <div className="flex flex-wrap gap-1">
          <CompleteTaskDialog taskId={t.id} type={t.type} title={t.title} lead={!!t.leadId} />
          <RescheduleTaskDialog taskId={t.id} dueAt={t.dueAt} />
          <CancelTaskButton taskId={t.id} />
        </div>
      ) : null}
    </li>
  );

  return (
    <>
      {header}
      <div className="mb-3 flex gap-2">
        <Button asChild size="sm" variant={status === "open" ? "default" : "outline"}>
          <Link href={link({ view: "list" })}>Open</Link>
        </Button>
        <Button asChild size="sm" variant={status === "done" ? "default" : "outline"}>
          <Link href={link({ view: "list", status: "done" })}>Closed</Link>
        </Button>
      </div>
      {status === "done" ? (
        <Card>
          <CardContent className="pt-6">{tasks.length ? <ul className="divide-y text-sm">{tasks.map(row)}</ul> : <p className="text-muted-foreground text-sm">Nothing closed yet.</p>}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {groups.map((g) => {
            const list = grouped.get(g)!;
            if (!list.length && g !== "Today") return null;
            return (
              <Card key={g} className={g === "Overdue" && list.length ? "border-destructive/40" : undefined}>
                <CardHeader>
                  <CardTitle>
                    {g} <span className="text-muted-foreground text-sm font-normal">({list.length})</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>{list.length ? <ul className="divide-y text-sm">{list.map(row)}</ul> : <p className="text-muted-foreground text-sm">Nothing due today.</p>}</CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function uniq(list: { id: string; name: string }[]) {
  const seen = new Map<string, { id: string; name: string }>();
  for (const x of list) if (x.id && !seen.has(x.id)) seen.set(x.id, x);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
