import { crmRoutes, type LeadDepositDto, type TaskDto } from "@edge/contracts";
import { countryName } from "@edge/domain/countries";
import { describeActivity } from "@edge/domain/crm/activity-text";
import { fractionToPercent } from "@edge/domain/crm/commission";
import {
  LEAD_TEMPERATURES,
  OPEN_LEAD_STAGES,
  type LeadActivityType,
  type LeadTemperature,
  type OpenLeadStage,
} from "@edge/domain/crm/enums";
import { isOpenStage } from "@edge/domain/crm/machine";
import {
  DEPOSIT_SEQUENCE_LABELS,
  DEPOSIT_STATUS_LABELS,
  EXPERIENCE_LABELS,
  FOLLOWUP_TYPE_LABELS,
  LANGUAGE_LABELS,
  LEAD_CHANNEL_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_TEMPERATURE_LABELS,
  QUALIFICATION_QUESTIONS,
  TASK_STATUS_LABELS,
} from "@edge/domain/crm/labels";
import { formatDate, formatDateTime } from "@edge/domain/dates";
import { formatMoney } from "@edge/domain/money";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { pickDateTime } from "@/components/date-fields";
import {
  ActionMenu,
  Avatar,
  BottomBar,
  buzz,
  Button,
  Card,
  Chip,
  Disclosure,
  EmptyState,
  IconButton,
  Info,
  Notice,
  Pill,
  Rise,
  SectionHeader,
  Segmented,
  Skeleton,
  SkeletonRows,
  Text,
  Tile,
  Wrap,
  type IconName,
  type MenuItem,
} from "@/components/ui";
import { api } from "@/lib/api";
import { startCall, startWhatsApp } from "@/lib/contact";
import { dueLabel, isOverdue, timeAgo, verifyPrompt } from "@/lib/format";
import { errorText, useCan, useLead } from "@/lib/queries";
import { useTheme } from "@/lib/theme";
import { toast } from "@/lib/toast";

const TEMPERATURE_OPTIONS = LEAD_TEMPERATURES.map((value) => ({ value, label: LEAD_TEMPERATURE_LABELS[value] }));
const OPEN_TASK = ["TODO", "IN_PROGRESS", "WAITING"];
const OLDER_STEP = 50;

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
  DEPOSIT_VERIFIED: "cash-outline",
};

const askFirst = (title: string, message: string, action: string, onYes: () => void) =>
  Alert.alert(title, message, [
    { text: "Keep", style: "cancel" },
    { text: action, style: "destructive", onPress: onYes },
  ]);

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

function LeadTask({
  task,
  canAct,
  onDone,
  onReschedule,
  onCancel,
  onOpen,
}: {
  task: TaskDto;
  canAct: boolean;
  onDone: () => void;
  onReschedule: () => void;
  onCancel: () => void;
  onOpen: () => void;
}) {
  const late = !!task.dueAt && isOverdue(task.dueAt);
  return (
    <Card style={{ gap: 10 }}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={{ gap: 2 }}>
        <Text variant="heading">{task.title}</Text>
        <Text variant="caption" tone={late ? "danger" : "muted"}>
          {task.dueAt ? dueLabel(task.dueAt) : "No date"}
        </Text>
        <Text variant="caption">
          {[FOLLOWUP_TYPE_LABELS[task.type], TASK_STATUS_LABELS[task.status], task.assignee?.name].filter(Boolean).join(" · ")}
        </Text>
        {task.description ? <Text style={{ marginTop: 4 }}>{task.description}</Text> : null}
      </Pressable>
      {canAct ? (
        <View style={styles.taskActions}>
          <Button label="Done" variant="soft" style={styles.smallButton} onPress={onDone} />
          <Button label="Reschedule" variant="outline" style={styles.smallButton} onPress={onReschedule} />
          <Button label="Cancel" variant="outline" style={styles.smallButton} onPress={onCancel} />
        </View>
      ) : null}
    </Card>
  );
}

