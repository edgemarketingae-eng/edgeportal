import { crmRoutes } from "@edge/contracts";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Button, Field, Notice, Sheet, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { errorText, useSaved } from "@/lib/queries";

export default function TaskComment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const saved = useSaved();
  const [body, setBody] = useState("");
  const save = useMutation({
    mutationFn: () => api(crmRoutes.commentTask, { params: { id }, body: { body: body.trim() } }),
    onSuccess: () => saved("Comment added"),
  });

  return (
    <Sheet
      actions={<Button label="Comment" style={{ flex: 1 }} onPress={() => save.mutate()} busy={save.isPending} disabled={!body.trim()} />}
    >
      <Text variant="title">Add a comment</Text>
      <Field label="Comment" value={body} onChangeText={setBody} multiline autoFocus style={{ minHeight: 96, textAlignVertical: "top" }} />
      {save.error ? <Notice tone="danger" text={errorText(save.error)} /> : null}
    </Sheet>
  );
}
