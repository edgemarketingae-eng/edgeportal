import { crmRoutes } from "@edge/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Chip, Notice, Segmented, Sheet, Text, Wrap } from "@/components/ui";
import { api } from "@/lib/api";
import { errorText, useCan, useSaved } from "@/lib/queries";

const ROLES = [
  { value: "member", label: "Sales executive" },
  { value: "manager", label: "Project manager" },
] as const;

export default function AddMember() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const can = useCan();
  const saved = useSaved();
  const detail = useQuery({ queryKey: ["project", id], queryFn: () => api(crmRoutes.project, { params: { id } }) });
  const [picked, setPicked] = useState<string[]>([]);
  const [role, setRole] = useState<"member" | "manager">("member");
  const team = detail.data?.team ?? [];
  const people = detail.data?.options.staff.filter((s) => !team.some((m) => m.id === s.id)) ?? [];

  const save = useMutation({
    mutationFn: async () => {
      for (const userId of picked) await api(crmRoutes.projectMember, { params: { id }, body: { userId, role } });
    },
    onSuccess: () => saved(picked.length === 1 ? "Added to the project" : `${picked.length} people added`),
  });

  return (
    <Sheet
      actions={
        <Button label="Add to project" style={{ flex: 1 }} onPress={() => save.mutate()} busy={save.isPending} disabled={!picked.length} />
      }
    >
      <Text variant="title">Add people</Text>
      <Text variant="caption">Sales executives work the project's leads and receive its round-robin leads.</Text>
      {can("crm.projects.manage") ? <Segmented options={ROLES} value={role} onChange={setRole} /> : null}
      <View>
        {detail.data && !people.length ? <Text variant="caption">Everyone is already on this project.</Text> : null}
        <Wrap>
          {people.map((p) => (
            <Chip
              key={p.id}
              label={p.name}
              selected={picked.includes(p.id)}
              onPress={() => setPicked(picked.includes(p.id) ? picked.filter((x) => x !== p.id) : [...picked, p.id])}
            />
          ))}
        </Wrap>
      </View>
      {save.error ? <Notice tone="danger" text={errorText(save.error)} /> : null}
    </Sheet>
  );
}
