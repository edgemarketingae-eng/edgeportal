import { hrRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { ALLOWED_FILE_TYPES, FILE_ACCEPT } from "@edge/domain/files";
import { HR_REQUEST_STATUSES } from "@edge/domain/hr/enums";
import { HR_REQUEST_LABELS, HR_REQUEST_STATUS_LABELS } from "@edge/domain/hr/labels";
import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { EmptyState } from "@edge/ui/blocks/empty-state";
import { FilterBar, FilterResults, FilterSelect } from "@edge/ui/blocks/filter-bar";
import { Pagination } from "@edge/ui/blocks/pagination";
import { HrRequestStatusBadge } from "@edge/ui/blocks/status-badges";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent } from "@edge/ui/components/card";
import { Select } from "@edge/ui/components/select";
import { Textarea } from "@edge/ui/components/textarea";
import { Field } from "@edge/ui/forms/field";
import { FileInput } from "@edge/ui/forms/file-input";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { FileLink } from "@/components/hr/shared";
import { replyRequestAction } from "@/lib/actions/hr";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Requests inbox" };

type Status = (typeof HR_REQUEST_STATUSES)[number];

export default async function RequestsInboxPage(props: PageProps<"/staff/hr/requests">) {
  await requireStaff("hr.manage");
  const sp = await props.searchParams;
  const status = HR_REQUEST_STATUSES.includes(sp.status as Status) ? (sp.status as Status) : undefined;
  const page = await load(() =>
    api(hrRoutes.requests, { query: { status, page: Number(sp.page) || 1, pageSize: Number(sp.pageSize) || 50 } }),
  );
  return (
    <>
      <PageHeader help="/staff/docs/hr-requests" title="Requests inbox" />
      <FilterBar search={false}>
        <FilterSelect
          name="status"
          label="Status"
          value={status}
          options={HR_REQUEST_STATUSES.map((s) => [s, HR_REQUEST_STATUS_LABELS[s]])}
        />
      </FilterBar>
      <FilterResults>
        {page.rows.length === 0 ? (
          <Card>
            <EmptyState icon={<Inbox />} title="No requests here." />
          </Card>
        ) : (
          <div className="grid gap-4">
            {page.rows.map((r) => (
              <Card key={r.id}>
                <CardContent className="grid gap-1.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">
                      {r.employee.name}: {r.subject}
                    </span>
                    <HrRequestStatusBadge status={r.status} />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {HR_REQUEST_LABELS[r.type]}, {formatDate(r.createdAt)}
                  </p>
                  {r.details ? <p className="whitespace-pre-wrap">{r.details}</p> : null}
                  {r.attachment ? <FileLink file={r.attachment} /> : null}
                  {r.reply ? <p className="bg-muted/50 rounded-md p-2 whitespace-pre-wrap">Reply: {r.reply}</p> : null}
                  {r.replyFile ? <FileLink file={r.replyFile} /> : null}
                  {r.status === "OPEN" || r.status === "IN_PROGRESS" ? (
                    <div className="pt-1">
                      <ActionDialog
                        action={replyRequestAction}
                        hidden={{ id: r.id, ownerId: r.employee.id }}
                        size="md"
                        title={`Reply to ${r.employee.name}`}
                        submitLabel="Save"
                        trigger={
                          <Button size="sm" variant="outline">
                            Reply
                          </Button>
                        }
                      >
                        <Field label="Status" name="status">
                          <Select id="status" name="status" defaultValue="DONE">
                            {HR_REQUEST_STATUSES.filter((s) => s !== "OPEN").map((s) => (
                              <option key={s} value={s}>
                                {HR_REQUEST_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Reply" name="reply">
                          <Textarea id="reply" name="reply" rows={3} defaultValue={r.reply ?? ""} />
                        </Field>
                        <Field label="Letter or document" name="attachment">
                          <FileInput id="attachment" name="attachment" accept={FILE_ACCEPT} hint={`${ALLOWED_FILE_TYPES}, up to 5 MB`} />
                        </Field>
                      </ActionDialog>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} noun="requests" />
      </FilterResults>
    </>
  );
}
