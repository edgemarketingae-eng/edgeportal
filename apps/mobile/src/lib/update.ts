import Constants from "expo-constants";
import { useEffect } from "react";
import { Alert } from "react-native";
import { z } from "zod";
import { CallTracker } from "../../modules/call-tracker";

const MANIFEST_URL = process.env.EXPO_PUBLIC_UPDATE_URL ?? "https://crm.edgeacademy.ae/android/latest.json";

const Latest = z.object({
  versionCode: z.number(),
  /** Older than this no longer works with the API, so the update can't be skipped. */
  minVersionCode: z.number(),
  version: z.string(),
  url: z.url(),
  sha256: z.string(),
});

async function install(url: string, sha256: string) {
  try {
    await CallTracker.installUpdate(url, sha256);
  } catch {
    Alert.alert("Update failed", "Check your connection and try again.");
  }
}

/** Checks our server once a launch, since there's no store to deliver updates. */
export function useUpdateCheck() {
  useEffect(() => {
    const current = Constants.expoConfig?.android?.versionCode ?? 0;
    void (async () => {
      try {
        const latest = Latest.parse(await (await fetch(MANIFEST_URL, { headers: { "cache-control": "no-cache" } })).json());
        if (latest.versionCode <= current) return;
        const required = current < latest.minVersionCode;
        Alert.alert(
          "Update available",
          `Version ${latest.version} is ready.${required ? " You need it to keep using the app." : ""}`,
          [
            ...(required ? [] : [{ text: "Later", style: "cancel" as const }]),
            { text: "Update", onPress: () => void install(latest.url, latest.sha256) },
          ],
          { cancelable: !required },
        );
      } catch {
        // No signal or no manifest yet: try again next launch.
      }
    })();
  }, []);
}
