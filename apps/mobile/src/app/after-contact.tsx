import type { CallSheetInput } from "@edge/contracts";
import { CALL_OUTCOMES, type CallDirection, type CallOutcome } from "@edge/domain/crm/enums";
import { CALL_OUTCOME_LABELS, LEAD_STAGE_LABELS } from "@edge/domain/crm/labels";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { toDubaiLocal } from "@edge/domain/dates";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { CallTracker, type DeviceCall } from "../../modules/call-tracker";
import { Button, buzz, Chip, Field, type IconName, Sheet, Text, Tile, Wrap } from "@/components/ui";
import { findCallRow } from "@/lib/contact";
import { dueLabel, FOLLOW_UP_CHOICES, talkTime } from "@/lib/format";
import { enqueue, type OutboxJob } from "@/lib/outbox";
import { toast } from "@/lib/toast";

const OUTCOME_ICONS: Record<CallOutcome, IconName> = {
  ANSWERED: "checkmark-circle-outline",
  NO_ANSWER: "close-circle-outline",
  BUSY: "time-outline",
  WRONG_NUMBER: "alert-circle-outline",
  CALLBACK: "arrow-undo-outline",
};

const STAGES = ["CONTACTED", "QUALIFIED", "CONSULTATION", "NEGOTIATION"] as const;
type SheetStage = (typeof STAGES)[number];

const WAIT_FOR_ROW_MS = 6000;

interface Params extends Record<string, string> {
  kind: "call" | "whatsapp";
  leadId: string;
  leadName: string;
  phone: string;
  taskId: string;
  tappedAt: string;
  /** Set when this opened from a notification, because the call is already known. */
  startedAt: string;
  durationSec: string;
  direction: string;
}

/** The call log row appears as the call ends, which can be a moment after the app comes back. */
function useCallRow(phone: string, tappedAt: number, skip: boolean) {
  const [row, setRow] = useState<DeviceCall | null>(null);
  const [gaveUp, setGaveUp] = useState(skip);
  useEffect(() => {
    if (skip) return;
    const started = Date.now();
    const timer = setInterval(() => {
      const found = findCallRow(phone, tappedAt);
      if (found) setRow(found);
      if (found || Date.now() - started > WAIT_FOR_ROW_MS) {
        setGaveUp(!found);
        clearInterval(timer);
      }
    }, 800);
    return () => clearInterval(timer);
  }, [phone, tappedAt, skip]);
  return { row, gaveUp };
}

async function pickDateTime(onPicked: (local: string) => void) {
  const now = new Date();
  DateTimePickerAndroid.open({
    value: now,
    minimumDate: now,
    mode: "date",
    onChange: (e, day) => {
      if (e.type !== "set" || !day) return;
      DateTimePickerAndroid.open({
        value: day,
        mode: "time",
        onChange: (e2, time) => {
          if (e2.type === "set" && time) onPicked(toDubaiLocal(time));
        },
      });
    },
  });
}

