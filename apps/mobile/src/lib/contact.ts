import { whatsappDigits, whatsappGreeting } from "@edge/domain/crm/machine";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, PermissionsAndroid } from "react-native";
import { CallTracker } from "../../modules/call-tracker";

const KEY = "pending-contact";

export interface ContactTarget {
  leadId: string;
  leadName: string;
  phone: string;
  taskId?: string;
}

export interface PendingContact extends ContactTarget {
  kind: "call" | "whatsapp";
  tappedAt: number;
}

// On disk, not in memory: Android may close the app during a long call, and the sheet still has to appear afterwards.
const remember = (contact: PendingContact) => AsyncStorage.setItem(KEY, JSON.stringify(contact));

export async function startCall(target: ContactTarget) {
  // Without this permission the dialer opens with the number filled in, which also works, so it's only asked for here.
  // It comes before `remember` because returning from Android's prompt counts as coming back from a call.
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CALL_PHONE);
  await remember({ ...target, kind: "call", tappedAt: Date.now() });
  CallTracker.placeCall(target.phone, target.leadId);
}

export async function startWhatsApp(target: ContactTarget) {
  await remember({ ...target, kind: "whatsapp", tappedAt: Date.now() });
  await Linking.openURL(`https://wa.me/${whatsappDigits(target.phone)}?text=${encodeURIComponent(whatsappGreeting(target.leadName))}`);
}

export async function takePendingContact() {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(KEY);
  return JSON.parse(raw) as PendingContact;
}

const lastDigits = (n: string) => n.replace(/\D/g, "").slice(-9);

/** The call log row for a call placed from the app. It appears when the call ends, so it may not be there yet. */
export function findCallRow(phone: string, tappedAt: number) {
  const calls = CallTracker.hasCallLogAccess() ? CallTracker.recentCalls(10) : [];
  return calls.find((c) => c.startedAt >= tappedAt - 10_000 && lastDigits(c.number) === lastDigits(phone)) ?? null;
}