function Deposit({
  deposit: d,
  canReview,
  onVerify,
  onReject,
  onDelete,
}: {
  deposit: LeadDepositDto;
  canReview: boolean;
  onVerify: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const tone = d.status === "VERIFIED" ? "accent" : d.status === "REJECTED" ? "danger" : "neutral";
  return (
    <Card style={{ gap: 6 }}>
      <View style={styles.spread}>
        <Text variant="heading" style={{ flex: 1 }}>
          {formatMoney(d.amountMinor, d.currency)}
        </Text>
        <Pill tone={tone} label={DEPOSIT_STATUS_LABELS[d.status]} />
      </View>
      <Text variant="caption">
        {[DEPOSIT_SEQUENCE_LABELS[d.sequence], formatDate(d.depositedAt), d.creditedTo ? `counts for ${d.creditedTo.name}` : null]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      {d.reference ? <Text variant="caption">Ref {d.reference}</Text> : null}
      {d.commissionMinor != null ? (
        <Text variant="caption">
          Commission {formatMoney(d.commissionMinor, d.currency)}
          {d.commissionPct ? ` (${fractionToPercent(d.commissionPct)}%)` : ""}
        </Text>
      ) : null}
      {d.status === "REJECTED" && d.rejectReason ? (
        <Text variant="caption" tone="danger">
          Rejected: {d.rejectReason}
        </Text>
      ) : null}
      {d.note ? <Text variant="caption">{d.note}</Text> : null}
      {(canReview && d.status !== "REJECTED") || d.canDelete ? (
        <View style={styles.taskActions}>
          {canReview && d.status === "PENDING" ? (
            <Button label="Verify" variant="soft" style={styles.smallButton} onPress={onVerify} />
          ) : null}
          {canReview && d.status !== "REJECTED" ? (
            <Button label="Reject" variant="outline" style={styles.smallButton} onPress={onReject} />
          ) : null}
          {d.canDelete ? <Button label="Delete" variant="outline" style={styles.smallButton} onPress={onDelete} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

export default function Lead() {
  const t = useTheme();
  const client = useQueryClient();
  const router = useRouter();
  const can = useCan();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [activity, setActivity] = useState(30);
  const [menu, setMenu] = useState(false);
  const detail = useLead(id, activity);

  const refresh = () => client.invalidateQueries();
  const done = (message: string) => {
    buzz.success();
    toast(message);
    return refresh();
  };
  const stage = useMutation({
    mutationFn: (s: OpenLeadStage) => api(crmRoutes.stage, { params: { id }, body: { stage: s } }),
    onSuccess: refresh,
  });
  const temperature = useMutation({
    mutationFn: (v: LeadTemperature) => api(crmRoutes.update, { params: { id }, body: { temperature: v } }),
    onSuccess: refresh,
  });
  const claim = useMutation({ mutationFn: () => api(crmRoutes.claim, { params: { id } }), onSuccess: () => done("Lead claimed") });
  const reschedule = useMutation({
    mutationFn: ({ taskId, dueAt }: { taskId: string; dueAt: string }) =>
      api(crmRoutes.rescheduleTask, { params: { id: taskId }, body: { dueAt } }),
    onSuccess: () => done("Rescheduled"),
  });
  const cancelTask = useMutation({
    mutationFn: (taskId: string) => api(crmRoutes.cancelTask, { params: { id: taskId } }),
    onSuccess: () => done("Task cancelled"),
  });
  const removeConversion = useMutation({
    mutationFn: (conversionId: string) => api(crmRoutes.removeConversion, { params: { id: conversionId } }),
    onSuccess: () => done("Conversion removed"),
  });
  const verify = useMutation({
    mutationFn: (depositId: string) => api(crmRoutes.verifyDeposit, { params: { id: depositId } }),
    onSuccess: () => done("Deposit verified"),
  });
  const deleteDeposit = useMutation({
    mutationFn: (depositId: string) => api(crmRoutes.deleteDeposit, { params: { id: depositId } }),
    onSuccess: () => done("Deposit deleted"),
  });
  const resend = useMutation({ mutationFn: () => api(crmRoutes.resendWelcome, { params: { id } }), onSuccess: () => done("Email sent") });

  const d = detail.data;
  if (!d) {
    if (detail.error) return <EmptyState icon="cloud-offline-outline" title="Couldn't open this lead" text={errorText(detail.error)} />;
    return <Loading />;
  }
  const { lead } = d;
  const target = lead.phone ? { leadId: lead.id, leadName: lead.name, phone: lead.phone } : null;
  const qualification = (["experience", "occupation", "purpose"] as const).filter((k) => lead.qualification[k]);
  const failed = [stage, temperature, claim, reschedule, cancelTask, removeConversion, verify, deleteDeposit, resend].find(
    (m) => m.error,
  )?.error;
  const openTasks = d.tasks.filter((task) => OPEN_TASK.includes(task.status));
  const closedTasks = d.tasks.filter((task) => !OPEN_TASK.includes(task.status));
  // The tap shows straight away; the server's answer follows.
  const shownStage = stage.isPending ? stage.variables : lead.stage;
  const shownTemperature = temperature.isPending ? temperature.variables : lead.temperature;

  const live = !lead.mergedIntoId;
  const editable = can("crm.write") && live;
  const open = editable && lead.stage !== "CONVERTED";
  const canConvert = can("crm.convert") && live && !lead.studentId;
  const otherProjects = d.options.projects.filter((p) => p.id !== lead.project.id);
  // Products this lead's project sells that it hasn't converted to yet (the server sends only the project's products).
  const markable = d.options.products.filter((p) => !d.conversions.some((c) => c.product.id === p.id));
  const verifiedMinor = d.deposits.filter((x) => x.status === "VERIFIED").reduce((n, x) => n + x.amountMinor, 0);
  const utm = [lead.utm.source, lead.utm.medium, lead.utm.campaign, lead.utm.content, lead.utm.term].filter(Boolean).join(" / ");
  const courseAndBatch = [lead.courseTitle, lead.batchName].filter(Boolean).join(" · ");
  const contactedAt = [
    lead.firstContactedAt ? `First ${formatDateTime(lead.firstContactedAt)}` : null,
    lead.lastContactedAt ? `Last ${formatDateTime(lead.lastContactedAt)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const menuItems: MenuItem[] = [
    ...(editable
      ? [{ icon: "create-outline", label: "Edit lead", onPress: () => router.push({ pathname: "/lead/edit", params: { id } }) } as MenuItem]
      : []),
    ...(editable && d.can.assign
      ? [
          {
            icon: "person-add-outline",
            label: "Assign",
            onPress: () => router.push({ pathname: "/lead/assign", params: { id } }),
          } as MenuItem,
        ]
      : []),
    ...(editable && d.can.moveProject && otherProjects.length
      ? [
          {
            icon: "swap-horizontal",
            label: "Move to another project",
            onPress: () => router.push({ pathname: "/lead/move", params: { id } }),
          } as MenuItem,
        ]
      : []),
    ...(canConvert
      ? [
          {
            icon: "school-outline",
            label: d.matchingStudent ? "Link to student" : "Convert to student",
            onPress: () => router.push({ pathname: "/lead/convert", params: { id } }),
          } as MenuItem,
        ]
      : []),
    ...(can("crm.convert") && lead.studentId
      ? [
          {
            icon: "mail-outline",
            label: "Resend set-password email",
            onPress: () =>
              Alert.alert("Resend the set-password email?", "The student gets a link to set their portal password again.", [
                { text: "Cancel", style: "cancel" },
                { text: "Send email", onPress: () => resend.mutate() },
              ]),
          } as MenuItem,
        ]
      : []),
    ...(d.can.delete && !lead.studentId
      ? [
          {
            icon: "trash-outline",
            label: "Delete lead",
            tone: "danger",
            onPress: () => router.push({ pathname: "/lead/delete", params: { id } }),
          } as MenuItem,
        ]
      : []),
  ];

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: menuItems.length
            ? () => <IconButton icon="ellipsis-vertical" label="More actions" tone="ghost" onPress={() => setMenu(true)} />
            : undefined,
        }}
      />
      <ActionMenu open={menu} onClose={() => setMenu(false)} items={menuItems} />
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
            {lead.email ? (
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`mailto:${lead.email}`)}>
                <Text variant="caption" tone="accent" numberOfLines={1}>
                  {lead.email}
                </Text>
              </Pressable>
            ) : null}
            <Text variant="caption" numberOfLines={1}>
              {[lead.project.name, LEAD_SOURCE_LABELS[lead.source], lead.sourceDetail].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </Rise>

        {lead.products.length ? (
          <Wrap>
            {lead.products.map((p) => (
              <Pill key={p.id} tone="accent" icon="trophy" label={p.name} />
            ))}
          </Wrap>
        ) : null}

        {!live ? (
          <Notice
            tone="danger"
            text="This lead was merged into another lead, so it's read-only here."
            action="Open it"
            onPress={() => router.replace(`/lead/${lead.mergedIntoId}`)}
          />
        ) : null}
        {failed ? <Notice tone="danger" text={errorText(failed)} /> : null}
        {d.can.claim ? <Button label="Claim this lead" onPress={() => claim.mutate()} busy={claim.isPending} /> : null}

        {shownStage && isOpenStage(shownStage) ? (
          <Card style={{ gap: 12 }}>
            <View style={styles.spread}>
              <Text variant="overline">Stage</Text>
              <Text variant="label">{LEAD_STAGE_LABELS[shownStage]}</Text>
            </View>
            <StageProgress stage={shownStage} />
            {open ? (
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
            ) : null}
          </Card>
        ) : (
          <Card style={{ gap: 10 }}>
            <View style={styles.spread}>
              <Text variant="overline">Stage</Text>
              <Pill
                tone={lead.stage === "LOST" ? "danger" : "accent"}
                label={`${LEAD_STAGE_LABELS[lead.stage]}${lead.lostReason ? ` · ${lead.lostReason}` : ""}`}
              />
            </View>
            {open ? (
              <Button label="Reopen as contacted" variant="soft" busy={stage.isPending} onPress={() => stage.mutate("CONTACTED")} />
            ) : null}
          </Card>
        )}

        {open ? (
          <Segmented options={TEMPERATURE_OPTIONS} value={shownTemperature ?? lead.temperature} onChange={(v) => temperature.mutate(v)} />
        ) : null}

        {lead.nextFollowUpAt ? (
          <Card style={styles.nextFollowUp}>
            <Ionicons name="calendar-outline" size={20} color={isOverdue(lead.nextFollowUpAt) ? t.destructive : t.accent} />
            <View style={{ flex: 1 }}>
              <Text variant="caption">Next follow-up</Text>
              <Text variant="label" tone={isOverdue(lead.nextFollowUpAt) ? "danger" : "default"}>
                {dueLabel(lead.nextFollowUpAt)}
              </Text>
            </View>
          </Card>
        ) : null}

        <SectionHeader
          title="Follow-ups"
          count={openTasks.length || undefined}
          action={editable ? "Add" : undefined}
          onAction={() => router.push({ pathname: "/task/new", params: { leadId: id, projectId: lead.project.id, leadName: lead.name } })}
        />
        {openTasks.length ? null : <Text variant="caption">No open follow-ups.</Text>}
        {openTasks.map((task) => (
          <Rise key={task.id}>
            <LeadTask
              task={task}
              canAct={editable}
              onOpen={() => router.push(`/task/${task.id}`)}
              onDone={() =>
                router.push({
                  pathname: "/task/done",
                  params: { id: task.id, title: task.title, type: task.type, leadId: id },
                })
              }
              onReschedule={() => pickDateTime((dueAt) => reschedule.mutate({ taskId: task.id, dueAt }))}
              onCancel={() =>
                askFirst(
                  "Cancel this task?",
                  "It moves to the closed tasks and no longer counts as the next follow-up.",
                  "Cancel task",
                  () => cancelTask.mutate(task.id),
                )
              }
            />
          </Rise>
        ))}
        {closedTasks.length ? (
          <Disclosure label={`${closedTasks.length} closed`}>
            {closedTasks.map((task) => (
              <Pressable key={task.id} accessibilityRole="button" onPress={() => router.push(`/task/${task.id}`)}>
                <Text variant="caption">
                  {task.status === "DONE" ? "Done" : "Cancelled"}: {task.title}
                  {task.completedAt ? ` · ${formatDateTime(task.completedAt)}` : ""}
                </Text>
              </Pressable>
            ))}
          </Disclosure>
        ) : null}

        {editable ? (
          <View style={styles.tiles}>
            {markable.length ? (
              <Tile
                icon="trophy-outline"
                label="Conversion"
                onPress={() => router.push({ pathname: "/lead/conversion", params: { id } })}
              />
            ) : null}
            <Tile icon="cash-outline" label="Deposit" onPress={() => router.push({ pathname: "/lead/deposit", params: { id } })} />
            {shownStage && isOpenStage(shownStage) ? (
              <Tile
                icon="close-circle-outline"
                label="Mark as lost"
                onPress={() => router.push({ pathname: "/lead/lost", params: { id } })}
              />
            ) : null}
          </View>
        ) : null}

        {d.student ? (
          <>
            <SectionHeader title="Student account" />
            <Card style={{ gap: 2 }}>
              <Text variant="heading">{d.student.name}</Text>
              <Text variant="caption">{d.student.email}</Text>
              <Text variant="caption">{d.student.enrollment ? d.student.enrollment.batchName : "Not in a batch yet."}</Text>
              {lead.convertedAt ? <Text variant="caption">Converted {formatDateTime(lead.convertedAt)}</Text> : null}
            </Card>
          </>
        ) : d.matchingStudent ? (
          <Notice text={`${d.matchingStudent.name} already has a student account with this mobile or email.`} />
        ) : null}

        {d.duplicates.length ? (
          <>
            <SectionHeader title="Possible duplicates" count={d.duplicates.length} />
            {d.duplicates.map((x) => (
              <Pressable key={x.id} accessibilityRole="button" onPress={() => router.push(`/lead/${x.id}`)}>
                <Text variant="label" tone="accent">
                  {x.name} · {x.phone ?? x.email}
                </Text>
              </Pressable>
            ))}
          </>
        ) : null}

        {d.conversions.length ? (
          <>
            <SectionHeader title="Conversions" count={d.conversions.length} />
            {d.conversions.map((c) => (
              <Card key={c.id} style={styles.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="heading">{c.product.name}</Text>
                  <Text variant="caption">
                    {formatDate(c.convertedAt)} · counts for {c.creditedTo?.name ?? "nobody"}
                  </Text>
                  {c.note ? <Text variant="caption">{c.note}</Text> : null}
                </View>
                {d.can.removeConversion ? (
                  <IconButton
                    icon="trash-outline"
                    label={`Remove ${c.product.name}`}
                    tone="ghost"
                    onPress={() =>
                      askFirst(`Remove ${c.product.name}?`, "It stops counting towards this month's figures.", "Remove", () =>
                        removeConversion.mutate(c.id),
                      )
                    }
                  />
                ) : null}
              </Card>
            ))}
          </>
        ) : null}

        {d.deposits.length ? (
          <>
            <SectionHeader title="Deposits" count={d.deposits.length} />
            {d.deposits.map((x) => (
              <Deposit
                key={x.id}
                deposit={x}
                canReview={d.can.reviewDeposits}
                onVerify={() =>
                  Alert.alert("Verify this deposit?", verifyPrompt(x), [
                    { text: "Cancel", style: "cancel" },
                    { text: "Verify", onPress: () => verify.mutate(x.id) },
                  ])
                }
                onReject={() =>
                  router.push({ pathname: "/deposit/reject", params: { id: x.id, verified: x.status === "VERIFIED" ? "1" : "" } })
                }
                onDelete={() =>
                  askFirst("Delete this deposit?", "It's removed from this lead. This can't be undone.", "Delete", () =>
                    deleteDeposit.mutate(x.id),
                  )
                }
              />
            ))}
            {verifiedMinor ? <Text variant="caption">Verified total: {formatMoney(verifiedMinor, "USD")}</Text> : null}
          </>
        ) : null}

        {qualification.length || lead.notes ? <SectionHeader title="About" /> : null}
        {qualification.length || lead.notes ? (
          <Card style={{ gap: 12 }}>
            {qualification.map((k) => (
              <Info key={k} label={QUALIFICATION_QUESTIONS[k]} value={lead.qualification[k]} />
            ))}
            <Info label="Notes" value={lead.notes} />
          </Card>
        ) : null}

        <Card>
          <Disclosure label="More details">
            <Info label="Course and batch of interest" value={courseAndBatch} />
            <Info label="Trading experience" value={lead.experienceLevel ? EXPERIENCE_LABELS[lead.experienceLevel] : null} />
            <Info label="Preferred channel" value={lead.preferredChannel ? LEAD_CHANNEL_LABELS[lead.preferredChannel] : null} />
            <Info label="Language" value={lead.language ? LANGUAGE_LABELS[lead.language] : null} />
            <Info label="Country" value={lead.country ? countryName(lead.country) : null} />
            <Info label="JetaFX client ID" value={lead.jetaFxClientId} />
            <Info label="Tags" value={lead.tags.join(", ")} />
            <Info
              label="Consent"
              value={`${lead.consent.whatsapp ? "WhatsApp OK" : "No WhatsApp consent"} · ${
                lead.consent.marketing
                  ? `Marketing${lead.consent.marketingAt ? ` (${formatDate(lead.consent.marketingAt)})` : ""}`
                  : "No marketing"
              }`}
            />
            <Info label="Contact" value={contactedAt || "Not contacted yet"} />
            <Info label="Created" value={formatDateTime(lead.createdAt)} />
            <Info label="UTM" value={utm} />
          </Disclosure>
        </Card>

        <SectionHeader
          title="Timeline"
          action={editable ? "Add note" : undefined}
          onAction={() => router.push({ pathname: "/lead/note", params: { id } })}
        />
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
                  <Text variant="caption">
                    {[timeAgo(a.createdAt), a.actorName, a.via === "CLAUDE" ? "via Claude" : null, extra].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
        {d.activityTotal > d.activities.length ? (
          <Button
            label={`Show older activity (${d.activityTotal - d.activities.length})`}
            variant="soft"
            busy={detail.isPlaceholderData}
            onPress={() => setActivity(activity + OLDER_STEP)}
          />
        ) : null}
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
  spread: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  nextFollowUp: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  progress: { flexDirection: "row", gap: 4 },
  step: { flex: 1, height: 6, borderRadius: 3 },
  chipRow: { marginHorizontal: -16 },
  chips: { gap: 8, paddingHorizontal: 16 },
  taskActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  smallButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: 13 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  entry: { flexDirection: "row", gap: 12 },
  rail: { alignItems: "center", width: 30 },
  railIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  railLine: { flex: 1, width: 2, marginVertical: 2, borderRadius: 1 },
  entryText: { flex: 1, gap: 2, paddingTop: 4, paddingBottom: 16 },
});
