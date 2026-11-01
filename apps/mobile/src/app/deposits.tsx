import { crmRoutes, type LeadDepositDto } from "@edge/contracts";
import { fractionToPercent } from "@edge/domain/crm/commission";
import { DEPOSIT_STATUSES, LEADERBOARD_PERIODS, type DepositStatus, type LeaderboardPeriod } from "@edge/domain/crm/enums";
import { DEPOSIT_SEQUENCE_LABELS, DEPOSIT_STATUS_LABELS, LEADERBOARD_PERIOD_LABELS } from "@edge/domain/crm/labels";
import { formatDate } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { buzz, Button, Card, Chip, EmptyState, Notice, Pill, SelectField, SkeletonRows, StatCard, Tap, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { verifyPrompt } from "@/lib/format";
import { errorText } from "@/lib/queries";
import { useTheme } from "@/lib/theme";
import { toast } from "@/lib/toast";

const PAGE_SIZE = 30;
const usd = (minor: number) => formatMoney(minor, "USD");

function Row({
  deposit: d,
  manage,
  onOpen,
  onVerify,
  onReject,
}: {
  deposit: LeadDepositDto;
  manage: boolean;
  onOpen: () => void;
  onVerify: () => void;
  onReject: () => void;
}) {
  const tone = d.status === "VERIFIED" ? "accent" : d.status === "REJECTED" ? "danger" : "neutral";
  return (
    <Card style={{ gap: 6 }}>
      <Tap accessibilityRole="button" scaleTo={0.985} onPress={onOpen} style={{ gap: 4 }}>
        <View style={styles.spread}>
          <Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>
            {d.lead.name}
          </Text>
          <Pill tone={tone} label={DEPOSIT_STATUS_LABELS[d.status]} />
        </View>
        <Text variant="label">{formatMoney(d.amountMinor, d.currency)}</Text>
        <Text variant="caption">
          {[DEPOSIT_SEQUENCE_LABELS[d.sequence], formatDate(d.depositedAt), d.creditedTo?.name].filter(Boolean).join(" · ")}
        </Text>
        {d.commissionMinor != null ? <Text variant="caption">Commission {formatMoney(d.commissionMinor, d.currency)}</Text> : null}
        {d.status === "REJECTED" && d.rejectReason ? (
          <Text variant="caption" tone="danger">
            Rejected: {d.rejectReason}
          </Text>
        ) : null}
      </Tap>
      {manage && d.status !== "REJECTED" ? (
        <View style={styles.actions}>
          {d.status === "PENDING" ? <Button label="Verify" variant="soft" style={styles.smallButton} onPress={onVerify} /> : null}
          <Button label="Reject" variant="outline" style={styles.smallButton} onPress={onReject} />
        </View>
      ) : null}
    </Card>
  );
}

export default function Deposits() {
  const t = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const [status, setStatus] = useState<DepositStatus | undefined>();
  const [period, setPeriod] = useState<LeaderboardPeriod | undefined>("month");
  const [staff, setStaff] = useState("");

  const deposits = useInfiniteQuery({
    queryKey: ["deposits", status, period, staff],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api(crmRoutes.deposits, { query: { status, period, staff: staff || undefined, page: pageParam, pageSize: PAGE_SIZE } }),
    getNextPageParam: (last, _all, page) => (page * PAGE_SIZE < last.total ? page + 1 : undefined),
  });
  const verify = useMutation({
    mutationFn: (id: string) => api(crmRoutes.verifyDeposit, { params: { id } }),
    onSuccess: () => {
      buzz.success();
      toast("Deposit verified");
      return client.invalidateQueries();
    },
  });
  const first = deposits.data?.pages[0];
  const rows = deposits.data?.pages.flatMap((p) => p.rows) ?? [];
  const summary = first?.summary;

  return (
    <FlatList
      data={rows}
      keyExtractor={(d) => d.id}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={deposits.isRefetching}
          onRefresh={() => void deposits.refetch()}
          colors={[t.accent]}
          progressBackgroundColor={t.card}
        />
      }
      onEndReached={() => void deposits.fetchNextPage()}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          {deposits.error ? <Notice tone="danger" text={errorText(deposits.error)} /> : null}
          {verify.error ? <Notice tone="danger" text={errorText(verify.error)} /> : null}
          {summary ? (
            <View style={styles.stats}>
              <StatCard value={usd(summary.verifiedMinor)} label={`Verified (${summary.verifiedCount})`} />
              <StatCard value={usd(summary.pendingMinor)} label={`Pending (${summary.pendingCount})`} />
              <StatCard value={usd(summary.commissionMinor)} label="Commission" />
            </View>
          ) : null}
          {summary?.month ? (
            <Text variant="caption">
              {usd(summary.month.laterMinor)} in later deposits this month earns {fractionToPercent(summary.month.pct)}%
              {summary.month.next ? `. ${fractionToPercent(summary.month.next.pct)}% from ${usd(summary.month.next.fromMinor)}.` : "."}
            </Text>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipRow}>
            {LEADERBOARD_PERIODS.map((p) => (
              <Chip
                key={p}
                label={LEADERBOARD_PERIOD_LABELS[p]}
                selected={period === p}
                onPress={() => setPeriod(period === p ? undefined : p)}
              />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipRow}>
            {DEPOSIT_STATUSES.map((s) => (
              <Chip
                key={s}
                label={DEPOSIT_STATUS_LABELS[s]}
                selected={status === s}
                onPress={() => setStatus(status === s ? undefined : s)}
              />
            ))}
          </ScrollView>
          {first?.manage ? (
            <SelectField
              label="Person"
              value={staff}
              options={first.staff.map((s) => ({ value: s.id, label: s.name }))}
              onChange={setStaff}
              blank="Everyone"
            />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        deposits.isPending ? (
          <SkeletonRows count={4} />
        ) : (
          <EmptyState icon="cash-outline" title="No deposits here" text="Try a different period or status." />
        )
      }
      renderItem={({ item: d }) => (
        <Row
          deposit={d}
          manage={!!first?.manage}
          onOpen={() => router.push(`/lead/${d.lead.id}`)}
          onVerify={() =>
            Alert.alert("Verify this deposit?", verifyPrompt(d), [
              { text: "Cancel", style: "cancel" },
              { text: "Verify", onPress: () => verify.mutate(d.id) },
            ])
          }
          onReject={() => router.push({ pathname: "/deposit/reject", params: { id: d.id, verified: d.status === "VERIFIED" ? "1" : "" } })}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chipRow: { marginHorizontal: -16, flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16 },
  spread: { flexDirection: "row", alignItems: "center", gap: 10 },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  smallButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 13 },
});
