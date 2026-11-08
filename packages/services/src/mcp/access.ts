import type { Actor } from "@edge/domain/enums";
import { audit } from "../audit";
import { getSetting, setSetting } from "../settings";

const TTL_MS = 60_000;
let cache: { at: number; enabled: boolean } | null = null;

/** The CRM-wide switch for Claude connections (CRM Settings). Cached a minute per API process; saving clears it here. */
export async function claudeAccessEnabled(): Promise<boolean> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.enabled;
  const { enabled } = await getSetting("crm.claude");
  cache = { at: Date.now(), enabled };
  return enabled;
}

export function invalidateClaudeAccess() {
  cache = null;
}

/** Off pauses every connection at once (nothing is deleted); on lets people connect again. */
export async function setClaudeAccess(enabled: boolean, actor: Actor & { type: "USER" }) {
  const before = await getSetting("crm.claude");
  await setSetting("crm.claude", { enabled }, actor.id);
  await audit({ actor, action: "crm.claude.update", entityType: "Setting", entityId: "crm.claude", before, after: { enabled } });
  invalidateClaudeAccess();
}
