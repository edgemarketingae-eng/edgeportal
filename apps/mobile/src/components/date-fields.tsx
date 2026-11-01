import { dubaiDateString, formatDate, toDubaiLocal } from "@edge/domain/dates";
import { Ionicons } from "@expo/vector-icons";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Pressable, StyleSheet, View } from "react-native";
import { dueLabel } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { IconButton, Text } from "./ui";

/** A Dubai wall-clock time as the API takes it, the same shape as a datetime-local input. */
export const toInstant = (local: string) => `${local}:00+04:00`;

export function pickDateTime(onPicked: (local: string) => void, from?: string) {
  const now = new Date();
  const start = from ? new Date(toInstant(from)) : now;
  DateTimePickerAndroid.open({
    value: start,
    minimumDate: now,
    mode: "date",
    onChange: (e, day) => {
      if (e.type !== "set" || !day) return;
      DateTimePickerAndroid.open({
        value: day,
        mode: "time",
        onChange: (e2, time) => {
          if (e2.type === "set" && time) onPicked(toDubaiLocal(time));
        },
      });
    },
  });
}

function pickDate(onPicked: (day: string) => void, from: string) {
  DateTimePickerAndroid.open({
    value: from ? new Date(`${from}T12:00:00+04:00`) : new Date(),
    mode: "date",
    onChange: (e, day) => {
      if (e.type === "set" && day) onPicked(dubaiDateString(day));
    },
  });
}

function Box({
  label,
  shown,
  empty,
  onPress,
  onClear,
}: {
  label: string;
  shown: string | null;
  empty: string;
  onPress: () => void;
  onClear: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown ?? empty}`}
        onPress={onPress}
        style={[styles.box, { backgroundColor: t.card, borderColor: t.border }]}
      >
        <Ionicons name="calendar-outline" size={18} color={t.mutedForeground} />
        <Text tone={shown ? "default" : "muted"} style={{ flex: 1 }}>
          {shown ?? empty}
        </Text>
        {shown ? <IconButton icon="close" label={`Clear ${label}`} tone="ghost" size={36} onPress={onClear} /> : null}
      </Pressable>
    </View>
  );
}

export function DateTimeField({ label, value, onChange }: { label: string; value: string; onChange: (local: string) => void }) {
  return (
    <Box
      label={label}
      shown={value ? dueLabel(toInstant(value)) : null}
      empty="No date"
      onPress={() => pickDateTime(onChange, value || undefined)}
      onClear={() => onChange("")}
    />
  );
}

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (day: string) => void }) {
  return (
    <Box
      label={label}
      shown={value ? formatDate(`${value}T12:00:00+04:00`) : null}
      empty="Not set"
      onPress={() => pickDate(onChange, value)}
      onClear={() => onChange("")}
    />
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    paddingLeft: 14,
    paddingRight: 8,
  },
});
