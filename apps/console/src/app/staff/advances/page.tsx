import { hrRoutes } from "@edge/contracts";
import { formatDate } from "@edge/domain/dates";
import { formatMonth } from "@edge/domain/hr/calendar";
import { formatPayAmount } from "@edge/domain/hr/pay";
import { ActionButton, ActionDialog } from "@edge/ui/blocks/action-dialog";
import { EmptyState } from "@edge/ui/blocks/empty-state";
import { AdvanceStatusBadge } from "@edge/ui/blocks/status-badges";
import { Alert, AlertDescription } from "@edge/ui/components/alert";
import { Button } from "@edge/ui/components/button";
import { Card, CardContent } from "@edge/ui/components/card";
import { Textarea } from "@edge/ui/components/textarea";
import { Field } from "@edge/ui/forms/field";
import { PageHeader } from "@edge/ui/shell/app-shell";
import { api } from "@edge/web/server";
import { HandCoins } from "lucide-react";
import type { Metadata } from "next";
import { NotSetUp } from "@/components/hr/shared";
import { requestAdvanceAction, withdrawAdvanceAction } from "@/lib/actions/hr";
import { load, requireStaff } from "@/lib/load";

export const metadata: Metadata = { title: "Salary advance" };

export default async function MyAdvancesPage() {
  await requireStaff();
  const a = await load(() => api(hrRoutes.myAdvances));
  return (
    <>
      <PageHeader
        help="/staff/docs/advances"
        title="Salary advance"
        actions={
          a.currency ? (
            <ActionDialog
              action={requestAdvanceAction}
              hidden={{}}
              title="Request an advance"
              description="HR decides the amount and how it's repaid from your salary."
              submitLabel="Send request"
              trigger={<Button size="sm">Request an advance</Button>}
            >
              <Field label={`Amount (${a.currency})`} name="amount" inputMode="decimal" required />
              <Field label="Reason" name="reason">
                <Textarea id="reason" name="reason" rows={3} />
              </Field>
            </ActionDialog>
          ) : null
        }
      />
      {!a.setUp ? <NotSetUp /> : null}
      {a.setUp && !a.currency ? (
        <Alert>
          <AlertDescription>HR hasn&apos;t set your salary yet, so you can&apos;t request an advance.</AlertDescription>
        </Alert>
      ) : null}
      {a.setUp && a.currency ? (
        a.rows.length === 0 ? (
          <Card>
            <EmptyState icon={<HandCoins />} title="No advances yet." />
          </Card>
        ) : (
          <div className="grid gap-4">
            {a.rows.map((r) => (
              <Card key={r.id}>
                <CardContent className="grid gap-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-base font-semibold tabular-nums">{formatPayAmount(r.amountMinor, r.currency)}</span>
                    <AdvanceStatusBadge status={r.status} />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    Requested {formatDate(r.createdAt)}
                    {r.paidOn ? `, paid ${formatDate(r.paidOn)}` : ""}
                    {r.status === "APPROVED" ? `, ${formatPayAmount(r.remainingMinor, r.currency)} left to repay` : ""}
                  </p>
                  {r.reason ? <p>{r.reason}</p> : null}
                  {r.decisionNote ? <p className="text-muted-foreground">HR: {r.decisionNote}</p> : null}
                  {r.installments.length ? (
                    <ul className="divide-y">
                      {r.installments.map((i) => (
                        <li key={i.month} className="flex justify-between gap-3 py-1.5">
                          <span>{formatMonth(i.month)}</span>
                          <span className="tabular-nums">
                            {formatPayAmount(i.amountMinor, r.currency)} {i.status === "DEDUCTED" ? "(repaid)" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {r.status === "PENDING" ? (
                    <div>
                      <ActionButton action={withdrawAdvanceAction} hidden={{ id: r.id }} variant="outline">
                        Withdraw
                      </ActionButton>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : null}
    </>
  );
}
