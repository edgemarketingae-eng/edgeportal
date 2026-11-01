import { hrRoutes } from "@edge/contracts";
import { ALLOWED_FILE_TYPES, FILE_ACCEPT } from "@edge/domain/files";
import { formatDate } from "@edge/domain/dates";
import { LEAVE_LEDGER_LABELS } from "@edge/domain/hr/labels";
import { formatDays } from "@edge/domain/hr/leave";
import { ActionButton, ActionDialog } from "@edge/ui/blocks/action-dialog";
import { StatCard } from "@edge/ui/blocks/stat-card";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@edge/ui/components/card";
import { Select } from "@edge/ui/components/select";
import { Field } from "@edge/ui/forms/field";
import { FileInput } from "@edge/ui/forms/file-input";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import type { Metadata } from "next";
import { LeaveDialog } from "@/components/hr/leave-dialog";
import { FileLink } from "@/components/hr/shared";
import { EmployeeForm, PayForm } from "@/components/hr/team-forms";
import { addDocumentAction, adjustBalanceAction, fileLeaveAction, removeDocumentAction } from "@/lib/actions/hr";
import { can, load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Team member" };

export default async function TeamMemberPage(props: PageProps<"/staff/hr/team/[id]">) {
  const v = await requireStaff("hr.manage");
  const { id } = await props.params;
  const [m, settings] = await Promise.all([
    load(() => api(hrRoutes.member, { params: { id } })),
    can(v, "hr.settings") ? load(() => api(hrRoutes.settings)) : null,
  ]);
  const seesPay = can(v, "hr.payroll") && !!m.record;
  const [pay, leave] = await Promise.all([
    seesPay ? load(() => api(hrRoutes.pay, { params: { id } })) : null,
    m.record ? load(() => api(hrRoutes.memberLeave, { params: { id } })) : null,
  ]);
  const balanced = leave?.balances.filter((b) => b.tracksBalance) ?? [];
  return (
    <>
      <PageHeader
        back={{ href: "/staff/hr/team", label: "Team" }}
        help="/staff/docs/hr-team"
        title={m.name}
        description={`${m.email}${m.title ? `, ${m.title}` : ""}${m.disabled ? ", login disabled" : ""}`}
      />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>HR record</CardTitle>
            {!m.record ? (
              <CardDescription>Enter the joining date to set this person up. Leave starts accruing the month after set-up.</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            <EmployeeForm key={JSON.stringify(m.record)} id={m.id} record={m.record} leaveTypes={settings?.leaveTypes ?? null} />
          </CardContent>
        </Card>
        {pay ? (
          <Card>
            <CardHeader>
              <CardTitle>Pay</CardTitle>
              <CardDescription>A change applies from the month you choose. Closed months never change.</CardDescription>
            </CardHeader>
            <CardContent>
              <PayForm key={pay.revisions[0]?.id ?? "new"} id={m.id} current={pay.revisions[0] ?? null} earliestMonth={pay.earliestMonth} />
            </CardContent>
          </Card>
        ) : null}
        {leave ? (
          <Card>
            <CardHeader>
              <CardTitle>Leave in {leave.year}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {balanced.map((b) => (
                  <StatCard key={b.typeKey} label={b.name} value={formatDays(b.balanceCenti)} hint={`${formatDays(b.takenCenti)} taken`} />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionDialog
                  action={adjustBalanceAction}
                  hidden={{ id: m.id }}
                  title="Adjust balance"
                  description="Use this for opening balances and corrections. A minus takes days off."
                  submitLabel="Adjust"
                  trigger={
                    <Button size="sm" variant="outline">
                      Adjust balance
                    </Button>
                  }
                >
                  <Field label="Leave type" name="typeKey">
                    <Select id="typeKey" name="typeKey">
                      {balanced.map((b) => (
                        <option key={b.typeKey} value={b.typeKey}>
                          {b.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Days" name="days" required hint="For example 12, 1.5 or -3." />
                  <Field id="adjust-note" label="Why" name="note" required />
                </ActionDialog>
                <LeaveDialog
                  action={fileLeaveAction}
                  hidden={{ id: m.id }}
                  types={leave.balances.filter((b) => b.active)}
                  title={`File leave for ${m.name}`}
                  triggerLabel="File leave"
                  variant="outline"
                />
              </div>
              {leave.ledger.length ? (
                <ul className="divide-y text-sm">
                  {leave.ledger.slice(0, 15).map((row) => (
                    <li key={row.id} className="flex items-baseline justify-between gap-3 py-2">
                      <span className="min-w-0">
                        {LEAVE_LEDGER_LABELS[row.kind]}: {row.typeName} ({row.leaveYear})
                        <span className="text-muted-foreground block text-xs">
                          {[row.note, row.by, formatDate(row.createdAt)].filter(Boolean).join(", ")}
                        </span>
                      </span>
                      <span className="whitespace-nowrap tabular-nums">
                        {row.centiDays > 0 ? "+" : ""}
                        {formatDays(row.centiDays)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        {m.record ? (
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>Contracts, passport and visa copies. The person can open these too.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {m.documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3">
                  <FileLink file={d} />
                  <ActionButton action={removeDocumentAction} hidden={{ id: m.id, fileId: d.id }} variant="ghost">
                    Remove
                  </ActionButton>
                </div>
              ))}
              <div>
                <ActionDialog
                  action={addDocumentAction}
                  hidden={{ id: m.id }}
                  title="Add a document"
                  submitLabel="Upload"
                  trigger={
                    <Button size="sm" variant="outline">
                      Add a document
                    </Button>
                  }
                >
                  <FileInput id="attachment" name="attachment" accept={FILE_ACCEPT} hint={`${ALLOWED_FILE_TYPES}, up to 5 MB`} />
                </ActionDialog>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
