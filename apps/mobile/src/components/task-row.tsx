import type { TaskDto } from "@edge/contracts";
import { TASK_PRIORITY_LABELS } from "@edge/domain/crm/labels";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { dueLabel, isOverdue } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { Pill, Tap, Text } from "./ui";

/** Tap the circle to finish it, anywhere else to open it. */
export function TaskRow({
  task,
  onOpen,
  onDone,
  showAssignee,
}: {
  task: TaskDto;
  onOpen: () => void;
  onDone?: () => void;
  /** Off in your own list, where it would be your name on every row. */
  showAssignee?: boolean;
}) {
  const t = useTheme();
  const closed = task.status === "DONE" || task.status === "CANCELLED";
  const late = !closed && !!task.dueAt && isOverdue(task.dueAt);
  const when = closed && task.completedAt ? dueLabel(task.completedAt) : task.dueAt ? dueLabel(task.dueAt) : "No date";
  const urgent = task.priority === "URGENT" || task.priority === "HIGH";
  return (
    <View style={[styles.row, { backgroundColor: t.card, borderColor: t.hairline, boxShadow: t.shadow }]}>
      {onDone ? (
        <Tap accessibilityRole="button" accessibilityLabel={`Mark ${task.title} as done`} hitSlop={8} scaleTo={0.85} onPress={onDone}>
          <Ionicons name="ellipse-outline" size={26} color={late ? t.destructive : t.mutedForeground} />
        </Tap>
      ) : (
        <Ionicons
          name={task.status === "DONE" ? "checkmark-circle" : closed ? "close-circle-outline" : "ellipse-outline"}
          size={26}
          color={task.status === "DONE" ? t.accent : t.mutedForeground}
        />
      )}
      <Tap accessibilityRole="button" scaleTo={0.985} onPress={onOpen} style={styles.main}>
        <Text numberOfLines={1} variant="heading">
          {task.title}
        </Text>
        <Text numberOfLines={1} variant="caption" tone={late ? "danger" : "muted"}>
          {[when, task.leadName, showAssignee ? task.assignee?.name : null].filter(Boolean).join(" · ")}
        </Text>
      </Tap>
      {urgent ? <Pill tone={task.priority === "URGENT" ? "danger" : "neutral"} label={TASK_PRIORITY_LABELS[task.priority]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
  },
  main: { flex: 1, gap: 2, minHeight: 42, justifyContent: "center" },
});
