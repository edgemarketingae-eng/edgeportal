import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState, type ComponentProps, type ComponentRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  Text as RNText,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  interpolateColor,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, INK_GLOW, OnDark, useTheme } from "@/lib/theme";
import { useToast } from "@/lib/toast";

export type IconName = ComponentProps<typeof Ionicons>["name"];

const SPRING = { damping: 16, stiffness: 340, mass: 0.6 };
const QUICK = { duration: 170 };
const SHEET_SETTLE_MS = 450;

export const buzz = {
  select: () => void Haptics.selectionAsync(),
  tap: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
};

const VARIANTS = StyleSheet.create({
  display: { fontFamily: font.extrabold, fontSize: 30, lineHeight: 37, letterSpacing: -0.7 },
  title: { fontFamily: font.extrabold, fontSize: 22, lineHeight: 29, letterSpacing: -0.3 },
  heading: { fontFamily: font.bold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: font.medium, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  overline: { fontFamily: font.bold, fontSize: 11, lineHeight: 15, letterSpacing: 0.9, textTransform: "uppercase" },
});

export type TextTone = "default" | "muted" | "accent" | "danger";

export function Text({
  variant = "body",
  tone = variant === "caption" || variant === "overline" ? "muted" : "default",
  style,
  ...props
}: TextProps & { variant?: keyof typeof VARIANTS; tone?: TextTone }) {
  const t = useTheme();
  const color = { default: t.foreground, muted: t.mutedForeground, accent: t.accent, danger: t.destructive }[tone];
  return <RNText {...props} style={[VARIANTS[variant], { color, includeFontPadding: false }, style]} />;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Anything tappable: it gives slightly under the finger, then springs back. */
export function Tap({
  feedback,
  scaleTo = 0.97,
  onPress,
  style,
  ...props
}: Omit<PressableProps, "style"> & {
  feedback?: keyof typeof buzz;
  scaleTo?: number;
  style?: ComponentProps<typeof AnimatedPressable>["style"];
}) {
  const scale = useSharedValue(1);
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <AnimatedPressable
      {...props}
      onPressIn={() => scale.set(withSpring(scaleTo, SPRING))}
      onPressOut={() => scale.set(withSpring(1, SPRING))}
      onPress={(e) => {
        if (feedback) buzz[feedback]();
        onPress?.(e);
      }}
      style={[style, pressed]}
    />
  );
}

export function Button({
  label,
  onPress,
  icon,
  variant = "primary",
  busy,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: "primary" | "soft" | "outline" | "danger";
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const off = disabled || busy;
  const looks = {
    primary: { background: t.primary, border: t.primary, color: t.onPrimary },
    soft: { background: t.muted, border: t.muted, color: t.foreground },
    outline: { background: "transparent", border: t.border, color: t.foreground },
    danger: { background: t.destructiveSoft, border: t.destructiveSoft, color: t.destructive },
  }[variant];
  const color = disabled && !busy ? t.mutedForeground : looks.color;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      feedback="tap"
      onPress={onPress}
      style={[
        styles.button,
        disabled && !busy
          ? { backgroundColor: t.muted, borderColor: t.muted }
          : { backgroundColor: looks.background, borderColor: looks.border },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={color} /> : icon ? <Ionicons name={icon} size={19} color={color} /> : null}
      <Text variant="heading" style={{ color }}>
        {label}
      </Text>
    </Tap>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  tone = "plain",
  size = 44,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: "plain" | "accent" | "ghost";
  size?: number;
}) {
  const t = useTheme();
  const background = { plain: t.muted, accent: t.accentSoft, ghost: "transparent" }[tone];
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      scaleTo={0.9}
      feedback="tap"
      onPress={onPress}
      style={[styles.center, { width: size, height: size, borderRadius: size / 2, backgroundColor: background }]}
    >
      <Ionicons name={icon} size={size * 0.47} color={tone === "accent" ? t.accent : t.foreground} />
    </Tap>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const t = useTheme();
  const on = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    on.set(withTiming(selected ? 1 : 0, QUICK));
  }, [on, selected]);
  const fill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.get(), [0, 1], [t.card, t.foreground]),
    borderColor: interpolateColor(on.get(), [0, 1], [t.border, t.foreground]),
  }));
  return (
    <Tap
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      feedback="select"
      onPress={onPress}
      style={[styles.chip, fill]}
    >
      <Text variant="label" style={{ color: selected ? t.background : t.foreground }}>
        {label}
      </Text>
    </Tap>
  );
}

