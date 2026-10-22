import { formatMoney } from "@edge/domain/money";

export function PaymentProgress({ paidMinor, feeMinor, currency }: { paidMinor: number; feeMinor: number; currency: string }) {
  const pct = feeMinor > 0 ? Math.min(100, Math.round((paidMinor / feeMinor) * 100)) : 0;
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">{formatMoney(paidMinor, currency)} paid</span>
        <span className="text-muted-foreground">of {formatMoney(feeMinor, currency)}</span>
      </div>
      <div className="bg-muted h-2 overflow-hidden rounded-full" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="bg-edge-green h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-muted-foreground text-xs">Course fee excluding VAT and payment processing fees.</p>
    </div>
  );
}
