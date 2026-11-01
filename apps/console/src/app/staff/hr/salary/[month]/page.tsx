import { hrRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { formatMonth } from "@edge/domain/hr/calendar";
import { PAY_CURRENCIES } from "@edge/domain/hr/enums";
import { formatPayAmount, formatPayTotal } from "@edge/domain/hr/pay";
import { ActionButton, ActionDialog } from "@edge/ui/blocks/action-dialog";
import { TableEmpty } from "@edge/ui/blocks/empty-state";
import { PayAmount } from "@edge/ui/blocks/pay-amount";
import { Alert, AlertDescription } from "@edge/ui/components/alert";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent } from "@edge/ui/components/card";
import { Select } from "@edge/ui/components/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@edge/ui/components/table";
import { Field } from "@edge/ui/forms/field";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { X } from "lucide-react";
import type { Metadata } from "next";
import { addLineAction, closeMonthAction, refreshMonthAction, removeLineAction } from "@/lib/actions/hr";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Salary month" };

export default async function SalaryMonthPage(props: PageProps<"/staff/hr/salary/[month]">) {
  await requireStaff("hr.payroll");
  const { month } = await props.params;
  const m = await load(() => api(hrRoutes.payrollMonth, { params: { month } }));
  const draft = m.status === "DRAFT";
  const blocked = m.warnings.some((w) => w.blocking);
  return (
    <>
      <PageHeader
        back={{ href: "/staff/hr/salary", label: "Salary months" }}
        help="/staff/docs/hr-salary"
        title={formatMonth(m.month)}
        description={
          draft ? `Draft. Total ${formatPayTotal(m.totals)}.` : `Closed ${formatDate(m.closedAt!)}. Total ${formatPayTotal(m.totals)}.`
        }
        actions={
          draft ? (
            <>
              <ActionButton action={refreshMonthAction} hidden={{ month: m.month }} variant="outline">
                Refresh figures
              </ActionButton>
              <ActionDialog
                action={closeMonthAction}
                hidden={{ month: m.month }}
                title={`Close ${formatMonth(m.month)}?`}
                description="This is final. Staff get their payslips, attendance for the month locks and advance installments are marked repaid. Fixes go on next month."
                submitLabel="Close month"
                trigger={
                  <Button size="sm" disabled={blocked}>
                    Close month
                  </Button>
                }
              />
            </>
          ) : null
        }
      />
      {m.warnings.length ? (
        <div className="mb-6 grid gap-2">
          {m.warnings.map((w, i) => (
            <Alert key={i} variant={w.blocking ? "destructive" : "default"}>
              <AlertDescription>
                <b>{w.employee.name}:</b> {w.message}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      ) : null}
      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Total</TableHead>
              <TableHead className="hidden lg:table-cell">Attendance</TableHead>
              {draft ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {m.payslips.length === 0 ? <TableEmpty colSpan={draft ? 4 : 3} title="Nobody is due a payslip this month." /> : null}
            {m.payslips.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="align-top whitespace-normal">
                  <span className="font-medium">{s.employee.name}</span>
                  {s.employee.department ? <div className="text-muted-foreground text-xs">{s.employee.department}</div> : null}
                  {draft
                    ? s.lines
                        .filter((l) => l.source === "MANUAL")
                        .map((l) => (
                          <div key={l.id} className="text-muted-foreground flex items-center gap-1 text-xs">
                            {l.label}: {formatPayAmount(l.amountMinor, l.currency)}
                            <ActionButton action={removeLineAction} hidden={{ id: s.id, lineId: l.id }} variant="ghost" size="sm">
                              <X aria-label="Remove line" />
                            </ActionButton>
                          </div>
                        ))
                    : null}
                </TableCell>
                <TableCell className="align-top">
                  <PayAmount totals={s.totals} lines={s.lines} />
                </TableCell>
                <TableCell className="text-muted-foreground hidden align-top text-xs lg:table-cell">
                  {s.attendance
                    ? `${s.attendance.present} present, ${s.attendance.absent} absent, ${s.attendance.late} late, ${s.attendance.leave} leave`
                    : "-"}
                </TableCell>
                {draft ? (
                  <TableCell className="text-right align-top">
                    <ActionDialog
                      action={addLineAction}
                      hidden={{ id: s.id }}
                      title={`Add a line for ${s.employee.name}`}
                      submitLabel="Add"
                      trigger={
                        <Button size="sm" variant="outline">
                          Add line
                        </Button>
                      }
                    >
                      <Field label="Type" name="kind">
                        <Select id="kind" name="kind" defaultValue="BONUS">
                          <option value="BONUS">Bonus</option>
                          <option value="DEDUCTION">Deduction</option>
                        </Select>
                      </Field>
                      <Field label="What it's for" name="label" required />
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Amount" name="amount" inputMode="decimal" required />
                        <Field label="Currency" name="currency">
                          <Select id="currency" name="currency" defaultValue={s.lines[0]?.currency ?? "AED"}>
                            {PAY_CURRENCIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                    </ActionDialog>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {!draft ? (
        <Card className="mt-6">
          <CardContent className="text-muted-foreground text-sm">
            Closed months are final. Put any fix on the next month as a bonus or deduction.
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
