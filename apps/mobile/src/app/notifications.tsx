import { meRoutes } from "@edge/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { Card, EmptyState, Notice, Rise, SkeletonRows, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { useTheme } from "@/lib/theme";

export default function Notifications() {
  const t = useTheme();
  const client = useQueryClient();
  const inbox = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api(meRoutes.notifications, { query: { pageSize: 30 } }),
    refetchOnMount: "always",
  });
  // Fetching this list marks it read on the server, so the dot on the bell is out of date now.
  useEffect(() => {
    if (inbox.dataUpdatedAt) void client.invalidateQueries({ queryKey: ["me"] });
  }, [client, inbox.dataUpdatedAt]);

  return (
    <FlatList
      data={inbox.data?.rows ?? []}
      keyExtractor={(n) => n.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={inbox.isRefetching}
          onRefresh={() => void inbox.refetch()}
          colors={[t.accent]}
          progressBackgroundColor={t.card}
        />
      }
      ListHeaderComponent={inbox.error ? <Notice tone="danger" text={inbox.error.message} /> : undefined}
      ListEmptyComponent={
        inbox.isPending ? (
          <SkeletonRows count={5} />
        ) : (
          <EmptyState icon="notifications-outline" title="Nothing new" text="Alerts about your leads and follow-ups will appear here." />
        )
      }
      renderItem={({ item: n, index }) => (
        <Rise index={index} moves={false}>
          <Card style={styles.row}>
            <View style={[styles.dot, { backgroundColor: n.readAt ? "transparent" : t.primary }]} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="heading">{n.title}</Text>
              {n.body ? <Text>{n.body}</Text> : null}
              <Text variant="caption">{timeAgo(n.createdAt)}</Text>
            </View>
          </Card>
        </Rise>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  row: { flexDirection: "row", gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
});
