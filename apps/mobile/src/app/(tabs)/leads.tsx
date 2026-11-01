import { crmRoutes } from "@edge/contracts";
import {
  LEAD_SOURCES,
  LEAD_STAGES,
  LEAD_TEMPERATURES,
  type LeadSource,
  type LeadStage,
  type LeadTemperature,
} from "@edge/domain/crm/enums";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS, LEAD_TEMPERATURE_LABELS } from "@edge/domain/crm/labels";
import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LeadRow } from "@/components/lead-row";
import { Chip, EmptyState, IconButton, Rise, SearchField, SelectField, SkeletonRows, Tap, Text, Wrap } from "@/components/ui";
import { api } from "@/lib/api";
import { dueLabel, timeAgo } from "@/lib/format";
import { useCan, useOptions } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

const PAGE_SIZE = 30;

const VIEWS = [
  { label: "Open", query: {} },
  { label: "Mine", query: { owner: "me" } },
  { label: "Unassigned", query: { owner: "unassigned" } },
  { label: "Overdue", query: { due: "overdue" } },
  { label: "Due today", query: { due: "today" } },
  { label: "All", query: { view: "all" } },
] as const;

export default function Leads() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const params = useLocalSearchParams<{ project?: string }>();
  const can = useCan();
  const options = useOptions();
  const [view, setView] = useState<(typeof VIEWS)[number]["label"]>("Open");
  const [filters, setFilters] = useState(false);
  const [stage, setStage] = useState<LeadStage | undefined>();
  const [temperature, setTemperature] = useState<LeadTemperature | undefined>();
  const [source, setSource] = useState("");
  const [project, setProject] = useState(params.project ?? "");
  const [owner, setOwner] = useState("");
  const [seenParam, setSeenParam] = useState(params.project);
  // A project page can send people here, and this tab stays mounted, so its filter has to follow.
  if (params.project !== seenParam) {
    setSeenParam(params.project);
    setProject(params.project ?? "");
  }

  useEffect(() => {
    const timer = setTimeout(() => setQ(typed.trim()), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  const leads = useInfiniteQuery({
    queryKey: ["leads", q, view, stage, temperature, source, project, owner],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api(crmRoutes.leads, {
        query: {
          ...VIEWS.find((v) => v.label === view)?.query,
          ...(owner ? { owner } : {}),
          q,
          stage,
          temperature,
          source: (source || undefined) as LeadSource | undefined,
          project: project || undefined,
          sort: "recent",
          page: pageParam,
          pageSize: PAGE_SIZE,
        },
      }),
    getNextPageParam: (last, _all, page) => (page * PAGE_SIZE < last.total ? page + 1 : undefined),
  });
  const rows = leads.data?.pages.flatMap((p) => p.rows) ?? [];
  const filtered = !!stage || !!temperature || !!source || !!project || !!owner;
  const owners = [
    ...new Map(
      Object.values(options.data?.teams ?? {})
        .flat()
        .map((o) => [o.id, o]),
    ).values(),
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
        <View style={styles.titleRow}>
          <Text variant="title" style={{ flex: 1 }}>
            Leads
          </Text>
          <View>
            <IconButton icon="options-outline" label="Filters" onPress={() => setFilters(!filters)} />
            {filtered ? <View style={[styles.dot, { backgroundColor: t.primary, borderColor: t.background }]} /> : null}
          </View>
        </View>
        <SearchField value={typed} onChangeText={setTyped} placeholder="Name, number or JetaFX ID" accessibilityLabel="Search leads" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          keyboardShouldPersistTaps="handled"
          style={styles.filterRow}
        >
          {VIEWS.map((v) => (
            <Chip key={v.label} label={v.label} selected={view === v.label} onPress={() => setView(v.label)} />
          ))}
        </ScrollView>
        {filters ? (
          <ScrollView style={styles.panel} contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
            <Text variant="label">Stage</Text>
            <Wrap>
              {LEAD_STAGES.map((s) => (
                <Chip key={s} label={LEAD_STAGE_LABELS[s]} selected={stage === s} onPress={() => setStage(stage === s ? undefined : s)} />
              ))}
            </Wrap>
            <Text variant="label">Temperature</Text>
            <Wrap>
              {LEAD_TEMPERATURES.map((v) => (
                <Chip
                  key={v}
                  label={LEAD_TEMPERATURE_LABELS[v]}
                  selected={temperature === v}
                  onPress={() => setTemperature(temperature === v ? undefined : v)}
                />
              ))}
            </Wrap>
            <SelectField
              label="Project"
              value={project}
              options={options.data?.projects.map((p) => ({ value: p.id, label: p.name })) ?? []}
              onChange={setProject}
              blank="All projects"
            />
            <SelectField
              label="Source"
              value={source}
              options={LEAD_SOURCES.map((value) => ({ value, label: LEAD_SOURCE_LABELS[value] }))}
              onChange={setSource}
              blank="All sources"
            />
            {can("crm.assign") ? (
              <SelectField
                label="Owner"
                value={owner}
                options={owners.map((o) => ({ value: o.id, label: o.name }))}
                onChange={setOwner}
                blank="Anyone"
              />
            ) : null}
          </ScrollView>
        ) : null}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={leads.isRefetching}
            onRefresh={() => void leads.refetch()}
            colors={[t.accent]}
            progressBackgroundColor={t.card}
          />
        }
        onEndReached={() => void leads.fetchNextPage()}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          leads.isPending ? (
            <SkeletonRows count={6} />
          ) : (
            <EmptyState
              icon="search"
              title="No leads found"
              text={q || filtered || view !== "Open" ? "Try a different search or filter." : "Tap + to add your first one."}
            />
          )
        }
        renderItem={({ item: l, index }) => (
          <Rise index={index} moves={false}>
            <LeadRow
              title={l.name}
              detail={[
                LEAD_STAGE_LABELS[l.stage],
                LEAD_TEMPERATURE_LABELS[l.temperature],
                l.nextFollowUpAt ? dueLabel(l.nextFollowUpAt) : l.lastActivityAt ? timeAgo(l.lastActivityAt) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              target={l.phone ? { leadId: l.id, leadName: l.name, phone: l.phone } : null}
              onOpen={() => router.push(`/lead/${l.id}`)}
            />
          </Rise>
        )}
      />
      <Tap
        accessibilityRole="button"
        accessibilityLabel="Add a lead"
        feedback="tap"
        scaleTo={0.9}
        onPress={() => router.push("/lead/new")}
        style={[styles.add, { backgroundColor: t.primary }]}
      >
        <Ionicons name="add" size={28} color={t.onPrimary} />
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingBottom: 6, gap: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { position: "absolute", top: 8, right: 9, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  panel: { maxHeight: 320 },
  filterRow: { marginHorizontal: -16, flexGrow: 0 },
  filters: { gap: 8, paddingHorizontal: 16 },
  list: { paddingHorizontal: 16, paddingTop: 8, gap: 8, paddingBottom: 96 },
  add: {
    position: "absolute",
    right: 18,
    bottom: 18,
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 10px 24px rgba(3, 98, 76, 0.35)",
  },
});
