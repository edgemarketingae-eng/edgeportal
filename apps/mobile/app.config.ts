import { existsSync } from "node:fs";
import type { ExpoConfig } from "expo/config";

// From the Firebase project. Without it the app still works, it just can't receive push alerts.
const GOOGLE_SERVICES = "./google-services.json";

// Built into the APK rather than loaded at start-up, so text never appears in the wrong font first.
const FONT_WEIGHTS = ["400Regular", "500Medium", "600SemiBold", "700Bold", "800ExtraBold"];
const fontFile = (weight: string) => `./node_modules/@expo-google-fonts/manrope/${weight}/Manrope_${weight}.ttf`;

const config: ExpoConfig = {
  name: "Edge CRM",
  slug: "edge-crm",
  scheme: "edgecrm",
  version: "0.2.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  backgroundColor: "#021a1a",
  platforms: ["android"],
  android: {
    package: "ae.edgeacademy.crm",
    versionCode: 2,
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#021a1a" },
    // Sideloaded apps can't rely on overlays, accessibility or the dialer role, so none of those are requested.
    permissions: [
      "android.permission.READ_CALL_LOG",
      "android.permission.CALL_PHONE",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
    ],
    blockedPermissions: [
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
    // The device token must not travel in a cloud backup: its key can't be restored, and a copy shouldn't exist.
    allowBackup: false,
    ...(existsSync(GOOGLE_SERVICES) ? { googleServicesFile: GOOGLE_SERVICES } : {}),
  },
  // EDGE_ALLOW_HTTP is for test builds against a local API; Android refuses plain HTTP otherwise, which is what production wants.
  plugins: [
    "expo-router",
    "expo-notifications",
    ["expo-font", { fonts: FONT_WEIGHTS.map(fontFile) }],
    ["expo-splash-screen", { backgroundColor: "#021a1a", image: "./assets/splash-mark.png", imageWidth: 96 }],
    "./plugins/with-release-signing",
    ...(process.env.EDGE_ALLOW_HTTP ? ["./plugins/with-test-http"] : []),
  ],
  experiments: { typedRoutes: true },
};

export default config;
