import { ApiError, crmRoutes } from "@edge/contracts";
import { DEPOSIT_SEQUENCES, type DepositSequence } from "@edge/domain/crm/enums";
import { DEPOSIT_SEQUENCE_LABELS } from "@edge/domain/crm/labels";
import { dubaiDateString } from "@edge/domain/dates";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Button, buzz, Chip, Field, Notice, Sheet, Text, Wrap } from "@/components/ui";
import { api } from "@/lib/api";
import { useLead } from "@/lib/queries";
import { toast } from "@/lib/toast";

const DAY_MS = 86_400_000;

export default function LogDeposit() {
  const router = useRouter();
  const client = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useLead(id);
  const hasFirst = detail.data?.deposits.some((d) => d.sequence === "FIRST" && d.status !== "REJECTED");
  const [chosen, setChosen] = useState<DepositSequence | null>(null);
  const sequence = chosen ?? (hasFirst ? "LATER" : "FIRST");
  const [amount, setAmount] = useState("");
  const [yesterday, setYesterday] = useState(false);
  const [clientId, setClientId] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const needsClientId = detail.data && !detail.data.lead.jetaFxClientId;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(crmRoutes.logDeposit, {
        params: { id },
        body: {
          sequence,
          amount: amount.trim(),
          depositedAt: dubaiDateString(new Date(Date.now() - (yesterday ? DAY_MS : 0))),
          jetaFxClientId: clientId.trim() || undefined,
          reference: reference.trim() || undefined,
        },
      });
      void client.invalidateQueries();
      buzz.success();
      toast("Deposit logged");
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, "INTERNAL", "No connection. Check your signal and try again."));
      setBusy(false);
    }
  };

  return (
    <Sheet actions={<Button label="Log deposit" style={{ flex: 1 }} onPress={() => void save()} busy={busy} disabled={!amount.trim()} />}>
      <Text variant="title">Log deposit</Text>
      <Wrap>
        {DEPOSIT_SEQUENCES.map((s) => (
          <Chip key={s} label={DEPOSIT_SEQUENCE_LABELS[s]} selected={sequence === s} onPress={() => setChosen(s)} />
        ))}
      </Wrap>
      <Field label="Amount in USD" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" error={error?.fieldErrors?.amount} />
      <Wrap>
        <Chip label="Today" selected={!yesterday} onPress={() => setYesterday(false)} />
        <Chip label="Yesterday" selected={yesterday} onPress={() => setYesterday(true)} />
      </Wrap>
      {needsClientId ? (
        <Field label="JetaFX client ID" value={clientId} onChangeText={setClientId} error={error?.fieldErrors?.jetaFxClientId} />
      ) : null}
      <Field label="Broker reference (optional)" value={reference} onChangeText={setReference} />
      {error && !error.fieldErrors ? <Notice tone="danger" text={error.message} /> : null}
      <Text variant="caption">It earns commission once a manager verifies it against the JetaFX report.</Text>
    </Sheet>
  );
}
