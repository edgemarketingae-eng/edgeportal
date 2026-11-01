import { meRoutes } from "@edge/contracts";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, PermissionsAndroid, ScrollView, StyleSheet, Switch, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CallTracker } from "../../modules/call-tracker";
import mark from "../../assets/splash-mark.png";
import { BottomBar, Button, Card, Text } from "@/components/ui";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

/** Says plainly what's collected before Android asks, so the permission prompt isn't a surprise. */
export default function Setup() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api(meRoutes.me) });
  const [logCalls, setLogCalls] = useState(true);
  const [busy, setBusy] = useState(false);
  const name = me.data?.user.name.split(" ")[0];

  const start = async () => {
    setBusy(true);
    const p = PermissionsAndroid.PERMISSIONS;
    await PermissionsAndroid.request(p.POST_NOTIFICATIONS);
    if (logCalls) {
      await PermissionsAndroid.request(p.READ_CALL_LOG);
      if (CallTracker.batteryRestricted()) CallTracker.askToRunInBackground();
      CallTracker.sync();
    }
    setBusy(false);
    router.replace("/");
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 40 }]}>
        <Animated.View entering={FadeInDown.duration(320)} style={{ gap: 12 }}>
          <Image source={mark} style={styles.mark} accessibilityIgnoresInvertColors />
          <Text variant="display">{name ? `You're in, ${name}` : "You're in"}</Text>
          <Text tone="muted">Your leads and follow-ups are ready. Turn on alerts so none of them slips by.</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(320).delay(90)}>
          <Card style={styles.alerts}>
            <View style={[styles.icon, { backgroundColor: t.accentSoft }]}>
              <Ionicons name="notifications" size={20} color={t.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="heading">Alerts</Text>
              <Text variant="caption">New leads, follow-ups that are due and missed calls.</Text>
            </View>
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(320).delay(170)} style={styles.calls}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label">Log call length automatically</Text>
            <Text variant="caption">
              Saves the number, time and length of your calls with leads, so you don't have to type them. Other calls aren't saved, and
              nothing is ever recorded.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Log call length automatically"
            value={logCalls}
            onValueChange={setLogCalls}
            trackColor={{ true: t.primary, false: t.border }}
            thumbColor={t.card}
          />
        </Animated.View>
      </ScrollView>
      <BottomBar>
        <Button label="Get started" onPress={() => void start()} busy={busy} style={{ flex: 1 }} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 24, gap: 22 },
  mark: { width: 52, height: 52, borderRadius: 14, marginBottom: 8 },
  alerts: { flexDirection: "row", alignItems: "center", gap: 14 },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  calls: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingHorizontal: 4 },
});
