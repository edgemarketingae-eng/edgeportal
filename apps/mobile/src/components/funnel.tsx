import { LEAD_STAGES } from "@edge/domain/crm/enums";
import { LEAD_STAGE_LABELS } from "@edge/domain/crm/labels";
import { StyleSheet, View } from "react-native";
import { useTheme } from "@/lib/theme";
import { Card, Text } from "./ui";

const STAGES = LEAD_STAGES.filter((s) => s !== "LOST");

/** How many leads sit at each stage. */
export function Funnel({ byStage }: { byStage: Record<string, number> }) {
  const t = useTheme();
  const max = Math.max(1, ...STAGES.map((s) => byStage[s] ?? 0));
  return (
    <Card style={{ gap: 10 }}>
      {STAGES.map((s) => {
        const n = byStage[s] ?? 0;
        return (
          <View key={s} style={styles.row}>
            <Text variant="caption" style={styles.label}>
              {LEAD_STAGE_LABELS[s]}
            </Text>
            <View style={[styles.track, { backgroundColor: t.muted }]}>
              <View
                style={[
                  styles.bar,
                  { width: `${Math.max(n ? 4 : 0, (n / max) * 100)}%`, backgroundColor: s === "CONVERTED" ? t.primary : t.accent },
                ]}
              />
            </View>
            <Text variant="label" style={styles.count}>
              {n}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { width: 92 },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: "hidden" },
  bar: { height: "100%", borderRadius: 5 },
  count: { width: 34, textAlign: "right" },
});
