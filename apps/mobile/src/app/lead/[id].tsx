import { crmRoutes } from "@edge/contracts";
import { describeActivity } from "@edge/domain/crm/activity-text";
import {
  LEAD_TEMPERATURES,
  OPEN_LEAD_STAGES,
  type LeadActivityType,
  type LeadTemperature,
  type OpenLeadStage,
} from "@edge/domain/crm/enums";
import { isOpenStage } from "@edge/domain/crm/machine";
import { LEAD_STAGE_LABELS, LEAD_TEMPERATURE_LABELS, QUALIFICATION_QUESTIONS } from "@edge/domain/crm/labels";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  Avatar,
  BottomBar,
  buzz,
  Button,
  Card,
  Chip,
  EmptyState,
  Notice,
  Pill,
  Rise,
  SectionHeader,
  Segmented,
  Skeleton,
  SkeletonRows,
  Text,
  Tile,
  type IconName,
} from "@/components/ui";
import { api } from "@/lib/api";
import { startCall, startWhatsApp } from "@/lib/contact";
import { dueLabel, timeAgo } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { toast } from "@/lib/toast";

const TEMPERATURE_OPTIONS = LEAD_TEMPERATURES.map((value) => ({ value, label: LEAD_TEMPERATURE_LABELS[value] }));

const ACTIVITY_ICONS: Partial<Record<LeadActivityType, IconName>> = {
  NOTE: "document-text-outline",
  CALL: "call-outline",
  WHATSAPP: "logo-whatsapp",
  EMAIL: "mail-outline",
  MEETING: "people-outline",
  CREATED: "sparkles-outline",
  STAGE_CHANGED: "flag-outline",
  ASSIGNED: "person-add-outline",
  CLAIMED: "person-add-outline",
  TASK_CREATED: "calendar-outline",
  TASK_DONE: "checkmark-circle-outline",
  INBOUND: "arrow-down-circle-outline",
  CONVERTED: "school-outline",
  PRODUCT_CONVERTED: "trophy-outline",
  DEPOSIT_LOGGED: "cash-outline",
};

function Loading() {
  return (
    <View style={styles.content}>
      <View style={styles.identity}>
        <Skeleton width={64} height={64} radius={32} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="60%" height={20} />
          <Skeleton width="80%" height={12} />
        </View>
      </View>
      <SkeletonRows count={4} />
    </View>
  );
}

function StageProgress({ stage }: { stage: OpenLeadStage }) {
  const t = useTheme();
  const reached = OPEN_LEAD_STAGES.indexOf(stage);
  return (
    <View style={styles.progress}>
      {OPEN_LEAD_STAGES.map((s, i) => (
        <View key={s} style={[styles.step, { backgroundColor: i <= reached ? t.primary : t.muted }]} />
      ))}
    </View>
  );
}

