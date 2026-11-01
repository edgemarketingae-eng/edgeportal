import { crmRoutes } from "@edge/contracts";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Button, Notice, SelectField, Sheet, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { errorText, useLead, useSaved } from "@/lib/queries";

export default function MoveLead() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useLead(id);
  const saved = useSaved();
  const [projectId, setProjectId] = useState("");
  const projects = detail.data?.options.projects.filter((p) => p.id !== detail.data?.lead.project.id) ?? [];
  const save = useMutation({
    mutationFn: () => api(crmRoutes.moveProject, { params: { id }, body: { projectId } }),
    onSuccess: () => saved("Lead moved"),
  });

  return (
    <Sheet actions={<Button label="Move" style={{ flex: 1 }} onPress={() => save.mutate()} busy={save.isPending} disabled={!projectId} />}>
      <Text variant="title">Move to another project</Text>
      <Text variant="caption">Open tasks move along. The owner stays only if they are on the new project.</Text>
      <SelectField
        label="Project"
        value={projectId}
        options={projects.map((p) => ({ value: p.id, label: p.name }))}
        onChange={setProjectId}
      />
      {save.error ? <Notice tone="danger" text={errorText(save.error)} /> : null}
    </Sheet>
  );
}
