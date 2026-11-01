import type { PayslipDto } from "@edge/contracts";
import { formatMonth } from "@edge/domain/hr/calendar";
import { formatDays } from "@edge/domain/hr/leave";
import { formatPayAmount, formatPayTotal } from "@edge/domain/hr/pay";
import { Card, CardContent } from "@edge/ui/components/card";

/** The full payslip: every line in its own currency, nothing converted. */
export function PayslipCard({ slip }: { slip: PayslipDto }) {
  const a = slip.attendance;
  return (
    <Card>
      <CardContent className="grid gap-5 text-sm">
        <div>
          <p className="text-base font-semibold">{slip.employee.name}</p>
          <p className="text-muted-foreground">
            {[slip.employee.title, slip.employee.department].filter(Boolean).join(", ") || formatMonth(slip.month)}
          </p>
        </div>
        <ul className="divide-y">
          {slip.lines.map((l) => (
            <li key={l.id} className="flex items-baseline justify-between gap-4 py-2">
              <span>{l.label}</span>
              <span className="whitespace-nowrap tabular-nums">{formatPayAmount(l.amountMinor, l.currency)}</span>
            </li>
          ))}
          <li className="flex items-baseline justify-between gap-4 py-2 font-semibold">
            <span>Total</span>
            <span className="whitespace-nowrap tabular-nums">{formatPayTotal(slip.totals)}</span>
          </li>
        </ul>
        {a ? (
          <p className="text-muted-foreground text-xs">
            Attendance: {a.present} present, {a.late} late, {a.halfDay} half days, {a.absent} absent, {a.leave} on leave
            {a.unpaidLeaveCenti ? ` (${formatDays(a.unpaidLeaveCenti)} unpaid)` : ""}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
