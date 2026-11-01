import { ApiError, crmRoutes, type ProjectDto, type ProjectInput } from "@edge/contracts";
import { PROJECT_STATUSES, type ProjectStatus } from "@edge/domain/crm/enums";
import { PROJECT_STATUS_LABELS } from "@edge/domain/crm/labels";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { DateField } from "@/components/date-fields";
import { Button, buzz, Chip, EmptyState, Field, Notice, Segmented, SelectField, Sheet, SkeletonRows, Text, Wrap } from "@/components/ui";
import { api } from "@/lib/api";
import { errorText, useCan, useOptions, useSaved } from "@/lib/queries";
import { toast } from "@/lib/toast";

const STATUSES = PROJECT_STATUSES.map((value) => ({ value, label: PROJECT_STATUS_LABELS[value] }));

function People({
  label,
  people,
  chosen,
  onChange,
}: {
  label: string;
  people: { id: string; name: string }[];
  chosen: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label">{label}</Text>
      <Wrap>
        {people.map((p) => (
          <Chip
            key={p.id}
            label={p.name}
            selected={chosen.includes(p.id)}
            onPress={() => onChange(chosen.includes(p.id) ? chosen.filter((x) => x !== p.id) : [...chosen, p.id])}
          />
        ))}
      </Wrap>
    </View>
  );
}

/** Create a project, or edit one. The team of an existing project is changed on its own page, one person at a time. */
function Form({ project }: { project?: ProjectDto }) {
  const options = useOptions();
  const can = useCan();
  const saved = useSaved();
  const router = useRouter();
  const client = useQueryClient();
  const canSetManagers = can("crm.projects.manage");
  const [name, setName] = useState(project?.name ?? "");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "ACTIVE");
  const [courseId, setCourseId] = useState(project?.courseId ?? "");
  const [batchId, setBatchId] = useState(project?.batchId ?? "");
  const [startDate, setStartDate] = useState(project?.startDate?.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(project?.endDate?.slice(0, 10) ?? "");
  const [targetLeads, setTargetLeads] = useState(project?.targetLeads != null ? String(project.targetLeads) : "");
  const [targetConversions, setTargetConversions] = useState(project?.targetConversions != null ? String(project.targetConversions) : "");
  const [managerIds, setManagerIds] = useState<string[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const staff = options.data?.staff ?? [];
  const batches = (options.data?.batches ?? []).filter((b) => !courseId || b.courseId === courseId);

  const save = useMutation({
    mutationFn: async () => {
      const body: ProjectInput = {
        name: name.trim(),
        description: description.trim(),
        courseId,
        batchId,
        startDate,
        endDate,
        targetLeads,
        targetConversions,
        // Only a CRM manager may change the status, so nobody else sends it.
        ...(canSetManagers ? { status } : {}),
      };
      if (project) {
        await api(crmRoutes.updateProject, { params: { id: project.id }, body });
        return null;
      }
      return (await api(crmRoutes.createProject, { body: { ...body, code: code.trim(), managerIds, memberIds } })).id;
    },
    onSuccess: (createdId) => {
      if (!createdId) return saved("Project saved");
      void client.invalidateQueries();
      buzz.success();
      toast("Project created");
      router.replace(`/project/${createdId}`);
    },
  });
  const fieldErrors = save.error instanceof ApiError ? save.error.fieldErrors : undefined;

  return (
    <Sheet
      actions={
        <Button
          label={project ? "Save project" : "Create project"}
          style={{ flex: 1 }}
          onPress={() => save.mutate()}
          busy={save.isPending}
          disabled={name.trim().length < 2}
        />
      }
    >
      <Text variant="title">{project ? "Edit project" : "New project"}</Text>
      <Field label="Name" value={name} onChangeText={setName} placeholder="Forex Pro - November drive" error={fieldErrors?.name} />
      {!project ? (
        <Field label="Code (optional)" value={code} onChangeText={setCode} placeholder="Made from the name" error={fieldErrors?.code} />
      ) : null}
      <Field
        label="Description"
        value={description}
        onChangeText={setDescription}
        multiline
        style={{ minHeight: 72, textAlignVertical: "top" }}
      />
      {canSetManagers && !project?.isDefault ? (
        <View style={{ gap: 6 }}>
          <Text variant="label">Status</Text>
          <Segmented options={STATUSES} value={status} onChange={setStatus} />
        </View>
      ) : null}
      <DateField label="Start date" value={startDate} onChange={setStartDate} />
      <DateField label="End date" value={endDate} onChange={setEndDate} />
      <SelectField
        label="Target course"
        value={courseId}
        options={options.data?.courses.map((c) => ({ value: c.id, label: c.title })) ?? []}
        onChange={(id) => {
          setCourseId(id);
          setBatchId("");
        }}
        blank="Not set"
      />
      <SelectField
        label="Target batch"
        value={batchId}
        options={batches.map((b) => ({ value: b.id, label: b.label }))}
        onChange={setBatchId}
        blank="Not set"
      />
      <Field
        label="Target leads"
        value={targetLeads}
        onChangeText={setTargetLeads}
        keyboardType="number-pad"
        error={fieldErrors?.targetLeads}
      />
      <Field
        label="Target conversions"
        value={targetConversions}
        onChangeText={setTargetConversions}
        keyboardType="number-pad"
        error={fieldErrors?.targetConversions}
      />
      {!project && staff.length ? (
        <>
          <People label="Project managers" people={staff} chosen={managerIds} onChange={setManagerIds} />
          <People label="Sales executives (team members)" people={staff} chosen={memberIds} onChange={setMemberIds} />
        </>
      ) : null}
      {save.error ? <Notice tone="danger" text={errorText(save.error)} /> : null}
    </Sheet>
  );
}

export default function EditProject() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const detail = useQuery({
    queryKey: ["project", id],
    queryFn: () => api(crmRoutes.project, { params: { id: id ?? "" } }),
    enabled: !!id,
  });
  if (!id) return <Form />;
  if (detail.data) return <Form project={detail.data.project} />;
  if (detail.error) return <EmptyState icon="cloud-offline-outline" title="Couldn't load this project" text={errorText(detail.error)} />;
  return (
    <View style={{ padding: 20 }}>
      <SkeletonRows count={4} />
    </View>
  );
}
