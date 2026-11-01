import { crmRoutes } from "@edge/contracts";
import { CRM_TASK_STATUSES, type CrmTaskStatus } from "@edge/domain/crm/enums";
import { FOLLOWUP_TYPE_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@edge/domain/crm/labels";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { pickDateTime } from "@/components/date-fields";
import {
  BottomBar,
  buzz,
  Button,
  Card,
  EmptyState,
  IconButton,
  Info,
  Notice,
  Pill,
  SectionHeader,
  Segmented,
  SkeletonRows,
  Text,
} from "@/components/ui";
import { api } from "@/lib/api";
import { dueLabel, isOverdue, timeAgo } from "@/lib/format";
import { errorText, useCan } from "@/lib/queries";
import { toast } from "@/lib/toast";

const OPEN_STATUSES = CRM_TASK_STATUSES.filter((s) => s !== "DONE" && s !== "CANCELLED").map((value) => ({
  value,
  label: TASK_STATUS_LABELS[value],
}));

export default function Task() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const client = useQueryClient();
  const can = useCan();
  const detail = useQuery({ queryKey: ["task", id], queryFn: () => api(crmRoutes.task, { params: { id } }) });

  const finish = (message?: string) => {
    if (message) {
      buzz.success();
      toast(message);
    }
    return client.invalidateQueries();
  };
  const move = useMutation({
    mutationFn: (status: CrmTaskStatus) => api(crmRoutes.moveTask, { params: { id }, body: { status } }),
    onSuccess: () => finish(),
  });
  const reschedule = useMutation({
    mutationFn: (dueAt: string) => api(crmRoutes.rescheduleTask, { params: { id }, body: { dueAt } }),
    onSuccess: () => finish("Rescheduled"),
  });
  const cancel = useMutation({
    mutationFn: () => api(crmRoutes.cancelTask, { params: { id } }),
    onSuccess: () => finish("Task cancelled"),
  });

  const d = detail.data;
  if (!d) {
    if (detail.error) return <EmptyState icon="cloud-offline-outline" title="Couldn't open this task" text={errorText(detail.error)} />;
    return (
      <View style={{ padding: 16 }}>
        <SkeletonRows count={4} />
      </View>
    );
  }
  const { task } = d;
  const closed = task.status === "DONE" || task.status === "CANCELLED";
  const canEdit = d.canEdit && can("crm.write");
  const late = !closed && !!task.dueAt && isOverdue(task.dueAt);
  const shownStatus = move.isPending ? move.variables : task.status;
  const failed = move.error ?? reschedule.error ?? cancel.error;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: canEdit
            ? () => (
                <IconButton
                  icon="create-outline"
                  label="Edit task"
                  tone="ghost"
                  onPress={() => router.push({ pathname: "/task/edit", params: { id } })}
                />
              )
            : undefined,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: 8 }}>
          <Text variant="title">{task.title}</Text>
          <View style={styles.pills}>
            <Pill label={FOLLOWUP_TYPE_LABELS[task.type]} />
            <Pill tone={task.priority === "URGENT" ? "danger" : "neutral"} label={`${TASK_PRIORITY_LABELS[task.priority]} priority`} />
            {closed ? <Pill tone={task.status === "DONE" ? "accent" : "neutral"} label={TASK_STATUS_LABELS[task.status]} /> : null}
          </View>
        </View>

        {failed ? <Notice tone="danger" text={errorText(failed)} /> : null}

        {!closed && canEdit ? (
          <Segmented options={OPEN_STATUSES} value={shownStatus ?? task.status} onChange={(status) => move.mutate(status)} />
        ) : null}

        <Card style={{ gap: 12 }}>
          <View style={{ gap: 2 }}>
            <Text variant="caption">Due</Text>
            <Text tone={late ? "danger" : "default"}>{task.dueAt ? dueLabel(task.dueAt) : "No date"}</Text>
          </View>
          {task.leadId ? (
            <View style={{ gap: 2 }}>
              <Text variant="caption">Lead</Text>
              <Text tone="accent" onPress={() => router.push(`/lead/${task.leadId}`)}>
                {task.leadName}
              </Text>
            </View>
          ) : null}
          <Info label="Project" value={task.project.name} />
          <Info label="Assigned to" value={task.assignee?.name ?? "Unassigned"} />
          <Info label="Created by" value={task.createdBy?.name} />
          <Info label="Details" value={task.description} />
        </Card>

        {canEdit && !closed ? (
          <View style={styles.pills}>
            <Button
              label="Reschedule"
              variant="soft"
              style={styles.smallButton}
              onPress={() => pickDateTime((dueAt) => reschedule.mutate(dueAt))}
            />
            <Button
              label="Cancel task"
              variant="outline"
              style={styles.smallButton}
              busy={cancel.isPending}
              onPress={() =>
                Alert.alert("Cancel this task?", "It moves to the closed tasks and no longer counts as the next follow-up.", [
                  { text: "Keep task", style: "cancel" },
                  { text: "Cancel task", style: "destructive", onPress: () => cancel.mutate() },
                ])
              }
            />
          </View>
        ) : null}
        {canEdit && closed ? <Button label="Reopen" variant="soft" busy={move.isPending} onPress={() => move.mutate("TODO")} /> : null}

        <SectionHeader
          title="Comments"
          count={d.comments.length || undefined}
          action={can("crm.write") ? "Add" : undefined}
          onAction={() => router.push({ pathname: "/task/comment", params: { id } })}
        />
        {d.comments.length ? null : <Text variant="caption">No comments yet.</Text>}
        {d.comments.map((c) => (
          <Card key={c.id} style={{ gap: 2 }}>
            <Text>{c.body}</Text>
            <Text variant="caption">{[c.author?.name, timeAgo(c.createdAt)].filter(Boolean).join(" · ")}</Text>
          </Card>
        ))}
      </ScrollView>
      {canEdit && !closed ? (
        <BottomBar>
          <Button
            label="Mark as done"
            icon="checkmark"
            style={{ flex: 1 }}
            onPress={() =>
              router.push({
                pathname: "/task/done",
                params: { id, title: task.title, type: task.type, leadId: task.leadId ?? "" },
              })
            }
          />
        </BottomBar>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, gap: 12 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  smallButton: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14 },
});
