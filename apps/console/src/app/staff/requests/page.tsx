import { hrRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { HR_REQUEST_TYPES } from "@edge/domain/hr/enums";
import { HR_REQUEST_LABELS } from "@edge/domain/hr/labels";
import { ALLOWED_FILE_TYPES, FILE_ACCEPT } from "@edge/domain/files";
import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { EmptyState } from "@edge/ui/blocks/empty-state";
import { HrRequestStatusBadge } from "@edge/ui/blocks/status-badges";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent } from "@edge/ui/components/card";
import { Select } from "@edge/ui/components/select";
import { Textarea } from "@edge/ui/components/textarea";
import { Field } from "@edge/ui/forms/field";
import { FileInput } from "@edge/ui/forms/file-input";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import { FileLink } from "@/components/hr/shared";
import { createHrRequestAction } from "@/lib/actions/hr";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "HR requests" };

export default async function MyRequestsPage() {
  await requireStaff();
  const [rows, home] = await Promise.all([load(() => api(hrRoutes.myRequests)), load(() => api(hrRoutes.home))]);
  return (
    <>
      <PageHeader
        help="/staff/docs/requests"
        title="HR requests"
        description="Salary certificates, NOCs, letters and anything else you need from HR."
        actions={
          home.setUp ? (
            <ActionDialog
              action={createHrRequestAction}
              hidden={{}}
              size="md"
              title="New HR request"
              submitLabel="Send request"
              trigger={<Button size="sm">New request</Button>}
            >
              <Field label="What do you need?" name="type">
                <Select id="type" name="type" defaultValue="SALARY_CERTIFICATE">
                  {HR_REQUEST_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {HR_REQUEST_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Subject" name="subject" required hint="For example: for my bank loan application." />
              <Field label="Details" name="details">
                <Textarea id="details" name="details" rows={3} />
              </Field>
              <Field label="Attachment (optional)" name="attachment">
                <FileInput id="attachment" name="attachment" accept={FILE_ACCEPT} hint={`${ALLOWED_FILE_TYPES}, up to 5 MB`} />
              </Field>
            </ActionDialog>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={<MessageSquare />} title="No requests yet." />
        </Card>
      ) : (
        <div className="grid gap-4">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="grid gap-1.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{r.subject}</span>
                  <HrRequestStatusBadge status={r.status} />
                </div>
                <p className="text-muted-foreground text-xs">
                  {HR_REQUEST_LABELS[r.type]}, {formatDate(r.createdAt)}
                </p>
                {r.details ? <p className="whitespace-pre-wrap">{r.details}</p> : null}
                {r.attachment ? <FileLink file={r.attachment} /> : null}
                {r.reply ? <p className="bg-muted/50 rounded-md p-2 whitespace-pre-wrap">HR: {r.reply}</p> : null}
                {r.replyFile ? <FileLink file={r.replyFile} /> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
