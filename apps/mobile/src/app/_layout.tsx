import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect } from "react";
import { CallTracker } from "../../modules/call-tracker";
import { Toaster } from "@/components/ui";
import { takePendingContact } from "@/lib/contact";
import { flushOutbox } from "@/lib/outbox";
import { registerForPush, useOpenTappedAlert } from "@/lib/push";
import { SessionProvider, useSession } from "@/lib/session";
import { font, useTheme } from "@/lib/theme";
import { useAppActive } from "@/lib/use-app-active";
import { useUpdateCheck } from "@/lib/update";

const DAY = 24 * 60 * 60 * 1000;
const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 7 * DAY, staleTime: 30_000, retry: 1 } } });
const persister = createAsyncStoragePersister({ storage: AsyncStorage });

SplashScreen.setOptions({ fade: true, duration: 220 });

/** Forms slide up over what you were doing, and swipe away. */
const sheet = {
  presentation: "formSheet" as const,
  headerShown: false,
  sheetAllowedDetents: [0.92],
  sheetGrabberVisible: true,
  sheetCornerRadius: 28,
};

/** Everything that should happen when the app comes to the screen: catch up, and show the sheet for a call that just ended. */
function useForegroundWork() {
  const { signedIn, signOut } = useSession();
  const router = useRouter();
  const client = useQueryClient();

  const run = useCallback(async () => {
    if (!signedIn) return;
    // The worker clears the session itself when the server refuses the token while the app is closed.
    if (!CallTracker.token()) return signOut();
    // The sheet comes first: it must not wait on a slow network right after a call.
    const contact = await takePendingContact();
    if (contact)
      router.push({
        pathname: "/after-contact",
        params: { ...contact, tappedAt: String(contact.tappedAt) },
      });
    CallTracker.sync();
    const left = await flushOutbox();
    if (left === 0) void client.invalidateQueries();
  }, [signedIn, signOut, router, client]);

  useAppActive(() => void run());
  useEffect(() => {
    void run();
  }, [run]);
  useEffect(() => {
    if (signedIn) void registerForPush();
  }, [signedIn]);
  useOpenTappedAlert();
  useUpdateCheck();
}

function Screens() {
  const theme = useTheme();
  const { signedIn } = useSession();
  useForegroundWork();
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          animation: "ios_from_right",
          headerStyle: { backgroundColor: theme.background },
          headerShadowVisible: false,
          headerTintColor: theme.foreground,
          headerTitleStyle: { fontFamily: font.bold, fontSize: 17 },
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="lead/[id]" options={{ title: "" }} />
          <Stack.Screen name="lead/new" options={sheet} />
          <Stack.Screen name="lead/conversion" options={sheet} />
          <Stack.Screen name="lead/deposit" options={sheet} />
          <Stack.Screen name="lead/lost" options={sheet} />
          <Stack.Screen name="lead/edit" options={sheet} />
          <Stack.Screen name="lead/note" options={sheet} />
          <Stack.Screen name="lead/assign" options={sheet} />
          <Stack.Screen name="lead/move" options={sheet} />
          <Stack.Screen name="lead/convert" options={sheet} />
          <Stack.Screen name="lead/delete" options={sheet} />
          <Stack.Screen name="deposit/reject" options={sheet} />
          <Stack.Screen name="task/[id]" options={{ title: "" }} />
          <Stack.Screen name="task/new" options={sheet} />
          <Stack.Screen name="task/edit" options={sheet} />
          <Stack.Screen name="task/done" options={sheet} />
          <Stack.Screen name="task/comment" options={sheet} />
          <Stack.Screen name="project/index" options={{ title: "Projects" }} />
          <Stack.Screen name="project/[id]" options={{ title: "" }} />
          <Stack.Screen name="project/edit" options={sheet} />
          <Stack.Screen name="project/add-member" options={sheet} />
          <Stack.Screen name="deposits" options={{ title: "Deposits" }} />
          <Stack.Screen name="leaderboard" options={{ title: "Leaderboard" }} />
          <Stack.Screen name="dashboard" options={{ title: "Dashboard" }} />
          <Stack.Screen name="after-contact" options={sheet} />
          <Stack.Screen name="setup" options={{ headerShown: false, animation: "fade" }} />
          <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
          <Stack.Screen name="call-tracking" options={{ title: "Call tracking" }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false, animation: "fade" }} />
        </Stack.Protected>
      </Stack>
      <Toaster />
    </>
  );
}

export default function RootLayout() {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 7 * DAY }}>
      <SessionProvider>
        <Screens />
      </SessionProvider>
    </PersistQueryClientProvider>
  );
}
