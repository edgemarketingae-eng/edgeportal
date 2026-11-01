import { ApiError, crmRoutes, mobileRoutes, type LeadListItem, type MobileToday, type TaskDto } from "@edge/contracts";
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS } from "@edge/domain/crm/labels";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LeadRow } from "@/components/lead-row";
import {
  Avatar,
  buzz,
  Button,
  EmptyState,
  IconButton,
  InkCard,
  Notice,
  Pill,
  Rise,
  SectionHeader,
  Skeleton,
  SkeletonRows,
  Tap,
  Text,
} from "@/components/ui";
import { api } from "@/lib/api";
import { dueLabel, greeting, isOverdue, timeAgo, todayLabel } from "@/lib/format";
import { waitingCount } from "@/lib/outbox";
import { useMe } from "@/lib/queries";
import { useTheme } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { useAppActive } from "@/lib/use-app-active";

/** The server sends at most this many of each list. */
const LIST_SIZE = 30;
const count = (n: number) => (n >= LIST_SIZE ? `${LIST_SIZE}+` : String(n));

const leadTarget = (l: LeadListItem) => (l.phone ? { leadId: l.id, leadName: l.name, phone: l.phone } : null);
const taskTarget = (task: TaskDto) =>
  task.leadId && task.leadPhone
    ? { leadId: task.leadId, leadName: task.leadName ?? task.title, phone: task.leadPhone, taskId: task.id }
    : null;

/** What needs doing today, in one line. It's the app's first and loudest thing. */
function DayCard({ day }: { day: Pick<MobileToday, "tasks" | "newLeads" | "pool"> }) {
  const overdue = day.tasks.filter((task) => task.dueAt && isOverdue(task.dueAt)).length;
  const headline = day.tasks.length
    ? `${count(day.tasks.length)} to follow up`
    : day.newLeads.length
      ? `${count(day.newLeads.length)} new ${day.newLeads.length === 1 ? "lead" : "leads"}`
      : day.pool.length
        ? `${count(day.pool.length)} to claim`
        : "All caught up";
  return (
    <InkCard style={{ gap: 6 }}>
      <Text variant="overline" tone="accent">
        Your day
      </Text>
      <Text variant="display" style={{ fontSize: 34, lineHeight: 41 }}>
        {headline}
      </Text>
      <View style={styles.pills}>
        {overdue ? <Pill tone="danger" icon="alert-circle" label={`${count(overdue)} overdue`} /> : null}
        {day.tasks.length && day.newLeads.length ? <Pill tone="accent" label={`${count(day.newLeads.length)} new`} /> : null}
        {(day.tasks.length || day.newLeads.length) && day.pool.length ? <Pill label={`${count(day.pool.length)} to claim`} /> : null}
        {!day.tasks.length && !day.newLeads.length && !day.pool.length ? <Text variant="caption">New leads will show up here.</Text> : null}
      </View>
    </InkCard>
  );
}