/** Choose one of a few options: the thumb slides between them. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const t = useTheme();
  const width = useSharedValue(0);
  const place = useSharedValue(0);
  const index = options.findIndex((o) => o.value === value);
  useEffect(() => {
    place.set(withSpring(index, { ...SPRING, damping: 20 }));
  }, [place, index]);
  const thumb = useAnimatedStyle(() => ({
    width: width.get(),
    transform: [{ translateX: place.get() * width.get() }],
  }));
  return (
    <View
      accessibilityRole="radiogroup"
      onLayout={(e) => width.set((e.nativeEvent.layout.width - 8) / options.length)}
      style={[styles.segmented, { backgroundColor: t.muted }]}
    >
      <Animated.View style={[styles.thumb, { backgroundColor: t.card, boxShadow: t.shadow }, thumb]} />
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="radio"
          accessibilityState={{ selected: o.value === value }}
          onPress={() => {
            if (o.value === value) return;
            buzz.select();
            onChange(o.value);
          }}
          style={[styles.center, { flex: 1, height: 36 }]}
        >
          <Text variant="label" tone={o.value === value ? "default" : "muted"}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Pill({ label, tone = "neutral", icon }: { label: string; tone?: "neutral" | "accent" | "danger"; icon?: IconName }) {
  const t = useTheme();
  const look = {
    neutral: { background: t.muted, color: t.mutedForeground },
    accent: { background: t.accentSoft, color: t.accent },
    danger: { background: t.destructiveSoft, color: t.destructive },
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: look.background }]}>
      {icon ? <Ionicons name={icon} size={12} color={look.color} /> : null}
      <Text variant="caption" style={{ color: look.color, fontFamily: font.semibold }}>
        {label}
      </Text>
    </View>
  );
}

/** A large choice with an icon, for sheets and a lead's actions. */
export function Tile({ icon, label, selected, onPress }: { icon: IconName; label: string; selected?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Tap
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      feedback="select"
      onPress={onPress}
      style={[
        styles.tile,
        { backgroundColor: selected ? t.accentSoft : t.card, borderColor: selected ? t.accent : t.hairline, boxShadow: t.shadow },
      ]}
    >
      <Ionicons name={icon} size={20} color={selected ? t.accent : t.mutedForeground} />
      <Text variant="label" numberOfLines={1} tone={selected ? "accent" : "default"} style={{ flexShrink: 1 }}>
        {label}
      </Text>
    </Tap>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.card, borderColor: t.hairline, boxShadow: t.shadow }, style]}>{children}</View>;
}

/** The one loud thing on a screen: Ink with an Emerald glow, in light and dark mode alike. */
export function InkCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const raised = useColorScheme() === "dark";
  return (
    <OnDark>
      <View style={[styles.inkCard, { backgroundColor: raised ? "#0a2a2c" : "#021a1a" }, style]}>
        <View style={styles.inkGlow} />
        {children}
      </View>
    </OnDark>
  );
}

export function Notice({
  text,
  action,
  onPress,
  tone = "info",
}: {
  text: string;
  action?: string;
  onPress?: () => void;
  tone?: "info" | "danger";
}) {
  const t = useTheme();
  const danger = tone === "danger";
  return (
    <Tap
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.notice, { backgroundColor: danger ? t.destructiveSoft : t.muted }]}
    >
      <Ionicons name={danger ? "alert-circle" : "cloud-offline-outline"} size={18} color={danger ? t.destructive : t.mutedForeground} />
      <Text variant="caption" tone={danger ? "danger" : "default"} style={{ flex: 1 }}>
        {text}
      </Text>
      {action ? (
        <Text variant="label" tone="accent">
          {action}
        </Text>
      ) : null}
    </Tap>
  );
}

