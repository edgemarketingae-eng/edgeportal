import { ApiError, crmRoutes } from "@edge/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Button, buzz, Chip, Field, Notice, Sheet, Text, Wrap } from "@/components/ui";
import { api } from "@/lib/api";
import { useLead } from "@/lib/queries";
import { toast } from "@/lib/toast";

export default function MarkConversion() {
  const router = useRouter();
  const client = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useLead(id);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = new Set(detail.data?.conversions.map((c) => c.product.id));
  const products = detail.data?.options.products.filter((p) => !done.has(p.id)) ?? [];
  const toggle = (productId: string) =>
    setPicked(picked.includes(productId) ? picked.filter((x) => x !== productId) : [...picked, productId]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(crmRoutes.markConversions, { params: { id }, body: { productIds: picked, note: note.trim() || undefined } });
      void client.invalidateQueries();
      buzz.success();
      toast("Conversion saved");
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No connection. Check your signal and try again.");
      setBusy(false);
    }
  };

  return (
    <Sheet
      actions={<Button label="Mark conversion" style={{ flex: 1 }} onPress={() => void save()} busy={busy} disabled={!picked.length} />}
    >
      <Text variant="title">What did they join?</Text>
      <Wrap>
        {products.map((p) => (
          <Chip key={p.id} label={p.name} selected={picked.includes(p.id)} onPress={() => toggle(p.id)} />
        ))}
      </Wrap>
      {detail.data && !products.length ? <Text variant="caption">Already converted to every product.</Text> : null}
      <Field label="Note" value={note} onChangeText={setNote} multiline style={{ minHeight: 72, textAlignVertical: "top" }} />
      {error ? <Notice tone="danger" text={error} /> : null}
    </Sheet>
  );
}
