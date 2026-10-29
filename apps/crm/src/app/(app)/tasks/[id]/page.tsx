import { crmRoutes } from "@edge/contracts";
import { FOLLOWUP_TYPE_LABELS } from "@edge/domain/crm/labels";
import { formatDateTime } from "@edge/domain/dates";
import { TaskPriorityBadge, TaskStatusBadge } from "@edge/ui/blocks/status-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@edge/ui/components/card";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import Link from "next/link";
import { FollowUpDue, TimeAgo } from "@/components/crm/due";
import { CancelTaskButton, CompleteTaskDialog, RescheduleTaskDialog } from "@/components/crm/task-actions";
import { TaskCommentForm, TaskForm } from "@/components/crm/task-form";
import { can, load, requireCrm } from "@/lib/load";

export const metadata: Metadata = { title: "Task" };

export default async function TaskDetailPage(props: PageProps<"/tasks/[id]">) {
  const v = await requireCrm("crm.read");
  const { id } = await props.params;
  const detail = await load(() => api(crmRoutes.task, { params: { id } }));
  const t = detail.task;
  const open = t.status === "TODO" || t.status === "IN_PROGRESS" || t.status === "WAITING";
  const canWrite = can(v, "crm.write") && detail.canEdit;
  return (
    <>
      <PageHeader
        help="/docs/tasks"
        back={{ href: "/tasks", label: "Tasks" }}
        title={t.title}
        description={
          <>
            <Link href={`/projects/${t.project.id}`} className="hover:underline">
              {t.project.name}
            </Link>
            {t.leadName ? (
              <>
                {" "}
                ·{" "}
                <Link href={`/leads/${t.leadId}`} className="hover:underline">
                  {t.leadName}
                </Link>
              </>
            ) : null}{" "}
            · {FOLLOWUP_TYPE_LABELS[t.type]} · created by {t.createdBy?.name ?? "system"} <TimeAgo at={t.createdAt} />
          </>
        }
        actions={
          canWrite && open ? (
            <>
              <CompleteTaskDialog taskId={t.id} type={t.type} title={t.title} lead={!!t.leadId} />
              <RescheduleTaskDialog taskId={t.id} dueAt={t.dueAt} />
              <CancelTaskButton taskId={t.id} />
            </>
          ) : null
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Task</CardTitle>
          </CardHeader>
          <CardContent>
            {canWrite ? (
              <TaskForm detail={detail} />
            ) : (
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Details</dt>
                  <dd className="whitespace-pre-wrap">{t.description ?? "–"}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>
        <div className="grid h-fit gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <div className="flex flex-wrap gap-1.5">
                <TaskStatusBadge status={t.status} />
                <TaskPriorityBadge priority={t.priority} />
              </div>
              <p>
                <span className="text-muted-foreground">Due: </span>
                {t.dueAt ? <FollowUpDue at={t.dueAt} /> : "no due date"}
              </p>
              <p>
                <span className="text-muted-foreground">Assigned to: </span>
                {t.assignee?.name ?? "nobody yet"}
              </p>
              {t.completedAt ? (
                <p>
                  <span className="text-muted-foreground">Closed: </span>
                  {formatDateTime(t.completedAt)}
                </p>
              ) : null}
              <Link href={`/tasks?project=${t.project.id}`} className="text-edge-emerald text-xs font-semibold hover:underline">
                Open the board
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Comments</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {detail.comments.length === 0 ? <p className="text-muted-foreground text-sm">No comments yet.</p> : null}
              <ul className="grid gap-3 text-sm">
                {detail.comments.map((c) => (
                  <li key={c.id} className="rounded-lg border p-3">
                    <p className="whitespace-pre-wrap">{c.body}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {c.author?.name ?? "Unknown"} · <TimeAgo at={c.createdAt} />
                    </p>
                  </li>
                ))}
              </ul>
              {can(v, "crm.write") ? <TaskCommentForm taskId={t.id} /> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