export default function Today() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const client = useQueryClient();
  const [waiting, setWaiting] = useState(0);
  const today = useQuery({ queryKey: ["today"], queryFn: () => api(mobileRoutes.today) });
  const me = useMe();
  const claim = useMutation({
    mutationFn: (id: string) => api(crmRoutes.claim, { params: { id } }),
    onSuccess: () => {
      buzz.success();
      toast("Lead claimed");
      return client.invalidateQueries({ queryKey: ["today"] });
    },
  });

  const refreshWaiting = useCallback(() => {
    void waitingCount().then(setWaiting);
  }, []);
  useFocusEffect(refreshWaiting);
  useAppActive(refreshWaiting);
  // Fresh data means the outbox has just drained, so the "saved on this phone" count may be out of date.
  useEffect(refreshWaiting, [refreshWaiting, today.dataUpdatedAt]);

  const d = today.data;
  const offline = today.error && !(today.error instanceof ApiError);
  const name = me.data?.user.name;
  const unread = me.data?.unreadNotifications ?? 0;
  // A new lead with a follow-up already appears under Follow-ups.
  const newLeads = d?.newLeads.filter((l) => !d.tasks.some((task) => task.leadId === l.id)) ?? [];
  const newStart = d?.tasks.length ?? 0;
  const poolStart = newStart + newLeads.length;

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
      refreshControl={
        <RefreshControl
          refreshing={today.isRefetching}
          onRefresh={() => void today.refetch()}
          colors={[t.accent]}
          progressBackgroundColor={t.card}
          progressViewOffset={insets.top}
        />
      }
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text variant="title" numberOfLines={1}>
            {name ? `${greeting()}, ${name.split(" ")[0]}` : greeting()}
          </Text>
          <Text variant="caption">{todayLabel()}</Text>
        </View>
        <View>
          <IconButton icon="notifications-outline" label="Notifications" onPress={() => router.push("/notifications")} />
          {unread ? <View style={[styles.unread, { backgroundColor: t.destructive, borderColor: t.background }]} /> : null}
        </View>
        {name ? (
          <Tap accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => router.navigate("/me")}>
            <Avatar name={name} size={44} />
          </Tap>
        ) : null}
      </View>

      {waiting ? <Notice text={`${waiting} saved on this phone, sending when there's signal.`} /> : null}
      {offline ? <Notice text="No connection. Showing the last saved list." /> : null}
      {today.error && !offline ? <Notice tone="danger" text={today.error.message} /> : null}
      {claim.error ? <Notice tone="danger" text={claim.error.message} /> : null}

      {d ? (
        <Rise>
          <DayCard day={{ ...d, newLeads }} />
        </Rise>
      ) : (
        <View style={{ gap: 10 }}>
          <Skeleton height={148} radius={28} />
          <SkeletonRows count={4} />
        </View>
      )}

      {d?.tasks.length ? <SectionHeader title="Follow-ups" count={count(d.tasks.length)} /> : null}
      {d?.tasks.map((task, i) => (
        <Rise key={task.id} index={i}>
          <LeadRow
            title={task.leadName ?? task.title}
            detail={`${task.dueAt ? dueLabel(task.dueAt) : "No date"} · ${task.title}`}
            urgent={!!task.dueAt && isOverdue(task.dueAt)}
            target={taskTarget(task)}
            onOpen={() => task.leadId && router.push(`/lead/${task.leadId}`)}
          />
        </Rise>
      ))}

      {newLeads.length ? <SectionHeader title="New leads" count={count(newLeads.length)} /> : null}
      {newLeads.map((l, i) => (
        <Rise key={l.id} index={newStart + i}>
          <LeadRow
            title={l.name}
            detail={`${timeAgo(l.createdAt)} · ${LEAD_SOURCE_LABELS[l.source]}`}
            target={leadTarget(l)}
            onOpen={() => router.push(`/lead/${l.id}`)}
          />
        </Rise>
      ))}

      {d?.pool.length ? <SectionHeader title="Unassigned" count={count(d.pool.length)} /> : null}
      {d?.pool.map((l, i) => (
        <Rise key={l.id} index={poolStart + i}>
          <LeadRow
            title={l.name}
            detail={`${timeAgo(l.createdAt)} · ${LEAD_STAGE_LABELS[l.stage]} · ${l.project.name}`}
            target={null}
            onOpen={() => router.push(`/lead/${l.id}`)}
            action={
              <Button
                label="Claim"
                variant="soft"
                style={styles.claim}
                busy={claim.isPending && claim.variables === l.id}
                onPress={() => claim.mutate(l.id)}
              />
            }
          />
        </Rise>
      ))}

      {d && !d.tasks.length && !newLeads.length && !d.pool.length ? (
        <EmptyState icon="checkmark-done" title="Nothing due right now" text="Enjoy the quiet. We'll let you know when a lead needs you." />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  unread: { position: "absolute", top: 8, right: 9, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  claim: { minHeight: 40, paddingHorizontal: 14, borderRadius: 13 },
});