export function Field({
  label,
  error,
  trailing,
  ...input
}: TextInputProps & {
  label: string;
  error?: string;
  /** Something inside the box at the right-hand end. */
  trailing?: ReactNode;
}) {
  const t = useTheme();
  const focus = useSharedValue(0);
  const edge = error ? t.destructive : t.border;
  const box = useAnimatedStyle(() => ({ borderColor: interpolateColor(focus.get(), [0, 1], [edge, t.accent]) }));
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      <Animated.View style={[styles.input, { backgroundColor: t.card }, box]}>
        <TextInput
          placeholderTextColor={t.mutedForeground}
          {...input}
          onFocus={(e) => {
            focus.set(withTiming(1, QUICK));
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            focus.set(withTiming(0, QUICK));
            input.onBlur?.(e);
          }}
          style={[styles.inputText, { color: t.foreground }, input.style]}
        />
        {trailing}
      </Animated.View>
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function PasswordField(props: TextInputProps & { label: string }) {
  const [shown, setShown] = useState(false);
  return (
    <Field
      {...props}
      secureTextEntry={!shown}
      autoCapitalize="none"
      autoCorrect={false}
      trailing={
        <IconButton
          icon={shown ? "eye-off-outline" : "eye-outline"}
          label={shown ? "Hide password" : "Show password"}
          tone="ghost"
          size={40}
          onPress={() => setShown(!shown)}
        />
      }
    />
  );
}

export function SearchField({ value, onChangeText, ...input }: TextInputProps & { value: string; onChangeText: (v: string) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.search, { backgroundColor: t.card, borderColor: t.hairline, boxShadow: t.shadow }]}>
      <Ionicons name="search" size={18} color={t.mutedForeground} />
      <TextInput
        placeholderTextColor={t.mutedForeground}
        returnKeyType="search"
        {...input}
        value={value}
        onChangeText={onChangeText}
        style={[styles.inputText, { color: t.foreground }]}
      />
      {value ? <IconButton icon="close" label="Clear search" tone="ghost" size={36} onPress={() => onChangeText("")} /> : null}
    </View>
  );
}

export function Skeleton({ width = "100%", height = 14, radius = 7 }: { width?: number | `${number}%`; height?: number; radius?: number }) {
  const t = useTheme();
  const glow = useSharedValue(0.55);
  useEffect(() => {
    glow.set(withRepeat(withTiming(1, { duration: 750 }), -1, true));
  }, [glow]);
  const pulse = useAnimatedStyle(() => ({ opacity: glow.get() }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: t.muted }, pulse]} />;
}

/** Stands in for a list while it loads, shaped like the rows that are coming. */
export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <View style={{ gap: 8 }}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} style={styles.skeletonRow}>
          <Skeleton width={46} height={46} radius={23} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="55%" />
            <Skeleton width="75%" height={11} />
          </View>
        </Card>
      ))}
    </View>
  );
}

export function EmptyState({ icon, title, text }: { icon: IconName; title: string; text?: string }) {
  const t = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(260)} style={styles.empty}>
      <View style={[styles.center, styles.emptyIcon, { backgroundColor: t.accentSoft }]}>
        <Ionicons name={icon} size={28} color={t.accent} />
      </View>
      <Text variant="heading" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {text ? (
        <Text variant="caption" style={{ textAlign: "center", maxWidth: 260 }}>
          {text}
        </Text>
      ) : null}
    </Animated.View>
  );
}

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();

/** Each person keeps the same colour wherever they appear. */
export function Avatar({ name, size = 46 }: { name: string; size?: number }) {
  const t = useTheme();
  const tints = [t.accentSoft, t.coldSoft, t.warmSoft];
  const hash = Array.from(name).reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return (
    <View style={[styles.center, { width: size, height: size, borderRadius: size / 2, backgroundColor: tints[hash % tints.length] }]}>
      <Text style={{ fontFamily: font.bold, fontSize: size * 0.34, color: t.foreground }}>{initials(name)}</Text>
    </View>
  );
}

export function SectionHeader({ title, count, tone }: { title: string; count?: string | number; tone?: "danger" }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="heading">{title}</Text>
      {count ? <Pill label={String(count)} tone={tone ?? "neutral"} /> : null}
    </View>
  );
}

export function ListGroup({ children }: { children: ReactNode }) {
  return <Card style={{ padding: 0, overflow: "hidden" }}>{children}</Card>;
}

