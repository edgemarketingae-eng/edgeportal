import type { CommissionSettingsDto, CrmSettingsDto } from "@edge/contracts";
import { fractionToPercent, percentToFraction } from "@edge/domain/crm/commission";
import type { Actor } from "@edge/domain/enums";
import { toMajor, toMinor } from "@edge/domain/money";
import { audit } from "../audit";
import { env } from "../env";
import { getSetting, setSetting } from "../settings";
import { rerateCurrentMonth } from "./deposits";
import { getDefaultProject } from "./scope";

export async function getCrmSettings(): Promise<CrmSettingsDto> {
  const [cfg, def] = await Promise.all([getSetting("crm.config"), getDefaultProject()]);
  return {
    ...cfg,
    webhookUrl: `${env.API_PUBLIC_URL}/api/webhooks/leads/website`,
    webhookConfigured: !!env.LEAD_WEBHOOK_SECRET,
    defaultProject: { id: String(def._id), name: def.name, code: def.code },
  };
}

export async function saveCrmSettings(
  input: { followUpSlaHours: number; staleAfterDays: number; batchUrgencyDays: number; roundRobin: boolean; lostReasons: string },
  actor: Actor & { type: "USER" },
) {
  const before = await getSetting("crm.config");
  const lostReasons = [
    ...new Set(
      input.lostReasons
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ]
    .slice(0, 50)
    .map((s) => s.slice(0, 120));
  const next = {
    followUpSlaHours: input.followUpSlaHours,
    staleAfterDays: input.staleAfterDays,
    batchUrgencyDays: input.batchUrgencyDays,
    roundRobin: input.roundRobin,
    lostReasons: lostReasons.length ? lostReasons : before.lostReasons,
  };
  await setSetting("crm.config", next, actor.id);
  await audit({ actor, action: "crm.settings.update", entityType: "Setting", entityId: "crm.config", before, after: next });
}

/** Commission rates as percentages and slab amounts in USD (stored as fractions and minor units). */
export async function getCommissionSettings(): Promise<CommissionSettingsDto> {
  const r = await getSetting("crm.commission");
  return {
    firstPct: fractionToPercent(r.firstPct),
    slabs: [...r.slabs]
      .sort((a, b) => a.fromMinor - b.fromMinor)
      .map((x) => ({ from: toMajor(x.fromMinor), pct: fractionToPercent(x.pct) })),
  };
}

/**
 * A new first-deposit rate applies to first deposits verified from now on (verified ones keep theirs). New slabs apply
 * to the current month at once: everyone's verified later deposits this month are re-rated. Past months keep their
 * rates unless one of their deposits is verified or rejected later (or the backfill script re-rates them).
 */
export async function saveCommissionSettings(
  input: { firstPct: number; slabs: { from: number; pct: number }[] },
  actor: Actor & { type: "USER" },
) {
  const before = await getSetting("crm.commission");
  const next = {
    firstPct: percentToFraction(input.firstPct),
    slabs: input.slabs
      .map((x) => ({ fromMinor: toMinor(x.from), pct: percentToFraction(x.pct) }))
      .sort((a, b) => a.fromMinor - b.fromMinor),
  };
  await setSetting("crm.commission", next, actor.id);
  await audit({ actor, action: "crm.commission.update", entityType: "Setting", entityId: "crm.commission", before, after: next });
  await rerateCurrentMonth(actor);
}
