import { ACTIVITY_LABELS } from "@edge/domain/crm/labels";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { FollowUpPicker } from "@/components/follow-up-picker";
import { Button, Chip, Field, Segmented, Sheet, Text, Wrap } from "@/components/ui";
import { enqueue, SAVED_FOR_LATER } from "@/lib/outbox";
import { useSaved } from "@/lib/queries";

// Calls go through the after-call sheet, so they appear once on the timeline.
const TYPES = ["NOTE", "WHATSAPP", "EMAIL", "MEETING"] as const;
type NoteType = (typeof TYPES)[number];

const PLACEHOLDER: Record<NoteType, string> = {
  NOTE: "What did you learn? Budget, goals, objections…",
  WHATSAPP: "Summary of the WhatsApp conversation",
  EMAIL: "What was sent or received?",
  MEETING: "Consultation notes",
};

const DIRECTIONS = [
  { value: "OUT", label: "Sent by us" },
  { value: "IN", label: "From the lead" },
] as const;

export default function AddNote() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const saved = useSaved();
  const [type, setType] = useState<NoteType>("NOTE");
  const [direction, setDirection] = useState<"IN" | "OUT">("OUT");
  const [body, setBody] = useState("");
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const twoWay = type === "WHATSAPP" || type === "EMAIL";

  const save = async () => {
    setSaving(true);
    const left = await enqueue([
      {
        kind: "activity",
        leadId: id,
        body: { type, body: body.trim(), direction: twoWay ? direction : undefined, nextFollowUpAt: followUp ?? undefined },
      },
    ]);
    saved(left ? SAVED_FOR_LATER : "Saved");
  };

  return (
    <Sheet
      actions={
        <Button label="Save" style={{ flex: 1 }} onPress={() => void save()} busy={saving} disabled={type === "NOTE" && !body.trim()} />
      }
    >
      <Text variant="title">Add to timeline</Text>
      <Wrap>
        {TYPES.map((x) => (
          <Chip key={x} label={ACTIVITY_LABELS[x]} selected={type === x} onPress={() => setType(x)} />
        ))}
      </Wrap>
      {twoWay ? <Segmented options={DIRECTIONS} value={direction} onChange={setDirection} /> : null}
      <Field
        label="Details"
        value={body}
        onChangeText={setBody}
        multiline
        placeholder={PLACEHOLDER[type]}
        style={{ minHeight: 96, textAlignVertical: "top" }}
      />
      <View>
        <FollowUpPicker value={followUp} onChange={setFollowUp} />
      </View>
    </Sheet>
  );
}