export default function AfterContact() {
  const router = useRouter();
  const client = useQueryClient();
  const p = useLocalSearchParams<Params>();
  const whatsapp = p.kind === "whatsapp";
  const fromNotification = !!p.startedAt;
  const tappedAt = Number(p.tappedAt) || Date.now();
  const { row, gaveUp } = useCallRow(p.phone ?? "", tappedAt, whatsapp || fromNotification);

  const startedAt = fromNotification ? Number(p.startedAt) : (row?.startedAt ?? tappedAt);
  const durationSec = fromNotification ? Number(p.durationSec) : (row?.durationSec ?? 0);
  const direction = (fromNotification ? p.direction : (row?.direction ?? "OUT")) as CallDirection;
  const known = fromNotification || !!row;

  const [picked, setPicked] = useState<CallOutcome | null>(null);
  const suggested: CallOutcome | null = known ? (durationSec >= 5 ? "ANSWERED" : "NO_ANSWER") : null;
  const outcome = picked ?? suggested;
  const [note, setNote] = useState("");
  const [stage, setStage] = useState<SheetStage | null>(null);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [followUpLabel, setFollowUpLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const choose = (label: string, at: string) => {
    const off = followUpLabel === label;
    setFollowUpLabel(off ? null : label);
    setFollowUp(off ? null : at);
  };

  const save = async () => {
    setSaving(true);
    const sheet: CallSheetInput | null =
      !whatsapp && outcome
        ? {
            leadId: p.leadId,
            number: row?.number ?? p.phone,
            countryIso: row?.countryIso,
            startedAt,
            durationSec,
            direction,
            estimated: !known,
            outcome,
            body: note.trim(),
            taskId: p.taskId || undefined,
            nextFollowUpAt: followUp ?? undefined,
          }
        : null;
    const message = { note: note.trim(), nextFollowUpAt: followUp ?? undefined };
    const jobs: OutboxJob[] = sheet
      ? [{ kind: "sheet", body: sheet }]
      : p.taskId
        ? [{ kind: "completeTask", taskId: p.taskId, body: message }]
        : [{ kind: "activity", leadId: p.leadId, body: { type: "WHATSAPP", body: message.note, nextFollowUpAt: message.nextFollowUpAt } }];
    if (stage) jobs.push({ kind: "stage", leadId: p.leadId, stage });
    await enqueue(jobs);
    if (fromNotification) CallTracker.dismissPrompt(startedAt);
    void client.invalidateQueries();
    buzz.success();
    toast("Saved");
    router.back();
  };

  const summary = whatsapp
    ? "WhatsApp"
    : known
      ? `${direction === "IN" ? "Incoming call" : direction === "OUT" ? "Outgoing call" : "Missed call"} · ${talkTime(durationSec)}`
      : gaveUp
        ? "The talk time will be added once the call has ended."
        : "Getting the call details…";

  return (
    <Sheet
      actions={
        <>
          <Button label="Skip" variant="soft" style={{ flex: 1 }} onPress={() => router.back()} />
          <Button label="Save" style={{ flex: 2 }} onPress={() => void save()} busy={saving} disabled={!whatsapp && !outcome} />
        </>
      }
    >
      <View style={{ gap: 2 }}>
        <Text variant="title">How did it go?</Text>
        <Text variant="caption">{[p.leadName, summary].filter(Boolean).join(" · ")}</Text>
      </View>

      {!whatsapp ? (
        <Wrap>
          {CALL_OUTCOMES.map((o) => (
            <Tile key={o} icon={OUTCOME_ICONS[o]} label={CALL_OUTCOME_LABELS[o]} selected={outcome === o} onPress={() => setPicked(o)} />
          ))}
        </Wrap>
      ) : null}

      <Field
        label="Note"
        value={note}
        onChangeText={setNote}
        multiline
        placeholder="Optional. The mic on your keyboard works here."
        style={{ minHeight: 72, textAlignVertical: "top" }}
      />

      <View style={{ gap: 8 }}>
        <Text variant="label">Next follow-up</Text>
        <Wrap>
          {FOLLOW_UP_CHOICES.map((c) => (
            <Chip key={c.label} label={c.label} selected={followUpLabel === c.label} onPress={() => choose(c.label, c.at())} />
          ))}
          <Chip
            label={followUpLabel === "custom" && followUp ? dueLabel(`${followUp}:00+04:00`) : "Pick a time"}
            selected={followUpLabel === "custom"}
            onPress={() =>
              void pickDateTime((local) => {
                setFollowUpLabel("custom");
                setFollowUp(local);
              })
            }
          />
        </Wrap>
      </View>

      <View style={{ gap: 8 }}>
        <Text variant="label">Move stage</Text>
        <Wrap>
          {STAGES.map((s) => (
            <Chip key={s} label={LEAD_STAGE_LABELS[s]} selected={stage === s} onPress={() => setStage(stage === s ? null : s)} />
          ))}
        </Wrap>
      </View>
    </Sheet>
  );
}
