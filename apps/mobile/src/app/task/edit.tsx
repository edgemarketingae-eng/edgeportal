import { ApiError, crmRoutes, type TaskDetail } from "@edge/contracts";
import { FOLLOWUP_TYPES, TASK_PRIORITIES } from "@edge/domain/crm/enums";
import { FOLLOWUP_TYPE_LABELS, TASK_PRIORITY_LABELS } from "@edge/domain/crm/labels";
import { toDubaiLocal } from "@edge/domain/dates";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { DateTimeField } from "@/components/date-fields";
import { Button, Chip, EmptyState, Field, Notice, SelectField, Sheet, SkeletonRows, Text, Wrap } from "@/components/ui";
import { api } from "@/lib/api";
import { errorText, useSaved } from "@/lib/queries";

function Form({ detail }: { detail: TaskDetail }) {
  const { task, assignees } = detail;
  const saved = useSaved();
  const [title, setTitle] = useState(task.title);
  const [type, setType] = useState(task.type);
  const [priority, setPriority] = useState(task.priority);
  const [dueAt, setDueAt] = useState(task.dueAt ? toDubaiLocal(task.dueAt) : "");
  const [assigneeId, setAssigneeId] = useState(task.assignee?.id ?? "");
  const [description, setDescription] = useState(task.description ?? "");

  const save = useMutation({
    mutationFn: () =>
      api(crmRoutes.updateTask, {
        params: { id: task.id },
        body: { title: title.trim(), type, priority, dueAt, assigneeId, description: description.trim() },
      }),
    onSuccess: () => saved("Task saved"),
  });
  const fieldErrors = save.error instanceof ApiError ? save.error.fieldErrors : undefined;

  return (
    <Sheet
      actions={
        <Button label="Save" style={{ flex: 1 }} onPress={() => save.mutate()} busy={save.isPending} disabled={title.trim().length < 2} />
      }
    >
      <Text variant="title">Edit task</Text>
      <Field label="Title" value={title} onChangeText={setTitle} error={fieldErrors?.title} />
      <View style={{ gap: 8 }}>
        <Text variant="label">Type</Text>
        <Wrap>
          {FOLLOWUP_TYPES.map((x) => (
            <Chip key={x} label={FOLLOWUP_TYPE_LABELS[x]} selected={type === x} onPress={() => setType(x)} />
          ))}
        </Wrap>
      </View>
      <View style={{ gap: 8 }}>
        <Text variant="label">Priority</Text>
        <Wrap>
          {TASK_PRIORITIES.map((x) => (
            <Chip key={x} label={TASK_PRIORITY_LABELS[x]} selected={priority === x} onPress={() => setPriority(x)} />
          ))}
        </Wrap>
      </View>
      <DateTimeField label="Due" value={dueAt} onChange={setDueAt} />
      {assignees.length > 1 ? (
        <SelectField
          label="Assigned to"
          value={assigneeId}
          options={assignees.map((a) => ({ value: a.id, label: a.name }))}
          onChange={setAssigneeId}
          blank="Unassigned"
        />
      ) : null}
      <Field
        label="Details"
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ minHeight: 96, textAlignVertical: "top" }}
      />
      {save.error ? <Notice tone="danger" text={errorText(save.error)} /> : null}
    </Sheet>
  );
}

export default function EditTask() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useQuery({ queryKey: ["task", id], queryFn: () => api(crmRoutes.task, { params: { id } }) });
  if (detail.data) return <Form detail={detail.data} />;
  if (detail.error) return <EmptyState icon="cloud-offline-outline" title="Couldn't load this task" text={errorText(detail.error)} />;
  return (
    <View style={{ padding: 20 }}>
      <SkeletonRows count={4} />
    </View>
  );
}
