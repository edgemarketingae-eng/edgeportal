import { crmRoutes, type TaskDto } from "@edge/contracts";
import { TASK_PRIORITIES, type TaskPriority } from "@edge/domain/crm/enums";
import { TASK_PRIORITY_LABELS } from "@edge/domain/crm/labels";
import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, SectionList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TaskRow } from "@/components/task-row";
import {
  Chip,
  EmptyState,
  IconButton,
  Notice,
  Rise,
  SectionHeader,
  Segmented,
  SelectField,
  SkeletonRows,
  Tap,
  Text,
} from "@/components/ui";
import { api } from "@/lib/api";
import { taskGroup } from "@/lib/format";
import { errorText, useCan, useOptions } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

const PAGE_SIZE = 50;
const GROUPS = ["Overdue", "Today", "Upcoming", "No date"];
const STATUSES = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
] as const;
const WHOSE = [
  { value: "mine", label: "Mine" },
  { value: "all", label: "Everyone" },
] as const;

function sectionsOf(tasks: TaskDto[], done: boolean) {
  if (done) return tasks.length ? [{ title: "Done", data: tasks }] : [];
  return GROUPS.map((title) => ({ title, data: tasks.filter((task) => taskGroup(task.dueAt) === title) })).filter((s) => s.data.length);
}

export default function Tasks() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const can = useCan();
  const options = useOptions();
  const [status, setStatus] = useState<"open" | "done">("open");
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [priority, setPriority] = useState<TaskPriority | undefined>();
  const [project, setProject] = useState("");
  const [filters, setFilters] = useState(false);
  const canAssign = can("crm.assign");

  const tasks = useInfiniteQuery({
    queryKey: ["tasks", status, scope, priority, project],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api(crmRoutes.tasks, { query: { status, scope, priority, project: project || undefined, page: pageParam, pageSize: PAGE_SIZE } }),
    getNextPageParam: (last, _all, page) => (page * PAGE_SIZE < last.total ? page + 1 : undefined),
  });
  const rows = tasks.data?.pages.flatMap((p) => p.rows) ?? [];
  const filtered = !!priority || !!project;
  const sections = sectionsOf(rows, status === "done");

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleRow}>
          <Text variant="title" style={{ flex: 1 }}>
            Tasks
          </Text>
          <View>
            <IconButton icon="options-outline" label="Filters" onPress={() => setFilters(!filters)} />
            {filtered ? <View style={[styles.dot, { backgroundColor: t.primary, borderColor: t.background }]} /> : null}
          </View>
        </View>
        <Segmented options={STATUSES} value={status} onChange={setStatus} />
        {filters ? (
          <View style={{ gap: 10 }}>
            {canAssign ? <Segmented options={WHOSE} value={scope} onChange={setScope} /> : null}
            <View style={styles.chips}>
              {TASK_PRIORITIES.map((p) => (
                <Chip
                  key={p}
                  label={TASK_PRIORITY_LABELS[p]}
                  selected={priority === p}
                  onPress={() => setPriority(priority === p ? undefined : p)}
                />
              ))}
            </View>
            <SelectField
              label="Project"
              value={project}
              options={options.data?.projects.map((p) => ({ value: p.id, label: p.name })) ?? []}
              onChange={setProject}
              blank="All projects"
            />
          </View>
        ) : null}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(task) => task.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={tasks.isRefetching}
            onRefresh={() => void tasks.refetch()}
            colors={[t.accent]}
            progressBackgroundColor={t.card}
          />
        }
        onEndReached={() => void tasks.fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={tasks.error ? <Notice tone="danger" text={errorText(tasks.error)} /> : undefined}
        ListEmptyComponent={
          tasks.isPending ? (
            <SkeletonRows count={6} />
          ) : (
            <EmptyState
              icon={status === "done" ? "checkmark-done" : "checkbox-outline"}
              title={status === "done" ? "Nothing finished yet" : "Nothing to do"}
              text={filtered ? "Try clearing your filters." : "Tap + to add a task."}
            />
          )
        }
        renderSectionHeader={({ section }) => (
          <SectionHeader title={section.title} count={section.data.length} tone={section.title === "Overdue" ? "danger" : undefined} />
        )}
        renderItem={({ item: task, index }) => (
          <Rise index={index} moves={false} style={{ marginTop: 8 }}>
            <TaskRow
              task={task}
              showAssignee={scope === "all"}
              onOpen={() => router.push(`/task/${task.id}`)}
              onDone={
                status === "open"
                  ? () =>
                      router.push({
                        pathname: "/task/done",
                        params: { id: task.id, title: task.title, type: task.type, leadId: task.leadId ?? "" },
                      })
                  : undefined
              }
            />
          </Rise>
        )}
      />
      {can("crm.write") ? (
        <Tap
          accessibilityRole="button"
          accessibilityLabel="Add a task"
          feedback="tap"
          scaleTo={0.9}
          onPress={() => router.push("/task/new")}
          style={[styles.add, { backgroundColor: t.primary }]}
        >
          <Ionicons name="add" size={28} color={t.onPrimary} />
        </Tap>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingBottom: 6, gap: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { position: "absolute", top: 8, right: 9, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 96 },
  add: {
    position: "absolute",
    right: 18,
    bottom: 18,
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 10px 24px rgba(3, 98, 76, 0.35)",
  },
});
