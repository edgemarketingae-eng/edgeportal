import { crmRoutes } from "@edge/contracts";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Button, Field, Notice, Sheet, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { errorText, useSaved } from "@/lib/queries";

export default function RejectDeposit() {
  const { id, verified } = useLocalSearchParams<{ id: string; verified: string }>();
  const saved = useSaved();
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () => api(crmRoutes.rejectDeposit, { params: { id }, body: { reason: reason.trim() } }),
    onSuccess: () => saved("Deposit rejected"),
  });

  return (
    <Sheet
      actions={
        <Button
          label="Reject deposit"
          variant="danger"
          style={{ flex: 1 }}
          onPress={() => save.mutate()}
          busy={save.isPending}
          disabled={reason.trim().length < 2}
        />
      }
    >
      <Text variant="title">Reject this deposit?</Text>
      <Text variant="caption">
        {verified
          ? "It was verified before. Rejecting removes its commission (for example when the broker reversed the deposit)."
          : "It earns no commission. The person who logged it is told why."}
      </Text>
      <Field label="Reason" value={reason} onChangeText={setReason} multiline style={{ minHeight: 72, textAlignVertical: "top" }} />
      {save.error ? <Notice tone="danger" text={errorText(save.error)} /> : null}
    </Sheet>
  );
}
