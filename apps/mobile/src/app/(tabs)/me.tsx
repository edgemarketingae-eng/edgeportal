import { crmRoutes, meRoutes, mobileRoutes } from "@edge/contracts";
import { formatMoney } from "@edge/domain/money";
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CallTracker } from "../../../modules/call-tracker";
import { Avatar, Card, InkCard, ListGroup, ListRow, Pill, Rise, Skeleton, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

const usd = (minor: number) => formatMoney(minor, "USD");

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <Card style={styles.stat}>
      <Text variant="title" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption">{label}</Text>
    </Card>
  );
}

export default function Me() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useSession();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api(meRoutes.me) });
  const board = useQuery({ queryKey: ["leaderboard"], queryFn: () => api(crmRoutes.leaderboard, { query: { period: "month" } }) });
  const [tracking, setTracking] = useState(true);
  useFocusEffect(useCallback(() => setTracking(CallTracker.hasCallLogAccess()), []));

  const mine = board.data?.me;
  const rank = board.data?.rows.find((r) => r.isMe)?.rank;
  const unread = me.data?.unreadNotifications ?? 0;

  const confirmSignOut = () =>
    Alert.alert("Sign out?", "You'll need to sign in again to use the app on this phone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          // The token goes either way, so a failed request (no signal) doesn't keep anyone signed in here.
          void api(mobileRoutes.signOut)
            .catch(() => {})
            .finally(signOut);
        },
      },
    ]);

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
      refreshControl={
        <RefreshControl
          refreshing={board.isRefetching}
          onRefresh={() => {
            void board.refetch();
            void me.refetch();
          }}
          colors={[t.accent]}
          progressBackgroundColor={t.card}
          progressViewOffset={insets.top}
        />
      }
    >
      <View style={styles.profile}>
        {me.data ? <Avatar name={me.data.user.name} size={60} /> : <Skeleton width={60} height={60} radius={30} />}
        <View style={{ flex: 1, gap: 2 }}>
          {me.data ? (
            <>
              <Text variant="title" numberOfLines={1}>
                {me.data.user.name}
              </Text>
              <Text variant="caption" numberOfLines={1}>
                {me.data.user.email}
              </Text>
            </>
          ) : (
            <>
              <Skeleton width="60%" height={20} />
              <Skeleton width="80%" height={12} />
            </>
          )}
        </View>
      </View>

      {mine ? (
        <Rise moves={false} style={{ gap: 10 }}>
          <InkCard style={{ gap: 4 }}>
            <View style={styles.earningsTop}>
              <Text variant="overline" tone="accent">
                This month
              </Text>
              {rank ? <Pill tone="accent" icon="trophy" label={`#${rank} on the leaderboard`} /> : null}
            </View>
            <Text variant="display" style={{ fontSize: 34, lineHeight: 41 }}>
              {usd(mine.commissionMinor)}
            </Text>
            <Text variant="caption">Your commission</Text>
          </InkCard>
          <View style={styles.stats}>
            <Stat value={mine.conversions} label="Conversions" />
            <Stat value={usd(mine.depositsMinor)} label="Verified deposits" />
          </View>
          {mine.pendingCount ? (
            <Text variant="caption" style={{ paddingHorizontal: 4 }}>
              {mine.pendingCount} deposit{mine.pendingCount === 1 ? "" : "s"} waiting for verification ({usd(mine.pendingMinor)})
            </Text>
          ) : null}
        </Rise>
      ) : null}

      <Text variant="overline" style={styles.groupTitle}>
        Settings
      </Text>
      <ListGroup>
        <ListRow
          icon="notifications-outline"
          label="Notifications"
          value={unread ? `${unread} new` : undefined}
          onPress={() => router.push("/notifications")}
        />
        <ListRow icon="call-outline" label="Call tracking" value={tracking ? "On" : "Off"} onPress={() => router.push("/call-tracking")} />
        <ListRow icon="log-out-outline" label="Sign out" tone="danger" onPress={confirmSignOut} last />
      </ListGroup>
      <Text variant="caption" style={styles.version}>
        Version {Constants.expoConfig?.version}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  profile: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 6 },
  earningsTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 },
  stats: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, gap: 2 },
  groupTitle: { marginTop: 12, paddingHorizontal: 4 },
  version: { textAlign: "center", marginTop: 6 },
});
