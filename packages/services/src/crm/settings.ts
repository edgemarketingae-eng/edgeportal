import type { CrmSettingsDto } from "@edge/contracts";
import type { Actor } from "@edge/domain/enums";
import { audit } from "../audit";
import { env } from "../env";
import { getSetting, setSetting } from "../settings";
import { getDefaultProject } from "./scope";

export async function getCrmSettings(): Promise<CrmSettingsDto> {
  const [cfg, def] = await Promise.all([getSetting("crm.config"), getDefaultProject()]);
  return { ...cfg, webhookUrl: `${env.API_PUBLIC_URL}/api/webhooks/leads/website`, webhookConfigured: !!env.LEAD_WEBHOOK_SECRET, defaultProject: { id: String(def._id), name: def.name, code: def.code } };
}

export async function saveCrmSettings(input: { followUpSlaHours: number; staleAfterDays: number; batchUrgencyDays: number; roundRobin: boolean; lostReasons: string }, actor: Actor & { type: "USER" }) {
  const before = await getSetting("crm.config");
  const lostReasons = [...new Set(input.lostReasons.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))].slice(0, 50).map((s) => s.slice(0, 120));
  const next = { followUpSlaHours: input.followUpSlaHours, staleAfterDays: input.staleAfterDays, batchUrgencyDays: input.batchUrgencyDays, roundRobin: input.roundRobin, lostReasons: lostReasons.length ? lostReasons : before.lostReasons };
  await setSetting("crm.config", next, actor.id);
  await audit({ actor, action: "crm.settings.update", entityType: "Setting", entityId: "crm.config", before, after: next });
}
