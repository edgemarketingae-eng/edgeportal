"use client";

import type { CommissionSettingsDto } from "@edge/contracts";
import { DEPOSIT_SEQUENCES, type DepositSequence } from "@edge/domain/crm/enums";
import { DEPOSIT_SEQUENCE_LABELS } from "@edge/domain/crm/labels";
import { formatDate, toDubaiLocal } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Input } from "@edge/ui/components/input";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { SegmentedControl } from "@edge/ui/forms/segmented-control";
import { Plus, X } from "lucide-react";
import { Fragment, useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  deleteDepositAction,
  logDepositAction,
  rejectDepositAction,
  saveCommissionSettingsAction,
  verifyDepositAction,
} from "@/lib/actions/deposits";

const today = () => toDubaiLocal(new Date()).slice(0, 10);
/** "2026-10-31" -> "October 2026" */
const monthOf = (day: string) =>
  new Date(`${day.slice(0, 7)}-01T00:00:00.000Z`).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** Log a deposit the lead made at JetaFX. Asks for the client ID when the lead has none yet (it is saved on the lead). */
export function LogDepositDialog({
  leadId,
  nextSequence,
  clientId,
}: {
  leadId: string;
  nextSequence: DepositSequence;
  clientId: string | null;
}) {
  return (
    <ActionDialog
      action={logDepositAction}
      hidden={{ id: leadId }}
      title="Log a deposit"
      description="A deposit the lead made in their JetaFX account. It earns commission once an admin verifies it against the broker's report."
      trigger={
        <Button size="sm" variant="outline">
          <Plus /> Deposit
        </Button>
      }
      submitLabel="Log deposit"
      size="md"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <SegmentedControl
          name="sequence"
          label="Which deposit"
          defaultValue={nextSequence}
          options={DEPOSIT_SEQUENCES.map((s) => ({ value: s, label: DEPOSIT_SEQUENCE_LABELS[s] }))}
        />
        <Field label="Amount (USD)" name="amount" inputMode="decimal" placeholder="500" required />
        <Field label="Deposit date" name="depositedAt" type="date" defaultValue={today()} required />
        {clientId ? (
          <div className="grid content-start gap-2">
            <Label>JetaFX client ID</Label>
            <p className="py-2 text-sm font-medium">{clientId}</p>
          </div>
        ) : (
          <Field label="JetaFX client ID" name="jetaFxClientId" required hint="Saved on the lead" />
        )}
      </div>
      <Field label="Broker reference (optional)" name="reference" placeholder="Transaction ID from JetaFX" />
      <div className="grid content-start gap-2">
        <Label htmlFor="deposit-note">Note (optional)</Label>
        <Textarea id="deposit-note" name="note" rows={2} />
      </div>
    </ActionDialog>
  );
}

export function VerifyDepositDialog({
  id,
  leadName,
  amountMinor,
  sequence,
  depositedAt,
  clientId,
}: {
  id: string;
  leadName: string;
  amountMinor: number;
  sequence: DepositSequence;
  depositedAt: string;
  clientId: string | null;
}) {
  return (
    <ActionDialog
      action={verifyDepositAction}
      hidden={{ id }}
      title="Verify this deposit?"
      description={`${leadName}: ${DEPOSIT_SEQUENCE_LABELS[sequence].toLowerCase()} of ${formatMoney(amountMinor, "USD")} on ${formatDate(depositedAt)}, JetaFX client ${clientId ?? "unknown"}. Check it against the JetaFX report. ${sequence === "FIRST" ? "The commission is fixed with today's first-deposit rate." : `It joins the ${monthOf(depositedAt)} later deposits of the person it counts for: all of them earn the slab rate their total reaches, so their commission is recalculated.`}`}
      trigger={<Button size="sm">Verify</Button>}
      submitLabel="Verify"
    />
  );
}

export function RejectDepositDialog({ id, verified }: { id: string; verified: boolean }) {
  return (
    <ActionDialog
      action={rejectDepositAction}
      hidden={{ id }}
      title="Reject this deposit?"
      description={
        verified
          ? "It was verified before. Rejecting removes its commission (for example when the broker reversed the deposit)."
          : "It earns no commission. The person who logged it is told why."
      }
      trigger={
        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
          Reject
        </Button>
      }
      submitLabel="Reject"
      destructive
    >
      <Field label="Reason" name="reason" required placeholder="Not in the JetaFX report" />
    </ActionDialog>
  );
}

