import { crmRoutes, type ProjectDto } from "@edge/contracts";
import { PROJECT_STATUS_LABELS } from "@edge/domain/crm/labels";
import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Card, Disclosure, EmptyState, IconButton, Notice, Pill, Rise, SkeletonRows, Tap, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { errorText, useCan } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

function Figure({ value, label, danger }: { value: string | number; label: string; danger?: boolean }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="title" tone={danger ? "danger" : "default"}>
        {value}
      </Text>
      <Text variant="caption">{label}</Text>
    </View>
  );
}

function ProjectCard({ project: p, onOpen }: { project: ProjectDto; onOpen: () => void }) {
  return (
    <Tap accessibilityRole="button" scaleTo={0.985} onPress={onOpen}>
      <Card style={{ gap: 12 }}>
        <View style={{ gap: 2 }}>
          <Text variant="heading">{p.name}</Text>
          <Text variant="caption" numberOfLines={1}>
            {[p.code, p.courseTitle, p.batchName].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <View style={{ flexDirection: "row" }}>
          <Figure value={p.stats.openLeads} label="Open leads" />
          <Figure
            value={p.targetConversions ? `${p.stats.convertedMonth}/${p.targetConversions}` : p.stats.convertedMonth}
            label="Converted"
          />
          <Figure value={p.stats.overdueTasks} label="Overdue" danger={p.stats.overdueTasks > 0} />
        </View>
        <View style={styles.pills}>
          {p.status !== "ACTIVE" ? <Pill label={PROJECT_STATUS_LABELS[p.status]} /> : null}
          <Pill label={p.isDefault ? "Open to everyone" : `${p.stats.team} on the team`} />
          {p.managers.length ? <Text variant="caption">PM: {p.managers.map((m) => m.name).join(", ")}</Text> : null}
        </View>
      </Card>
    </Tap>
  );
}

export default function Projects() {
  const t = useTheme();
  const router = useRouter();
  const can = useCan();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api(crmRoutes.projects, { query: {} }) });
  const all = projects.data ?? [];
  const active = all.filter((p) => p.status !== "ARCHIVED");
  const archived = all.filter((p) => p.status === "ARCHIVED");
  const manage = can("crm.projects.manage");

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={projects.isRefetching}
          onRefresh={() => void projects.refetch()}
          colors={[t.accent]}
          progressBackgroundColor={t.card}
        />
      }
    >
      <Stack.Screen
        options={{
          headerRight: manage
            ? () => <IconButton icon="add" label="New project" tone="ghost" onPress={() => router.push("/project/edit")} />
            : undefined,
        }}
      />
      {projects.error ? <Notice tone="danger" text={errorText(projects.error)} /> : null}
      {projects.isPending ? <SkeletonRows count={3} /> : null}
      {projects.data && !active.length ? (
        <EmptyState
          icon="folder-open-outline"
          title="No active projects"
          text={manage ? "Tap + to start one for a campaign or batch." : "A CRM manager adds you to projects."}
        />
      ) : null}
      {active.map((p, i) => (
        <Rise key={p.id} index={i} moves={false}>
          <ProjectCard project={p} onOpen={() => router.push(`/project/${p.id}`)} />
        </Rise>
      ))}
      {archived.length ? (
        <Disclosure label={`${archived.length} archived`}>
          {archived.map((p) => (
            <ProjectCard key={p.id} project={p} onOpen={() => router.push(`/project/${p.id}`)} />
          ))}
        </Disclosure>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10 },
  pills: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
});
