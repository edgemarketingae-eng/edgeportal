import type { CommissionSettingsDto, CrmSettingsDto } from "@edge/contracts";
import { fractionToPercent, percentToFraction } from "@edge/domain/crm/commission";
import type { Actor } from "@edge/domain/enums";
import { toMajor, toMinor } from "@edge/domain/money";
import { audit } from "../audit";
import { env } from "../env";
import { ValidationError } from "../errors";
import { getSetting, setSetting } from "../settings";
import { rerateCurrentMonth } from "./deposits";
import { getDefaultProject } from "./scope";

export async function getCrmSettings(): Promise<CrmSettingsDto> {
  const [cfg, def, formOrigins] = await Promise.all([getSetting("crm.config"), getDefaultProject(), getSetting("crm.formOrigins")]);
  return {
    ...cfg,
    webhookUrl: `${env.API_PUBLIC_URL}/api/webhooks/leads/website`,
    webhookConfigured: !!env.LEAD_WEBHOOK_SECRET,
    publicFormUrl: `${env.API_PUBLIC_URL}/api/public/leads`,
    formOrigins,
    envFormOrigins: [...env.PUBLIC_FORM_ORIGINS],
    defaultProject: { id: String(def._id), name: def.name, code: def.code },
  };
}

const ORIGINS_TTL_MS = 60_000;
let originsCache: { at: number; origins: ReadonlySet<string> } | null = null;

/**
 * Websites whose browsers may call /api/public/*: PUBLIC_FORM_ORIGINS plus the list CRM admins keep in Settings.
 * Cached for a minute per API process (saving clears this process's copy at once).
 */
export async function allowedFormOrigins(): Promise<ReadonlySet<string>> {
  if (originsCache && Date.now() - originsCache.at < ORIGINS_TTL_MS) return originsCache.origins;
  const saved = await getSetting("crm.formOrigins");
  const origins = new Set([...env.PUBLIC_FORM_ORIGINS, ...saved]);
  originsCache = { at: Date.now(), origins };
  return origins;
}

export function invalidateFormOrigins() {
  originsCache = null;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * "https://edgeacademy.ae/free-class/" → "https://edgeacademy.ae": the browser sends only the origin, so a pasted page
 * address is reduced to it. HTTPS only; plain http is accepted for localhost outside production (testing a form).
 */
export function parseFormOrigins(text: string): string[] {
  const lines = [
    ...new Set(
      text
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  if (lines.length > 20) throw new ValidationError({ origins: "Up to 20 websites" });
  const out = new Set<string>();
  for (const line of lines) {
    let u: URL;
    try {
      u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(line) ? line : `https://${line}`);
    } catch {
      throw new ValidationError({ origins: `"${line}" isn't a website address, e.g. https://edgeacademy.ae` });
    }
    const local = LOCAL_HOSTS.has(u.hostname);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && local && env.NODE_ENV !== "production"))
      throw new ValidationError({ origins: `${u.origin} must start with https://` });
    if (u.username || u.password) throw new ValidationError({ origins: `"${line}" isn't a website address, e.g. https://edgeacademy.ae` });
    out.add(u.origin);
  }
  return [...out];
}

export async function saveFormOrigins(text: string, actor: Actor & { type: "USER" }) {
  const next = parseFormOrigins(text);
  const before = await getSetting("crm.formOrigins");
  await setSetting("crm.formOrigins", next, actor.id);
  await audit({ actor, action: "crm.formOrigins.update", entityType: "Setting", entityId: "crm.formOrigins", before, after: next });
  invalidateFormOrigins();
  return next;
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
