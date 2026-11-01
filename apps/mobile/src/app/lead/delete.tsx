import { crmRoutes } from "@edge/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Button, buzz, Field, Notice, Sheet, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { errorText, useLead } from "@/lib/queries";
import { toast } from "@/lib/toast";

/** The one action here that can't be undone, so the name has to be typed rather than tapped. */
export default function DeleteLead() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useLead(id);
  const router = useRouter();
  const client = useQueryClient();
  const [typed, setTyped] = useState("");
  const name = detail.data?.lead.name ?? "";
  const matches = !!name && typed.trim().toLowerCase() === name.trim().toLowerCase();

  const remove = useMutation({
    mutationFn: () => api(crmRoutes.deleteLead, { params: { id } }),
    onSuccess: () => {
      router.dismissTo("/leads");
      client.removeQueries({ queryKey: ["lead", id] });
      void client.invalidateQueries();
      buzz.success();
      toast("Lead deleted");
    },
  });

  return (
    <Sheet
      actions={
        <Button
          label="Delete lead"
          variant="danger"
          style={{ flex: 1 }}
          onPress={() => remove.mutate()}
          busy={remove.isPending}
          disabled={!matches}
        />
      }
    >
      <Text variant="title">Delete {name}?</Text>
      <Text>The lead, its activity history, its tasks and any duplicates merged into it are removed for good. This can't be undone.</Text>
      <Field label={`Type ${name} to confirm`} value={typed} onChangeText={setTyped} autoCapitalize="words" autoCorrect={false} />
      {remove.error ? <Notice tone="danger" text={errorText(remove.error)} /> : null}
    </Sheet>
  );
}
