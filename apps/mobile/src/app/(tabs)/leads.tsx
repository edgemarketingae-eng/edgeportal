import { crmRoutes } from "@edge/contracts";
import { OPEN_LEAD_STAGES, type OpenLeadStage } from "@edge/domain/crm/enums";
import { LEAD_STAGE_LABELS, LEAD_TEMPERATURE_LABELS } from "@edge/domain/crm/labels";
import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LeadRow } from "@/components/lead-row";
import { Chip, EmptyState, Rise, SearchField, SkeletonRows, Tap, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { dueLabel, timeAgo } from "@/lib/format";
import { useTheme } from "@/lib/theme";

const PAGE_SIZE = 30;

export default function Leads() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<OpenLeadStage | undefined>();

  useEffect(() => {
    const timer = setTimeout(() => setQ(typed.trim()), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  const leads = useInfiniteQuery({
    queryKey: ["leads", q, stage],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api(crmRoutes.leads, { query: { q, stage, sort: "recent", page: pageParam, pageSize: PAGE_SIZE } }),
    getNextPageParam: (last, _all, page) => (page * PAGE_SIZE < last.total ? page + 1 : undefined),
  });
  const rows = leads.data?.pages.flatMap((p) => p.rows) ?? [];

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
        <Text variant="title">Leads</Text>
        <SearchField value={typed} onChangeText={setTyped} placeholder="Name, number or JetaFX ID" accessibilityLabel="Search leads" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          keyboardShouldPersistTaps="handled"
          style={styles.filterRow}
        >
          {OPEN_LEAD_STAGES.map((s) => (
            <Chip key={s} label={LEAD_STAGE_LABELS[s]} selected={stage === s} onPress={() => setStage(stage === s ? undefined : s)} />
          ))}
        </ScrollView>
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
              text={q || stage ? "Try a different name, number or stage." : "Tap + to add your first one."}
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
