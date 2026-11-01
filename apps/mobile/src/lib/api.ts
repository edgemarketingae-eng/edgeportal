import { createClient } from "@edge/contracts";
import { CallTracker } from "../../modules/call-tracker";

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://api.edgeacademy.ae";
export const CRM_URL = process.env.EXPO_PUBLIC_CRM_URL ?? "https://crm.edgeacademy.ae";

let onExpired = () => {};
/** The session registers how to react when the server stops accepting this phone's token. */
export function setExpiredHandler(fn: () => void) {
  onExpired = fn;
}

export const api = createClient(async (path, init) => {
  const token = CallTracker.token();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...init.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
  if (res.status === 401 && token) onExpired();
  return res;
});
