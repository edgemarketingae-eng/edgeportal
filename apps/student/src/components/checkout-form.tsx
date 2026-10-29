"use client";

import type { CheckoutOptionsDto, PublicFeeRate } from "@edge/contracts";
import { formatMoney, toMinor } from "@edge/domain/money";
import { quote, type Quote } from "@edge/domain/payments/fees";
import { Button } from "@edge/ui/components/button";
import { Input } from "@edge/ui/components/input";
import { Label } from "@edge/ui/components/label";
import { FormError, type ActionState } from "@edge/ui/forms/field";
import { cn } from "@edge/ui/lib/utils";
import { CreditCard, ShieldCheck } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { startCheckoutAction } from "@/app/(student)/checkout/actions";

function within(m: PublicFeeRate, total: number) {
  return (m.minTotalMinor == null || total >= m.minTotalMinor) && (m.maxTotalMinor == null || total <= m.maxTotalMinor);
}

/** The advance presets: pill buttons that act as one radio group, big enough to tap. */
const chip = "h-10 rounded-full border px-4 text-sm font-semibold transition-colors";
const chipOn = "border-edge-emerald bg-edge-mint/60 text-edge-emerald";

export function CheckoutForm({ mode, options }: { mode: "first" | "balance"; options: CheckoutOptionsDto }) {
  const { currency, feeMinor, remainingMinor, vatTreatment, courseVatRate, advance, methods } = options;
  const [state, action, pending] = useActionState(startCheckoutAction, {} as ActionState);
  const [kind, setKind] = useState<"FULL" | "ADVANCE" | "BALANCE">(mode === "balance" ? "BALANCE" : "FULL");
  const [preset, setPreset] = useState<number | "custom">(advance.presetsMinor[0] ?? "custom");
  const [custom, setCustom] = useState("");
  const [method, setMethod] = useState(methods[0]?.key ?? "");

  const customMinor = custom ? toMinorSafe(custom) : null;
  const advanceMinor = preset === "custom" ? customMinor : preset;
  const advanceError =
    kind === "ADVANCE" && preset === "custom"
      ? customMinor == null
        ? "Enter an amount"
        : advance.minMinor != null && customMinor < advance.minMinor
          ? `Minimum advance is ${formatMoney(advance.minMinor, currency)}`
          : customMinor >= feeMinor
            ? "For the full amount choose Pay in full"
            : null
      : null;

  const courseMinor = kind === "FULL" ? feeMinor : kind === "BALANCE" ? remainingMinor : advanceError ? null : advanceMinor;

  const quotes = useMemo(() => {
    const out: Record<string, Quote | null> = {};
    for (const m of methods) {
      out[m.key] = courseMinor
        ? quote({ courseMinor, vatTreatment, courseVatRate, rate: { pct: m.pct, fixedMinor: m.fixedMinor, feeVatRate: m.feeVatRate } })
        : null;
    }
    return out;
  }, [courseMinor, methods, vatTreatment, courseVatRate]);

  const selected = quotes[method];
  const selectedMethod = methods.find((m) => m.key === method);
  const methodOk = !!selected && !!selectedMethod && within(selectedMethod, selected.totalMinor);

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-6">
        <FormError state={state} />
        <input type="hidden" name="kind" value={kind} />
        {kind === "ADVANCE" && courseMinor ? <input type="hidden" name="amountMinor" value={courseMinor} /> : null}
        <input type="hidden" name="feeRateKey" value={method} />

        {mode === "first" ? (
          <section className="grid gap-3">
            <h2 className="font-semibold">1. Payment plan</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <PlanCard
                active={kind === "FULL"}
                onClick={() => setKind("FULL")}
                title="Pay in full"
                subtitle={formatMoney(feeMinor, currency)}
                note="Lifetime access to your batch recordings and future live classes."
              />
              {advance.enabled ? (
                <PlanCard
                  active={kind === "ADVANCE"}
                  onClick={() => setKind("ADVANCE")}
                  title="Pay an advance"
                  subtitle={`From ${formatMoney(advance.minMinor ?? 0, currency)}`}
                  note="Full access until the balance due date. Pay the rest later."
                />
              ) : null}
            </div>
            {kind === "ADVANCE" ? (
              <div className="bg-card grid gap-3 rounded-xl border p-4">
                <Label id="advance-label">Advance amount</Label>
                <div role="radiogroup" aria-labelledby="advance-label" className="flex flex-wrap gap-2">
                  {advance.presetsMinor.map((p) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={preset === p}
                      key={p}
                      onClick={() => setPreset(p)}
                      className={cn(chip, preset === p ? chipOn : "bg-card hover:bg-muted")}
                    >
                      {formatMoney(p, currency)}
                    </button>
                  ))}
                  {advance.allowCustom ? (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={preset === "custom"}
                      onClick={() => setPreset("custom")}
                      className={cn(chip, preset === "custom" ? chipOn : "bg-card hover:bg-muted")}
                    >
                      Other amount
                    </button>
                  ) : null}
                </div>
                {preset === "custom" ? (
                  <div className="grid max-w-xs gap-1.5">
                    <Input
                      inputMode="decimal"
                      placeholder={`Minimum ${((advance.minMinor ?? 0) / 100).toFixed(0)}`}
                      value={custom}
                      onChange={(ev) => setCustom(ev.target.value)}
                      aria-invalid={!!advanceError || undefined}
                    />
                    {advanceError ? <p className="text-destructive text-xs">{advanceError}</p> : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : (
          <section className="bg-card rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">Remaining course balance</p>
            <p className="text-2xl font-bold">{formatMoney(remainingMinor, currency)}</p>
          </section>
        )}

        <section className="grid gap-3">
          <h2 className="font-semibold">{mode === "first" ? "2." : "1."} Payment method</h2>
          {methods.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No online payment method is available for your country. Please contact the academy.
            </p>
          ) : null}
          <div className="grid gap-2">
            {methods.map((m) => {
              const q = quotes[m.key];
              const ok = !!q && within(m, q.totalMinor);
              return (
                <label
                  key={m.key}
                  className={cn(
                    "bg-card has-focus-visible:ring-edge-green/30 flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors has-focus-visible:ring-4",
                    method === m.key ? "border-edge-emerald ring-edge-emerald/20 ring-2" : "hover:bg-muted/50",
                    !ok && "cursor-not-allowed opacity-50",
                  )}
                >
                  <input
                    type="radio"
                    name="method-choice"
                    className="sr-only"
                    checked={method === m.key}
                    disabled={!ok}
                    onChange={() => setMethod(m.key)}
                  />
                  {/* The radio itself is hidden; this is its dot, drawn like the other radios. */}
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-[18px] shrink-0 items-center justify-center rounded-full border",
                      method === m.key ? "border-edge-emerald bg-edge-emerald" : "border-foreground/25 bg-card",
                    )}
                  >
                    {method === m.key ? <span className="size-2 rounded-full bg-white" /> : null}
                  </span>
                  <CreditCard className="text-edge-emerald size-5" />
                  <span className="flex-1">
                    <span className="block font-semibold">{m.label}</span>
                    <span className="text-muted-foreground block text-xs">{ok ? m.description : "Not available for this amount"}</span>
                  </span>
                  {q ? <span className="text-right text-sm font-semibold">{formatMoney(q.totalMinor, currency)}</span> : null}
                </label>
              );
            })}
          </div>
        </section>
      </div>

      <aside className="bg-card h-fit rounded-xl border p-5 lg:sticky lg:top-20">
        <h2 className="mb-4 font-semibold">Summary</h2>
        {selected ? (
          <dl className="grid gap-2 text-sm">
            <Row label="Course amount" value={formatMoney(selected.courseMinor, currency)} />
            {selected.courseVatMinor ? <Row label="VAT (5%)" value={formatMoney(selected.courseVatMinor, currency)} /> : null}
            <Row
              label="Payment processing fee"
              value={formatMoney(selected.processingFeeMinor + selected.processingFeeVatMinor, currency)}
              hint={vatTreatment === "STANDARD" ? "incl. VAT" : undefined}
            />
            <div className="my-1 border-t" />
            <Row label="Total to pay" value={formatMoney(selected.totalMinor, currency)} strong />
          </dl>
        ) : (
          <p className="text-muted-foreground text-sm">Choose a plan and a method to see the total.</p>
        )}
        <Button type="submit" size="lg" className="mt-5 w-full" disabled={pending || !methodOk}>
          {pending ? "Redirecting…" : selected ? `Pay ${formatMoney(selected.totalMinor, currency)}` : "Pay"}
        </Button>
        <p className="text-muted-foreground mt-3 flex items-start gap-1.5 text-xs">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> You will complete the payment on the provider&apos;s secure page. Course fees
          are non-refundable.
        </p>
      </aside>
    </form>
  );
}

function toMinorSafe(v: string) {
  try {
    const m = toMinor(v);
    return m > 0 ? m : null;
  } catch {
    return null;
  }
}

function Row({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4", strong && "text-base font-bold")}>
      <dt className={strong ? "" : "text-muted-foreground"}>
        {label}
        {hint ? <span className="block text-[11px]">{hint}</span> : null}
      </dt>
      <dd>{value}</dd>
    </div>
  );
}

function PlanCard({
  active,
  onClick,
  title,
  subtitle,
  note,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  note: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "bg-card rounded-xl border p-4 text-left transition-colors",
        active ? "border-edge-emerald ring-edge-emerald/20 ring-2" : "hover:bg-muted/50",
      )}
    >
      <span className="block font-semibold">{title}</span>
      <span className="text-edge-emerald block text-lg font-bold">{subtitle}</span>
      <span className="text-muted-foreground mt-1 block text-xs">{note}</span>
    </button>
  );
}
