import { ApiError, crmRoutes } from "@edge/contracts";
import { FOLLOWUP_TYPES, TASK_PRIORITIES, type FollowUpType, type TaskPriority } from "@edge/domain/crm/enums";
import { FOLLOWUP_TYPE_LABELS, TASK_PRIORITY_LABELS } from "@edge/domain/crm/labels";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { DateTimeField } from "@/components/date-fields";
import { Button, Chip, Field, Notice, SelectField, Sheet, Text, Wrap } from "@/components/ui";
import { api } from "@/lib/api";
import { tomorrowMorning } from "@/lib/format";
import { errorText, useMe, useOptions, useSaved } from "@/lib/queries";

/** A follow-up on a lead (its project is fixed) or a task of its own (project picked). */
export default function NewTask() {
  const params = useLocalSearchParams<{ leadId?: string; projectId?: string; leadName?: string }>();
  const options = useOptions();
  const me = useMe();
  const saved = useSaved();
  const projects = options.data?.projects ?? [];
  const [picked, setPicked] = useState<string | null>(params.projectId ?? null);
  const projectId = picked ?? projects.find((p) => p.isDefault)?.id ?? projects[0]?.id ?? "";
  const team = options.data?.teams[projectId] ?? [];
  const [title, setTitle] = useState("");
  const [type, setType] = useState<FollowUpType>("CALL");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [dueAt, setDueAt] = useState(tomorrowMorning());
  const [assignee, setAssignee] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const myId = me.data?.user.id ?? "";
  const assigneeId = assignee ?? (team.some((o) => o.id === myId) ? myId : "");

  const save = useMutation({
    mutationFn: () =>
      api(crmRoutes.createTask, {
        body: {
          projectId,
          leadId: params.leadId || undefined,
          title: title.trim(),
          description: description.trim(),
          type,
          priority,
          dueAt,
          assigneeId,
        },
      }),
    onSuccess: () => saved("Task added"),
  });
  const fieldErrors = save.error instanceof ApiError ? save.error.fieldErrors : undefined;

  return (
    <Sheet
      actions={
        <Button
          label="Add"
          style={{ flex: 1 }}
          onPress={() => save.mutate()}
          busy={save.isPending}
          disabled={title.trim().length < 2 || !projectId}
        />
      }
    >
      <View style={{ gap: 2 }}>
        <Text variant="title">{params.leadId ? "Schedule a follow-up" : "New task"}</Text>
        {params.leadName ? <Text variant="caption">{params.leadName}</Text> : null}
      </View>
      {!params.leadId ? (
        <SelectField
          label="Project"
          value={projectId}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(id) => {
            setPicked(id);
            setAssignee(null);
          }}
        />
      ) : null}
      <Field
        label="Title"
        value={title}
        onChangeText={setTitle}
        placeholder="Call back about the November batch"
        error={fieldErrors?.title}
      />
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
      {team.length > 1 ? (
        <SelectField
          label="Assign to"
          value={assigneeId}
          options={team.map((o) => ({ value: o.id, label: o.name }))}
          onChange={setAssignee}
          blank="Lead owner / me"
        />
      ) : null}
      <Field
        label="Details"
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ minHeight: 72, textAlignVertical: "top" }}
      />
      {save.error ? <Notice tone="danger" text={errorText(save.error)} /> : null}
    </Sheet>
  );
}
