import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { startCall, startWhatsApp, type ContactTarget } from "@/lib/contact";
import { useTheme } from "@/lib/theme";
import { Avatar, IconButton, Tap, Text } from "./ui";

/** Every list of people looks like this: tap to open, one tap to ring or message without opening. */
export function LeadRow({
  title,
  detail,
  urgent,
  target,
  onOpen,
  action,
}: {
  title: string;
  detail: string;
  urgent?: boolean;
  target: ContactTarget | null;
  onOpen: () => void;
  action?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: t.card, borderColor: t.hairline, boxShadow: t.shadow }]}>
      <Tap accessibilityRole="button" scaleTo={0.985} onPress={onOpen} style={styles.main}>
        <Avatar name={title} />
        <View style={styles.text}>
          <Text numberOfLines={1} variant="heading">
            {title}
          </Text>
          <Text numberOfLines={1} variant="caption" tone={urgent ? "danger" : "muted"}>
            {detail}
          </Text>
        </View>
      </Tap>
      {action}
      {target ? (
        <View style={styles.actions}>
          <IconButton icon="logo-whatsapp" label={`WhatsApp ${target.leadName}`} size={40} onPress={() => void startWhatsApp(target)} />
          <IconButton icon="call" label={`Call ${target.leadName}`} tone="accent" size={40} onPress={() => void startCall(target)} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingLeft: 12,
    paddingRight: 11,
    borderRadius: 20,
    borderWidth: 1,
  },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 46 },
  text: { flex: 1, gap: 2 },
  actions: { flexDirection: "row", gap: 7 },
});
