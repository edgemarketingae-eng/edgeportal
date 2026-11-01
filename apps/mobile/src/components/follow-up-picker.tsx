import { useState } from "react";
import { View } from "react-native";
import { dueLabel, FOLLOW_UP_CHOICES } from "@/lib/format";
import { pickDateTime, toInstant } from "./date-fields";
import { Chip, Text, Wrap } from "./ui";

/** The next follow-up in one tap: the usual gaps, or any time. Tapping the chosen one clears it. */
export function FollowUpPicker({ value, onChange }: { value: string | null; onChange: (local: string | null) => void }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const choose = (label: string, at: string) => {
    const off = chosen === label;
    setChosen(off ? null : label);
    onChange(off ? null : at);
  };
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label">Next follow-up</Text>
      <Wrap>
        {FOLLOW_UP_CHOICES.map((c) => (
          <Chip key={c.label} label={c.label} selected={chosen === c.label} onPress={() => choose(c.label, c.at())} />
        ))}
        <Chip
          label={chosen === "custom" && value ? dueLabel(toInstant(value)) : "Pick a time"}
          selected={chosen === "custom"}
          onPress={() =>
            pickDateTime((local) => {
              setChosen("custom");
              onChange(local);
            })
          }
        />
      </Wrap>
    </View>
  );
}
