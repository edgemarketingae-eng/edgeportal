import { ApiError, crmRoutes } from "@edge/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Button, Chip, Field, Notice, Sheet, Text, Wrap } from "@/components/ui";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";

export default function MarkLost() {
  const router = useRouter();
  const client = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const options = useQuery({ queryKey: ["options"], queryFn: () => api(crmRoutes.options) });
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await api(crmRoutes.stage, { params: { id }, body: { stage: "LOST", lostReason: reason, note: note.trim() || undefined } });
      void client.invalidateQueries();
      toast("Marked as lost");
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No connection. Check your signal and try again.");
      setBusy(false);
    }
  };

  return (
    <Sheet
      actions={
        <Button label="Mark as lost" variant="danger" style={{ flex: 1 }} onPress={() => void save()} busy={busy} disabled={!reason} />
      }
    >
      <Text variant="title">Why was this lead lost?</Text>
      <Wrap>
        {options.data?.lostReasons.map((r) => (
          <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
        ))}
      </Wrap>
      <Field label="Note" value={note} onChangeText={setNote} multiline style={{ minHeight: 72, textAlignVertical: "top" }} />
      {error ? <Notice tone="danger" text={error} /> : null}
    </Sheet>
  );
}
