import { crmRoutes } from "@edge/contracts";
import { LEADERBOARD_PERIODS, type LeaderboardPeriod } from "@edge/domain/crm/enums";
import { LEADERBOARD_PERIOD_LABELS } from "@edge/domain/crm/labels";
import { formatMoney } from "@edge/domain/money";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Avatar, Card, Chip, EmptyState, Notice, Rise, SelectField, SkeletonRows, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { errorText, useOptions } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

const usd = (minor: number) => formatMoney(minor, "USD");

export default function Leaderboard() {
  const t = useTheme();
  const options = useOptions();
  const [period, setPeriod] = useState<LeaderboardPeriod>("month");
  const [project, setProject] = useState("");
  const board = useQuery({
    queryKey: ["leaderboard", period, project],
    queryFn: () => api(crmRoutes.leaderboard, { query: { period, project: project || undefined } }),
  });
  const rows = board.data?.rows ?? [];

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={board.isRefetching}
          onRefresh={() => void board.refetch()}
          colors={[t.accent]}
          progressBackgroundColor={t.card}
        />
      }
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipRow}>
        {LEADERBOARD_PERIODS.map((p) => (
          <Chip key={p} label={LEADERBOARD_PERIOD_LABELS[p]} selected={period === p} onPress={() => setPeriod(p)} />
        ))}
      </ScrollView>
      <SelectField
        label="Project"
        value={project}
        options={options.data?.projects.map((p) => ({ value: p.id, label: p.name })) ?? []}
        onChange={setProject}
        blank="All projects"
      />
      {board.error ? <Notice tone="danger" text={errorText(board.error)} /> : null}
      {board.isPending ? <SkeletonRows count={5} /> : null}
      {board.data && !rows.length ? (
        <EmptyState icon="trophy-outline" title="Nothing yet" text="Conversions and deposits will rank here." />
      ) : null}
      {rows.map((r, i) => (
        <Rise key={r.id} index={i} moves={false}>
          <Card style={[styles.row, r.isMe && { borderColor: t.accent, backgroundColor: t.accentSoft }]}>
            <Text variant="heading" tone={r.rank === 1 ? "accent" : "muted"} style={styles.rank}>
              {r.rank}
            </Text>
            <Avatar name={r.name} size={42} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="label" numberOfLines={1}>
                {r.name}
                {r.isMe ? " (you)" : ""}
              </Text>
              <Text variant="caption" numberOfLines={1}>
                {[
                  `${r.conversions} ${r.conversions === 1 ? "conversion" : "conversions"}`,
                  usd(r.depositsMinor),
                  board.data?.showCommission && r.commissionMinor != null ? `${usd(r.commissionMinor)} commission` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
          </Card>
        </Rise>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10 },
  chipRow: { marginHorizontal: -16, flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rank: { width: 24, textAlign: "center" },
});
