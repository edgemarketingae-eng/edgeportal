"use client";

import type { CommissionSettingsDto } from "@edge/contracts";
import { DEPOSIT_SEQUENCES, type DepositSequence } from "@edge/domain/crm/enums";
import { DEPOSIT_SEQUENCE_LABELS } from "@edge/domain/crm/labels";
import { formatDate, toDubaiLocal } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { ActionButton, ActionDialog } from "@edge/ui/blocks/action-dialog";
import { Button } from "@edge/ui/components/button";
import { Label } from "@edge/ui/components/label";
import { NativeSelect } from "@edge/ui/components/native-select";
import { Textarea } from "@edge/ui/components/textarea";
import { Field, FormError, type ActionState } from "@edge/ui/forms/field";
import { Plus } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import {
  deleteDepositAction,
  logDepositAction,
  rejectDepositAction,
  saveCommissionSettingsAction,
  verifyDepositAction,
} from "@/lib/actions/deposits";

const today = () => toDubaiLocal(new Date()).slice(0, 10);

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
        <div className="grid content-start gap-2">
          <Label htmlFor="deposit-sequence">Which deposit</Label>
          <NativeSelect id="deposit-sequence" name="sequence" defaultValue={nextSequence}>
            {DEPOSIT_SEQUENCES.map((s) => (
              <option key={s} value={s}>
                {DEPOSIT_SEQUENCE_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
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
      description={`${leadName}: ${DEPOSIT_SEQUENCE_LABELS[sequence].toLowerCase()} of ${formatMoney(amountMinor, "USD")} on ${formatDate(depositedAt)}, JetaFX client ${clientId ?? "unknown"}. Check it against the JetaFX report. The commission is fixed with today's rate for a ${DEPOSIT_SEQUENCE_LABELS[sequence].toLowerCase()}.`}
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
    <ActionButton action={deleteDepositAction} hidden={{ id }} variant="ghost">
      Delete
    </ActionButton>
  );
}

/** Commission rates per deposit (Settings, commission managers only). */
export function CommissionSettingsForm({ s }: { s: CommissionSettingsDto }) {
  const [state, action, pending] = useActionState(saveCommissionSettingsAction, {} as ActionState);
  useEffect(() => {
    if (state.ok) toast.success(state.message ?? "Saved");
    if (state.error) toast.error(state.error);
  }, [state]);
  const v = state.values;
  const fe = state.fieldErrors ?? {};
  return (
    <form key={JSON.stringify(v ?? {})} action={action} className="grid gap-4">
      <FormError state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="1st deposit (%)"
          name="firstPct"
          type="number"
          min={0}
          max={100}
          step="0.01"
          defaultValue={v?.firstPct ?? String(s.firstPct)}
          error={fe.firstPct}
        />
        <Field
          label="2nd deposit (%)"
          name="secondPct"
          type="number"
          min={0}
          max={100}
          step="0.01"
          defaultValue={v?.secondPct ?? String(s.secondPct)}
          error={fe.secondPct}
        />
        <Field
          label="Later deposits (%)"
          name="laterPct"
          type="number"
          min={0}
          max={100}
          step="0.01"
          defaultValue={v?.laterPct ?? String(s.laterPct)}
          error={fe.laterPct}
          hint="3rd deposit onwards"
        />
      </div>
      <p className="text-muted-foreground text-xs">
        The sales executive who owned the lead earns this share of each verified deposit. A new rate applies to deposits verified from now
        on.
      </p>
      <Button className="w-fit" disabled={pending}>
        {pending ? "Saving…" : "Save commission rates"}
      </Button>
    </form>
  );
}
