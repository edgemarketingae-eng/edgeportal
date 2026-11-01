import { crmRoutes } from "@edge/contracts";
import { LEAD_SOURCE_LABELS } from "@edge/domain/crm/labels";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Funnel } from "@/components/funnel";
import { Card, EmptyState, ListGroup, ListRow, Notice, SectionHeader, SelectField, Skeleton, StatCard, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { errorText, useOptions } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

const sourceLabel = (source: string) => (LEAD_SOURCE_LABELS as Record<string, string>)[source] ?? source;

export default function Dashboard() {
  const t = useTheme();
  const router = useRouter();
  const options = useOptions();
  const [project, setProject] = useState("");
  const dashboard = useQuery({
    queryKey: ["dashboard", project],
    queryFn: () => api(crmRoutes.dashboard, { query: { project: project || undefined } }),
  });
  const d = dashboard.data;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={dashboard.isRefetching}
          onRefresh={() => void dashboard.refetch()}
          colors={[t.accent]}
          progressBackgroundColor={t.card}
        />
      }
    >
      <SelectField
        label="Project"
        value={project}
        options={options.data?.projects.map((p) => ({ value: p.id, label: p.name })) ?? []}
        onChange={setProject}
        blank="All my projects"
      />
      {dashboard.error ? <Notice tone="danger" text={errorText(dashboard.error)} /> : null}
      {!d && !dashboard.error ? (
        <View style={styles.stats}>
          {Array.from({ length: 6 }, (_, i) => (
            <View key={i} style={{ flexBasis: "45%", flexGrow: 1 }}>
              <Skeleton height={84} radius={20} />
            </View>
          ))}
        </View>
      ) : null}
      {d ? (
        <>
          <View style={styles.stats}>
            <StatCard value={d.openLeads} label="Open leads" />
            <StatCard value={d.newWeek} label="New this week" hint={`${d.newToday} today`} />
            <StatCard
              value={d.uncontactedOverSla}
              label={`Untouched over ${d.slaHours}h`}
              tone={d.uncontactedOverSla ? "danger" : undefined}
            />
            <StatCard
              value={d.overdueTasks}
              label="Overdue tasks"
              hint={`${d.dueToday} due today`}
              tone={d.overdueTasks ? "danger" : undefined}
            />
            <StatCard value={d.convertedMonth} label="Converted this month" />
            <StatCard value={d.lostMonth} label="Lost this month" />
            <StatCard value={d.winRate90d == null ? "–" : `${d.winRate90d}%`} label="Win rate, 90 days" />
            <StatCard
              value={d.medianResponseHours == null ? "–" : `${d.medianResponseHours}h`}
              label="First response"
              hint="Median, 30 days"
            />
          </View>

          <SectionHeader title="Funnel" />
          <Funnel byStage={d.byStage} />

          {d.owners.length ? <SectionHeader title="Team" /> : null}
          {d.owners.length ? (
            <ListGroup>
              {d.owners.map((o, i) => (
                <ListRow
                  key={o.id}
                  icon="person-outline"
                  label={o.name}
                  value={`${o.open} open · ${o.convertedMonth} won · ${o.overdue} late`}
                  last={i === d.owners.length - 1}
                />
              ))}
            </ListGroup>
          ) : null}

          {d.projects.length ? <SectionHeader title="Projects" /> : null}
          {d.projects.length ? (
            <ListGroup>
              {d.projects.map((p, i) => (
                <ListRow
                  key={p.id}
                  icon="folder-outline"
                  label={p.name}
                  value={`${p.open} open · ${p.convertedMonth}${p.targetConversions ? `/${p.targetConversions}` : ""} won`}
                  onPress={() => router.push(`/project/${p.id}`)}
                  last={i === d.projects.length - 1}
                />
              ))}
            </ListGroup>
          ) : null}

          {d.byProduct.length ? <SectionHeader title="Conversions this month" /> : null}
          {d.byProduct.length ? (
            <Card style={{ gap: 8 }}>
              {d.byProduct.map((p) => (
                <View key={p.id} style={styles.line}>
                  <Text style={{ flex: 1 }}>{p.name}</Text>
                  <Text variant="label">{p.month}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          {d.bySource.length ? <SectionHeader title="Sources" /> : null}
          {d.bySource.length ? (
            <Card style={{ gap: 8 }}>
              {d.bySource.map((s) => (
                <View key={s.source} style={styles.line}>
                  <Text style={{ flex: 1 }}>{sourceLabel(s.source)}</Text>
                  <Text variant="caption">
                    {s.leads} leads · {s.converted} converted
                  </Text>
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
      {dashboard.error && !d ? <EmptyState icon="cloud-offline-outline" title="Couldn't load the dashboard" /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 28, gap: 10 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  line: { flexDirection: "row", alignItems: "center", gap: 10 },
});
