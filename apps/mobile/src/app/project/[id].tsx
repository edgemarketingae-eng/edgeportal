import { crmRoutes } from "@edge/contracts";
import { LEAD_STAGE_LABELS, LEAD_TEMPERATURE_LABELS, PROJECT_STATUS_LABELS } from "@edge/domain/crm/labels";
import { formatDate } from "@edge/domain/dates";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Funnel } from "@/components/funnel";
import { LeadRow } from "@/components/lead-row";
import { TaskRow } from "@/components/task-row";
import { Avatar, Button, Card, EmptyState, IconButton, Notice, Pill, SectionHeader, SkeletonRows, StatCard, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { errorText, useCan } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

export default function Project() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const client = useQueryClient();
  const can = useCan();
  const detail = useQuery({ queryKey: ["project", id], queryFn: () => api(crmRoutes.project, { params: { id } }) });
  const remove = useMutation({
    mutationFn: (userId: string) => api(crmRoutes.removeProjectMember, { params: { id }, body: { userId } }),
    onSuccess: () => client.invalidateQueries(),
  });

  const d = detail.data;
  if (!d) {
    if (detail.error) return <EmptyState icon="cloud-offline-outline" title="Couldn't open this project" text={errorText(detail.error)} />;
    return (
      <View style={{ padding: 16 }}>
        <SkeletonRows count={4} />
      </View>
    );
  }
  const { project: p, team } = d;
  const canSetManagers = can("crm.projects.manage");
  const period =
    p.startDate || p.endDate ? `${p.startDate ? formatDate(p.startDate) : "…"} – ${p.endDate ? formatDate(p.endDate) : "…"}` : null;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={detail.isRefetching}
          onRefresh={() => void detail.refetch()}
          colors={[t.accent]}
          progressBackgroundColor={t.card}
        />
      }
    >
      <Stack.Screen
        options={{
          headerRight: p.canManage
            ? () => (
                <IconButton
                  icon="create-outline"
                  label="Edit project"
                  tone="ghost"
                  onPress={() => router.push({ pathname: "/project/edit", params: { id } })}
                />
              )
            : undefined,
        }}
      />
      <View style={{ gap: 4 }}>
        <Text variant="title">{p.name}</Text>
        <Text variant="caption">
          {[p.code, PROJECT_STATUS_LABELS[p.status], p.courseTitle, p.batchName, period].filter(Boolean).join(" · ")}
        </Text>
        {p.description ? <Text>{p.description}</Text> : null}
      </View>

      {remove.error ? <Notice tone="danger" text={errorText(remove.error)} /> : null}

      <View style={styles.stats}>
        <StatCard value={p.stats.openLeads} label="Open leads" hint={p.targetLeads ? `Target ${p.targetLeads}` : undefined} />
        <StatCard
          value={p.stats.convertedMonth}
          label="Converted this month"
          hint={p.targetConversions ? `Target ${p.targetConversions}` : undefined}
        />
        <StatCard value={p.stats.overdueTasks} label="Overdue tasks" tone={p.stats.overdueTasks ? "danger" : undefined} />
        <StatCard
          value={p.isDefault ? "Everyone" : p.stats.team}
          label="Team"
          hint={p.isDefault ? undefined : `${p.managers.length} ${p.managers.length === 1 ? "manager" : "managers"}`}
        />
      </View>

      <View style={styles.actions}>
        {can("crm.write") && p.status !== "ARCHIVED" ? (
          <Button
            label="Lead"
            icon="add"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: "/lead/new", params: { project: id } })}
          />
        ) : null}
        <Button
          label="All leads"
          variant="soft"
          style={{ flex: 1 }}
          onPress={() => router.navigate({ pathname: "/leads", params: { project: id } })}
        />
      </View>

      <SectionHeader title="Funnel" />
      <Funnel byStage={d.byStage} />

      <SectionHeader
        title="Team"
        count={p.isDefault ? undefined : team.length || undefined}
        action={p.canManage && !p.isDefault ? "Add people" : undefined}
        onAction={() => router.push({ pathname: "/project/add-member", params: { id } })}
      />
      {p.isDefault ? <Text variant="caption">Everyone with CRM access works in this project, so it has no team to manage.</Text> : null}
      {!p.isDefault && !team.length ? <Text variant="caption">Nobody on the team yet.</Text> : null}
      {team.map((m) => (
        <Card key={m.id} style={styles.member}>
          <Avatar name={m.name} size={42} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.memberName}>
              <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                {m.name}
              </Text>
              {m.role === "manager" ? <Pill tone="accent" label="PM" /> : null}
            </View>
            <Text variant="caption" tone={m.overdueTasks ? "danger" : "muted"}>
              {m.openLeads} open · {m.convertedMonth} converted · {m.overdueTasks} overdue
            </Text>
          </View>
          {p.canManage && (m.role === "member" || canSetManagers) ? (
            <IconButton
              icon="close"
              label={`Remove ${m.name}`}
              tone="ghost"
              size={38}
              onPress={() =>
                Alert.alert(
                  `Remove ${m.name} from the project?`,
                  "They leave the team and get none of its round-robin leads from now on.",
                  [
                    { text: "Keep", style: "cancel" },
                    { text: "Remove", style: "destructive", onPress: () => remove.mutate(m.id) },
                  ],
                )
              }
            />
          ) : null}
        </Card>
      ))}

      {d.openTasks.length ? <SectionHeader title="Open tasks" count={d.openTasks.length} /> : null}
      {d.openTasks.map((task) => (
        <TaskRow key={task.id} task={task} showAssignee onOpen={() => router.push(`/task/${task.id}`)} />
      ))}

      {d.recentLeads.length ? <SectionHeader title="Recent leads" /> : null}
      {d.recentLeads.map((l) => (
        <LeadRow
          key={l.id}
          title={l.name}
          detail={[LEAD_STAGE_LABELS[l.stage], LEAD_TEMPERATURE_LABELS[l.temperature], timeAgo(l.createdAt)].join(" · ")}
          target={l.phone ? { leadId: l.id, leadName: l.name, phone: l.phone } : null}
          onOpen={() => router.push(`/lead/${l.id}`)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, gap: 10 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actions: { flexDirection: "row", gap: 10 },
  member: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  memberName: { flexDirection: "row", alignItems: "center", gap: 6 },
});
