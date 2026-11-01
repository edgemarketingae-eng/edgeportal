import { mobileRoutes } from "@edge/contracts";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { api } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Tells the server where to reach this phone. Failing is fine: with no Firebase config or Google services, alerts just don't arrive. */
export async function registerForPush() {
  try {
    await Notifications.setNotificationChannelAsync("alerts", { name: "Alerts", importance: Notifications.AndroidImportance.HIGH });
    const { data } = await Notifications.getDevicePushTokenAsync();
    await api(mobileRoutes.device, { body: { fcmToken: String(data) } });
  } catch (e) {
    console.log("Push not available", e);
  }
}

/** A tapped alert about a lead opens that lead. */
export function useOpenTappedAlert() {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const leadId = response?.notification.request.content.data?.leadId;
    if (typeof leadId === "string") router.push({ pathname: "/lead/[id]", params: { id: leadId } });
  }, [response, router]);
}
