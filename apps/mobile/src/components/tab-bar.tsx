import { Ionicons } from "@expo/vector-icons";
import type { Tabs } from "expo-router";
import { useEffect, type ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme } from "@/lib/theme";
import { buzz, Text, type IconName } from "./ui";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const ICONS: Record<string, { on: IconName; off: IconName }> = {
  index: { on: "sunny", off: "sunny-outline" },
  leads: { on: "people", off: "people-outline" },
  me: { on: "person-circle", off: "person-circle-outline" },
};

const PILL_WIDTH = 60;

/** The highlight glides to the chosen tab rather than jumping. */
export function TabBar({ state, descriptors, emitter, navigateToTab, insets }: TabBarProps) {
  const t = useTheme();
  const width = useSharedValue(0);
  const place = useSharedValue(state.index);
  useEffect(() => {
    place.set(withSpring(state.index, { damping: 20, stiffness: 260, mass: 0.7 }));
  }, [place, state.index]);
  const pill = useAnimatedStyle(() => ({
    transform: [{ translateX: place.get() * width.get() + (width.get() - PILL_WIDTH) / 2 }],
  }));

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom + 6, backgroundColor: t.card, borderTopColor: t.hairline }]}>
      <View style={styles.row} onLayout={(e) => width.set(e.nativeEvent.layout.width / state.routes.length)}>
        <Animated.View style={[styles.pill, { backgroundColor: t.accentSoft }, pill]} />
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const title = descriptors[route.key]?.options.title ?? route.name;
          const icons = ICONS[route.name];
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={title}
              onPress={() => {
                const e = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (focused || e.defaultPrevented) return;
                buzz.select();
                navigateToTab(route.key);
              }}
              style={styles.tab}
            >
              {icons ? <Ionicons name={focused ? icons.on : icons.off} size={22} color={focused ? t.accent : t.mutedForeground} /> : null}
              <Text variant="overline" tone={focused ? "accent" : "muted"} style={styles.label}>
                {title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: 1, paddingTop: 8 },
  row: { flexDirection: "row" },
  pill: { position: "absolute", top: 0, left: 0, width: PILL_WIDTH, height: 32, borderRadius: 16 },
  tab: { flex: 1, alignItems: "center", gap: 6, paddingTop: 5 },
  label: { letterSpacing: 0.2, textTransform: "none", fontSize: 12 },
});