export function ListRow({
  icon,
  label,
  value,
  onPress,
  tone,
  last,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress?: () => void;
  tone?: "danger";
  last?: boolean;
}) {
  const t = useTheme();
  const color = tone === "danger" ? t.destructive : t.foreground;
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      android_ripple={{ color: t.muted }}
      style={[styles.listRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }]}
    >
      <Ionicons name={icon} size={20} color={tone === "danger" ? color : t.mutedForeground} />
      <Text variant="label" style={{ flex: 1, color }}>
        {label}
      </Text>
      {value ? <Text variant="caption">{value}</Text> : null}
      {onPress && tone !== "danger" ? <Ionicons name="chevron-forward" size={17} color={t.mutedForeground} /> : null}
    </Pressable>
  );
}

/** Rows ease up as a list first appears, and close the gap when one leaves. A refresh keeps its rows, so nothing moves. */
export function Rise({
  index = 0,
  moves = true,
  children,
  style,
}: {
  index?: number;
  /** Off inside a FlatList, which does its own layout. */
  moves?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      entering={index < 8 ? FadeInDown.duration(280).delay(index * 35) : undefined}
      exiting={moves ? FadeOut.duration(140) : undefined}
      layout={moves ? LinearTransition.duration(220) : undefined}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

/** A row of actions pinned to the bottom of the screen. */
export function BottomBar({ children }: { children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bottomBar, { paddingBottom: 12 + insets.bottom, backgroundColor: t.background, borderTopColor: t.hairline }]}>
      {children}
    </View>
  );
}

/** The inside of a slide-up form. Android only lifts a sheet part of the way for the keyboard, so this makes up the rest to keep Save in reach. */
export function Sheet({ children, actions }: { children: ReactNode; actions: ReactNode }) {
  const root = useRef<ComponentRef<typeof View>>(null);
  const lift = useSharedValue(0);
  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    const shown = Keyboard.addListener("keyboardDidShow", (e) => {
      const measure = () =>
        root.current?.measureInWindow((_x, y, _width, height) =>
          lift.set(withTiming(Math.max(0, y + height - e.endCoordinates.screenY), QUICK)),
        );
      // The sheet's own move only shows up in its measurements once it has finished; the second look is for slower phones.
      timers = [setTimeout(measure, SHEET_SETTLE_MS), setTimeout(measure, SHEET_SETTLE_MS * 2)];
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      timers.forEach(clearTimeout);
      lift.set(withTiming(0, QUICK));
    });
    return () => {
      timers.forEach(clearTimeout);
      shown.remove();
      hidden.remove();
    };
  }, [lift]);
  const clearOfKeyboard = useAnimatedStyle(() => ({ paddingBottom: lift.get() }));
  return (
    <Animated.View ref={root} style={[{ flex: 1 }, clearOfKeyboard]}>
      <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      <BottomBar>{actions}</BottomBar>
    </Animated.View>
  );
}

/** Chips or tiles, wrapping onto as many lines as they need. */
export function Wrap({ children }: { children: ReactNode }) {
  return <View style={styles.wrap}>{children}</View>;
}

export function Toaster() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const message = useToast();
  if (!message) return null;
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      exiting={FadeOutDown.duration(160)}
      pointerEvents="none"
      style={[styles.toast, { bottom: 92 + insets.bottom, backgroundColor: t.foreground }]}
    >
      <Ionicons name="checkmark-circle" size={18} color={t.primary} />
      <Text variant="label" style={{ color: t.background }}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  chip: { minHeight: 40, paddingHorizontal: 15, justifyContent: "center", borderRadius: 20, borderWidth: 1 },
  segmented: { flexDirection: "row", padding: 4, borderRadius: 14 },
  thumb: { position: "absolute", top: 4, bottom: 4, left: 4, borderRadius: 11 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  card: { borderRadius: 20, borderWidth: 1, padding: 16 },
  inkCard: { borderRadius: 28, overflow: "hidden", padding: 22 },
  inkGlow: { ...StyleSheet.absoluteFill, experimental_backgroundImage: INK_GLOW },
  notice: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14 },
  input: { flexDirection: "row", alignItems: "center", minHeight: 52, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14 },
  inputText: { flex: 1, fontFamily: font.medium, fontSize: 16, paddingVertical: 12 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 50, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14 },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 36 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, marginBottom: 6 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, marginBottom: 2 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 56, paddingHorizontal: 16 },
  bottomBar: { flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
  sheet: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 20, gap: 16 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toast: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 22,
  },
});
