"use client";

import { formatPayAmount, formatPayTotal, type CurrencyTotal } from "@edge/domain/hr/pay";
import { useState, type PointerEvent } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../components/popover";

export interface PayAmountLine {
  label: string;
  currency: string;
  amountMinor: number;
}

/**
 * A total like "3,000 AED + 500 USD" that opens its breakdown: on hover with a mouse, and on tap on a phone, where a
 * tooltip would never open. Currencies are listed side by side and never added together.
 */
export function PayAmount({ totals, lines }: { totals: CurrencyTotal[]; lines: PayAmountLine[] }) {
  const [open, setOpen] = useState(false);
  const hover = (next: boolean) => (e: PointerEvent) => {
    if (e.pointerType === "mouse") setOpen(next);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
        className="decoration-muted-foreground/50 focus-visible:ring-ring/50 rounded-sm text-left font-semibold whitespace-nowrap tabular-nums underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2"
      >
        {formatPayTotal(totals)}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 gap-1.5"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
      >
        {lines.length === 0 ? <p className="text-muted-foreground text-sm">Nothing this month.</p> : null}
        {lines.map((l, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-muted-foreground min-w-0">{l.label}</span>
            <span className="whitespace-nowrap tabular-nums">{formatPayAmount(l.amountMinor, l.currency)}</span>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
