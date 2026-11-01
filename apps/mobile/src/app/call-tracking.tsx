import { mobileRoutes } from "@edge/contracts";
import { parsePhone } from "@edge/domain/phone";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Linking, PermissionsAndroid, Platform, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { CallTracker, trackerRuns, type DeviceCall, type TrackerRun } from "../../modules/call-tracker";
import { Button, Card, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { talkTime } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { useAppActive } from "@/lib/use-app-active";

const time = (ms: number) => new Date(ms).toLocaleString();

function deviceSummary() {
  const c = Platform.constants as unknown as { Brand?: string; Model?: string; Release?: string };
  return `${c.Brand ?? "?"} ${c.Model ?? "?"}, Android ${c.Release ?? Platform.Version}`;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="heading">{value}</Text>
      <Text variant="caption">{label}</Text>
    </View>
  );
}

/** A quiet extra. Technical details are for checking a phone when tracking looks wrong; the shared report leaves out numbers. */
export default function CallTracking() {
  const t = useTheme();
  const today = useQuery({ queryKey: ["today"], queryFn: () => api(mobileRoutes.today) });
  const [allowed, setAllowed] = useState(false);
  const [calls, setCalls] = useState<DeviceCall[]>([]);
  const [runs, setRuns] = useState<TrackerRun[]>([]);
  const [technical, setTechnical] = useState(false);

  const refresh = useCallback(() => {
    const has = CallTracker.hasCallLogAccess();
    setAllowed(has);
    setCalls(has ? CallTracker.recentCalls(15) : []);
    setRuns(trackerRuns().reverse());
  }, []);
  useFocusEffect(refresh);
  useAppActive(refresh);

  const turnOn = async () => {
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CALL_LOG);
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return Linking.openSettings();
    if (result !== PermissionsAndroid.RESULTS.GRANTED) return;
    if (CallTracker.batteryRestricted()) CallTracker.askToRunInBackground();
    CallTracker.sync();
    refresh();
  };

  const check = () => {
    CallTracker.sync();
    setTimeout(refresh, 2500);
  };
  const share = () => {
    const report = {
      device: deviceSummary(),
      allowed,
      batteryRestricted: CallTracker.batteryRestricted(),
      runs: runs.slice(0, 50),
      calls: calls.map(({ number: _n, ...call }) => call),
    };
    void Share.share({ message: JSON.stringify(report, null, 2) });
  };

  const stats = today.data?.calls;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card style={{ gap: 12 }}>
        <View style={styles.status}>
          <View style={[styles.icon, { backgroundColor: allowed ? t.accentSoft : t.muted }]}>
            <Ionicons name={allowed ? "checkmark" : "call-outline"} size={20} color={allowed ? t.accent : t.mutedForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="heading">{allowed ? "On" : "Off"}</Text>
            <Text variant="caption">
              {allowed ? "Calls with your leads are added to their timeline." : "You can still add calls to a lead by hand."}
            </Text>
          </View>
        </View>
        {allowed ? null : <Button label="Turn on" onPress={() => void turnOn()} />}
      </Card>

      {allowed && stats ? (
        <Card>
          <Text variant="overline" style={{ marginBottom: 10 }}>
            Today
          </Text>
          <View style={{ flexDirection: "row" }}>
            <Stat value={String(stats.calls)} label="Calls" />
            <Stat value={String(stats.connected)} label="Connected" />
            <Stat value={talkTime(stats.talkSec)} label="Talk time" />
          </View>
        </Card>
      ) : null}

      <View style={styles.about}>
        <Text variant="label">What's saved</Text>
        <Text variant="caption">
          The number, time, direction and length of your calls with leads on this phone. Calls with anyone else aren't saved, nothing is
          ever recorded, and WhatsApp calls aren't included.
        </Text>
        {allowed ? (
          <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={styles.link}>
            <Text variant="label" tone="accent">
              Turn off in Android settings
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: technical }}
        onPress={() => setTechnical(!technical)}
        style={styles.toggle}
      >
        <Text variant="label" tone="muted" style={{ flex: 1 }}>
          Technical details
        </Text>
        <Ionicons name={technical ? "chevron-up" : "chevron-down"} size={18} color={t.mutedForeground} />
      </Pressable>

      {technical ? (
        <View style={{ gap: 8 }}>
          <Text variant="caption">{deviceSummary()}</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label="Check now" variant="soft" style={{ flex: 1 }} onPress={check} />
            <Button label="Share report" variant="outline" style={{ flex: 1 }} onPress={share} />
          </View>
          <Text variant="label" style={{ marginTop: 6 }}>
            Background runs ({runs.length})
          </Text>
          {runs.slice(0, 20).map((r) => (
            <Text key={r.at} variant="caption">
              {time(r.at)} · {r.source} · {r.error ?? `${r.rows} read`}
            </Text>
          ))}
          <Text variant="label" style={{ marginTop: 6 }}>
            Latest calls
          </Text>
          {calls.map((c) => (
            <Text key={`${c.startedAt}${c.number}`} variant="caption">
              {time(c.startedAt)} · {c.direction} · {c.durationSec}s · {parsePhone(c.number, c.countryIso)?.e164 ?? `unparsed: ${c.number}`}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  status: { flexDirection: "row", alignItems: "center", gap: 14 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  about: { gap: 4, paddingHorizontal: 4, marginTop: 4 },
  link: { paddingVertical: 8 },
  toggle: { flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingVertical: 10 },
});
