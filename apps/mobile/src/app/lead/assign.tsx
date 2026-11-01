import { crmRoutes } from "@edge/contracts";
import { useMutation } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Button, Notice, SelectField, Sheet, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { errorText, useLead, useSaved } from "@/lib/queries";

export default function AssignLead() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useLead(id);
  const saved = useSaved();
  const lead = detail.data?.lead;
  const [picked, setPicked] = useState<string | null>(null);
  const ownerId = picked ?? lead?.ownerId ?? "";
  const team = lead ? (detail.data?.options.teams[lead.project.id] ?? []) : [];
  const save = useMutation({
    mutationFn: () => api(crmRoutes.assign, { params: { id }, body: { ownerId } }),
    onSuccess: () => saved("Lead assigned"),
  });

  return (
    <Sheet actions={<Button label="Assign" style={{ flex: 1 }} onPress={() => save.mutate()} busy={save.isPending} disabled={!lead} />}>
      <Text variant="title">Assign lead</Text>
      {lead ? <Text variant="caption">Team of {lead.project.name}</Text> : null}
      <SelectField
        label="Owner"
        value={ownerId}
        options={team.map((o) => ({ value: o.id, label: o.available === false ? `${o.name} (Off)` : o.name }))}
        onChange={setPicked}
        blank="Unassigned (pool)"
      />
      {save.error ? <Notice tone="danger" text={errorText(save.error)} /> : null}
    </Sheet>
  );
}