export function DeleteDepositButton({ id }: { id: string }) {
  return (
    <ActionDialog
      action={deleteDepositAction}
      hidden={{ id }}
      title="Delete this deposit?"
      description="The logged deposit is removed from this lead. This can't be undone."
      trigger={
        <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
          Delete
        </Button>
      }
      submitLabel="Delete deposit"
      destructive
    />
  );
}

/** Commission rates (Settings, commission managers only): first deposits at one rate, later deposits by amount slab. */
export function CommissionSettingsForm({ s }: { s: CommissionSettingsDto }) {
  const [state, action, pending] = useActionState(saveCommissionSettingsAction, {} as ActionState);
  useEffect(() => {
    if (state.ok) toast.success(state.message ?? "Saved");
    if (state.error) toast.error(state.error);
  }, [state]);
  const v = state.values;
  const fe = state.fieldErrors ?? {};
  const slabs: SlabValue[] = v?.slabs ? JSON.parse(v.slabs) : s.slabs.map((x) => ({ from: String(x.from), pct: String(x.pct) }));
  // Remount after an error (submitted values) and after a save (the saved, sorted settings), or React's form reset
  // would bring back the rows as first rendered.
  return (
    <form key={JSON.stringify(v ?? s)} action={action} className="grid gap-5">
      <FormError state={state} />
      <Field
        label="First deposit (%)"
        name="firstPct"
        type="number"
        min={0}
        max={100}
        step="0.01"
        defaultValue={v?.firstPct ?? String(s.firstPct)}
        error={fe.firstPct}
        hint="Every new customer's first deposit."
        className="max-w-xs"
      />
      <SlabRows initial={slabs} error={fe.slabs} />
      <p className="text-muted-foreground text-xs">
        The sales executive who owned the lead earns this share of each verified deposit. A new rate applies to deposits verified from now
        on.
      </p>
      <Button className="w-fit" pending={pending}>
        Save commission rates
      </Button>
    </form>
  );
}

type SlabValue = { from: string; pct: string };

/**
 * Later-deposit slabs: the base rate (any total, always first) and the slabs from a monthly total. A person's verified
 * later deposits in a month (by deposit date, first deposits excluded) all earn the rate of the highest slab their
 * total reaches, on their whole amounts. Posts one `slabFrom` and one `slabPct` per row.
 */
function SlabRows({ initial, error }: { initial: SlabValue[]; error?: string }) {
  const [base, ...more] = initial;
  const [rows, setRows] = useState(() => more.map((r, id) => ({ id, ...r })));
  const add = () => setRows((r) => [...r, { id: Math.max(-1, ...r.map((x) => x.id)) + 1, from: "", pct: "" }]);
  const pct = { type: "number", min: 0, max: 100, step: "0.01", required: true } as const;
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium">Later deposits</legend>
      <p className="text-muted-foreground -mt-1 text-xs">
        By each person&apos;s monthly total of verified later deposits, from all their leads (first deposits don&apos;t count). All their
        later deposits that month earn the rate of the highest slab the total reaches. Saving re-rates this month.
      </p>
      <div className="grid max-w-md grid-cols-[1fr_1fr_2.25rem] items-center gap-2 text-sm">
        <span className="text-muted-foreground text-xs">Monthly total</span>
        <span className="text-muted-foreground text-xs">Commission (%)</span>
        <span />
        <input type="hidden" name="slabFrom" value="0" />
        <Label htmlFor="slab-base" className="font-normal">
          Base rate · any total
        </Label>
        <Input id="slab-base" name="slabPct" defaultValue={base?.pct ?? "0"} {...pct} />
        <span />
        {rows.map((r, i) => (
          <Fragment key={r.id}>
            <div className="relative">
              <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs">From $</span>
              <Input
                aria-label={`Slab ${i + 1} from (USD)`}
                name="slabFrom"
                type="number"
                min={0}
                step="0.01"
                required
                defaultValue={r.from}
                placeholder="10000"
                className="pl-14"
              />
            </div>
            <Input aria-label={`Slab ${i + 1} (%)`} name="slabPct" defaultValue={r.pct} {...pct} />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove slab ${i + 1}`}
              onClick={() => setRows((x) => x.filter((y) => y.id !== r.id))}
            >
              <X />
            </Button>
          </Fragment>
        ))}
      </div>
      {error ? <p className="text-destructive text-xs font-medium">{error}</p> : null}
      {rows.length < 9 ? (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={add}>
          <Plus /> Add slab
        </Button>
      ) : null}
    </fieldset>
  );
}
