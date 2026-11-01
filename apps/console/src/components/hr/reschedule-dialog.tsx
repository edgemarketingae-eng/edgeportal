"use client";

import type { AdvanceDto } from "@edge/contracts";
import { formatPayAmount } from "@edge/domain/hr/pay";
import { toMajor } from "@edge/domain/money";
import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Input } from "@edge/ui/components/input";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { rescheduleAdvanceAction } from "@/lib/actions/hr";

/** The months still to repay. They must add up to what's owed; repaid months don't move. */
export function RescheduleDialog({ advance }: { advance: AdvanceDto }) {
  const start = advance.installments
    .filter((i) => i.status === "SCHEDULED")
    .map((i) => ({ month: i.month, amount: String(toMajor(i.amountMinor)) }));
  const [rows, setRows] = useState(start);
  const set = (n: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((r, i) => (i === n ? { ...r, ...patch } : r)));
  return (
    <div className="pt-1">
      <ActionDialog
        action={rescheduleAdvanceAction}
        hidden={{ id: advance.id, installments: JSON.stringify(rows) }}
        title="Change repayment"
        description={`The months must add up to ${formatPayAmount(advance.remainingMinor, advance.currency)}.`}
        submitLabel="Save"
        trigger={
          <Button size="sm" variant="outline">
            Change repayment
          </Button>
        }
      >
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input aria-label="Month, YYYY-MM" placeholder="2026-11" value={r.month} onChange={(e) => set(i, { month: e.target.value })} />
            <Input aria-label="Amount" inputMode="decimal" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove month"
              onClick={() => setRows(rows.filter((_, n) => n !== i))}
            >
              <X />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setRows([...rows, { month: "", amount: "" }])}>
          <Plus /> Add a month
        </Button>
      </ActionDialog>
    </div>
  );
}
