import type { MobileToday, TaskDto } from "@edge/contracts";
import { CALL_OUTCOMES, type CallOutcome } from "@edge/domain/crm/enums";
import { CALL_OUTCOME_LABELS } from "@edge/domain/crm/labels";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { FollowUpPicker } from "@/components/follow-up-picker";
import { Button, Chip, Field, Sheet, Text, Wrap } from "@/components/ui";
import { enqueue, SAVED_FOR_LATER } from "@/lib/outbox";
import { useSaved } from "@/lib/queries";

/** Works with no signal: it's saved to the phone first, and sent when there's a connection. */
export default function TaskDone() {
  const { id, title, type, leadId } = useLocalSearchParams<{ id: string; title: string; type: string; leadId: string }>();
  const saved = useSaved();
  const client = useQueryClient();
  const isCall = type === "CALL" && !!leadId;
  const [outcome, setOutcome] = useState<CallOutcome>("ANSWERED");
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    // It leaves the lists now, or with no signal it would sit there waiting to be finished twice.
    client.setQueriesData<InfiniteData<{ rows: TaskDto[] }>>({ queryKey: ["tasks"] }, (old) =>
      old ? { ...old, pages: old.pages.map((p) => ({ ...p, rows: p.rows.filter((task) => task.id !== id) })) } : old,
    );
    client.setQueryData<MobileToday>(["today"], (old) => (old ? { ...old, tasks: old.tasks.filter((task) => task.id !== id) } : old));
    const left = await enqueue([
      {
        kind: "completeTask",
        taskId: id,
        body: { note: note.trim(), outcome: isCall ? outcome : undefined, nextFollowUpAt: followUp ?? undefined },
      },
    ]);
    saved(left ? SAVED_FOR_LATER : "Task done");
  };

  return (
    <Sheet actions={<Button label="Mark as done" style={{ flex: 1 }} onPress={() => void save()} busy={saving} />}>
      <Text variant="title" numberOfLines={2}>
        Done: {title}
      </Text>
      {isCall ? (
        <View style={{ gap: 8 }}>
          <Text variant="label">Outcome</Text>
          <Wrap>
            {CALL_OUTCOMES.map((o) => (
              <Chip key={o} label={CALL_OUTCOME_LABELS[o]} selected={outcome === o} onPress={() => setOutcome(o)} />
            ))}
          </Wrap>
        </View>
      ) : null}
      <Field label="What happened?" value={note} onChangeText={setNote} multiline style={{ minHeight: 84, textAlignVertical: "top" }} />
      {leadId ? <FollowUpPicker value={followUp} onChange={setFollowUp} /> : null}
    </Sheet>
  );
}