export default function Lead() {
  const t = useTheme();
  const client = useQueryClient();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useQuery({ queryKey: ["lead", id], queryFn: () => api(crmRoutes.lead, { params: { id }, query: { activity: 30 } }) });

  const refresh = () => client.invalidateQueries();
  const stage = useMutation({
    mutationFn: (s: OpenLeadStage) => api(crmRoutes.stage, { params: { id }, body: { stage: s } }),
    onSuccess: refresh,
  });
  const temperature = useMutation({
    mutationFn: (v: LeadTemperature) => api(crmRoutes.update, { params: { id }, body: { temperature: v } }),
    onSuccess: refresh,
  });
  const claim = useMutation({ mutationFn: () => api(crmRoutes.claim, { params: { id } }), onSuccess: refresh });
  const done = useMutation({
    mutationFn: (taskId: string) => api(crmRoutes.completeTask, { params: { id: taskId }, body: {} }),
    onSuccess: () => {
      buzz.success();
      toast("Follow-up done");
      return refresh();
    },
  });

  const d = detail.data;
  if (!d) {
    if (detail.error) return <EmptyState icon="cloud-offline-outline" title="Couldn't open this lead" text={detail.error.message} />;
    return <Loading />;
  }
  const { lead } = d;
  const target = lead.phone ? { leadId: lead.id, leadName: lead.name, phone: lead.phone } : null;
  const qualification = (["experience", "occupation", "purpose"] as const).filter((k) => lead.qualification[k]);
  const failed = stage.error ?? temperature.error ?? claim.error ?? done.error;
  const openTasks = d.tasks.filter((task) => !["DONE", "CANCELLED"].includes(task.status));
  // The tap shows straight away; the server's answer follows.
  const shownStage = stage.isPending ? stage.variables : lead.stage;
  const shownTemperature = temperature.isPending ? temperature.variables : lead.temperature;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Rise moves={false} style={styles.identity}>
          <Avatar name={lead.name} size={64} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="title" numberOfLines={2}>
              {lead.name}
            </Text>
            <Text variant="caption" numberOfLines={1}>
              {[lead.phone, lead.owner?.name ?? "Unassigned"].filter(Boolean).join(" · ")}
            </Text>
            <Text variant="caption" numberOfLines={1}>
              {lead.project.name}
            </Text>
          </View>
        </Rise>

        {failed ? <Notice tone="danger" text={failed.message} /> : null}
        {d.can.claim ? <Button label="Claim this lead" onPress={() => claim.mutate()} busy={claim.isPending} /> : null}

        {isOpenStage(shownStage) ? (
          <Card style={{ gap: 12 }}>
            <View style={styles.stageTop}>
              <Text variant="overline">Stage</Text>
              <Text variant="label">{LEAD_STAGE_LABELS[shownStage]}</Text>
            </View>
            <StageProgress stage={shownStage} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipRow}>
              {OPEN_LEAD_STAGES.map((s) => (
                <Chip
                  key={s}
                  label={LEAD_STAGE_LABELS[s]}
                  selected={shownStage === s}
                  onPress={() => shownStage !== s && stage.mutate(s)}
                />
              ))}
            </ScrollView>
          </Card>
        ) : (
          <View style={{ alignSelf: "flex-start" }}>
            <Pill
              tone={lead.stage === "LOST" ? "danger" : "accent"}
              label={`${LEAD_STAGE_LABELS[lead.stage]}${lead.lostReason ? ` · ${lead.lostReason}` : ""}`}
            />
          </View>
        )}

        <Segmented options={TEMPERATURE_OPTIONS} value={shownTemperature ?? lead.temperature} onChange={(v) => temperature.mutate(v)} />

        {openTasks.length ? <SectionHeader title="Next up" /> : null}
        {openTasks.map((task) => (
          <Rise key={task.id}>
            <Card style={styles.task}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="heading">{task.title}</Text>
                <Text variant="caption">{task.dueAt ? dueLabel(task.dueAt) : "No date"}</Text>
              </View>
              <Button
                label="Done"
                variant="soft"
                style={styles.smallButton}
                busy={done.isPending && done.variables === task.id}
                onPress={() => done.mutate(task.id)}
              />
            </Card>
          </Rise>
        ))}

        <View style={styles.tiles}>
          <Tile icon="trophy-outline" label="Conversion" onPress={() => router.push({ pathname: "/lead/conversion", params: { id } })} />
          <Tile icon="cash-outline" label="Deposit" onPress={() => router.push({ pathname: "/lead/deposit", params: { id } })} />
          {isOpenStage(lead.stage) ? (
            <Tile
              icon="close-circle-outline"
              label="Mark as lost"
              onPress={() => router.push({ pathname: "/lead/lost", params: { id } })}
            />
          ) : null}
        </View>

        {qualification.length || lead.notes ? <SectionHeader title="About" /> : null}
        {qualification.length || lead.notes ? (
          <Card style={{ gap: 12 }}>
            {qualification.map((k) => (
              <View key={k} style={{ gap: 2 }}>
                <Text variant="caption">{QUALIFICATION_QUESTIONS[k]}</Text>
                <Text>{lead.qualification[k]}</Text>
              </View>
            ))}
            {lead.notes ? (
              <View style={{ gap: 2 }}>
                <Text variant="caption">Notes</Text>
                <Text>{lead.notes}</Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        <SectionHeader title="Timeline" />
        <View>
          {d.activities.map((a, i) => {
            const { title, detail: extra } = describeActivity(a);
            const last = i === d.activities.length - 1;
            return (
              <View key={a.id} style={styles.entry}>
                <View style={styles.rail}>
                  <View style={[styles.railIcon, { backgroundColor: t.muted }]}>
                    <Ionicons name={ACTIVITY_ICONS[a.type] ?? "ellipse-outline"} size={15} color={t.mutedForeground} />
                  </View>
                  {last ? null : <View style={[styles.railLine, { backgroundColor: t.border }]} />}
                </View>
                <View style={styles.entryText}>
                  <Text variant="label">{title}</Text>
                  {a.body ? <Text>{a.body}</Text> : null}
                  <Text variant="caption">{[timeAgo(a.createdAt), a.actorName, extra].filter(Boolean).join(" · ")}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      {target ? (
        <BottomBar>
          <Button label="WhatsApp" icon="logo-whatsapp" variant="soft" style={{ flex: 1 }} onPress={() => void startWhatsApp(target)} />
          <Button label="Call" icon="call" style={{ flex: 1 }} onPress={() => void startCall(target)} />
        </BottomBar>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24, gap: 12 },
  identity: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 4 },
  stageTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progress: { flexDirection: "row", gap: 4 },
  step: { flex: 1, height: 6, borderRadius: 3 },
  chipRow: { marginHorizontal: -16 },
  chips: { gap: 8, paddingHorizontal: 16 },
  task: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  smallButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 13 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  entry: { flexDirection: "row", gap: 12 },
  rail: { alignItems: "center", width: 30 },
  railIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  railLine: { flex: 1, width: 2, marginVertical: 2, borderRadius: 1 },
  entryText: { flex: 1, gap: 2, paddingTop: 4, paddingBottom: 16 },
});
