import { createContext, use, type ReactNode } from "react";
import { useColorScheme } from "react-native";

/** The brand palette. The web's copy is packages/ui/src/styles/globals.css, which is web-only. */
const light = {
  background: "#f1f7f7",
  foreground: "#021a1a",
  card: "#ffffff",
  primary: "#08e186",
  onPrimary: "#021a1a",
  muted: "#e8f0f0",
  mutedForeground: "#4c6464",
  destructive: "#c93c3c",
  border: "#d3e0e0",
  // Edge Green is too bright to read as text on a light background, so green text is Deep Emerald here.
  accent: "#03624c",
  accentSoft: "#d6f5e8",
  destructiveSoft: "#fce8e8",
  warmSoft: "#f1ecdf",
  coldSoft: "#d8f2f1",
  hairline: "rgba(2, 26, 26, 0.07)",
  shadow: "0 6px 18px rgba(2, 26, 26, 0.06)",
};

const dark: typeof light = {
  background: "#021a1a",
  foreground: "#f1f7f7",
  card: "#0a2a2c",
  primary: "#08e186",
  onPrimary: "#021a1a",
  muted: "#0c3b40",
  mutedForeground: "#9db5b5",
  destructive: "#ff6b6b",
  border: "#16474c",
  accent: "#08e186",
  accentSoft: "rgba(8, 225, 134, 0.14)",
  destructiveSoft: "rgba(255, 107, 107, 0.16)",
  warmSoft: "rgba(233, 227, 213, 0.13)",
  coldSoft: "rgba(190, 235, 234, 0.13)",
  hairline: "rgba(241, 247, 247, 0.08)",
  shadow: "0 0 0 rgba(0, 0, 0, 0)",
};

export type Theme = typeof light;

/** The dark card and the sign-in screen: Ink, with an Emerald glow from the top left. */
export const INK_GLOW = "radial-gradient(circle at 0% 0%, rgba(3, 98, 76, 0.95) 0%, rgba(3, 98, 76, 0) 72%)";

/** Built into the APK by the expo-font plugin in app.config.ts. Android needs a family for each weight. */
export const font = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extrabold: "Manrope_800ExtraBold",
};

const OnDarkContext = createContext(false);

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return use(OnDarkContext) || scheme === "dark" ? dark : light;
}

/** Whatever's inside draws for a dark surface, even when the phone is in light mode. */
export function OnDark({ children }: { children: ReactNode }) {
  return <OnDarkContext value>{children}</OnDarkContext>;
}
