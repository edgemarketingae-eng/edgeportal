import { LEAD_LANGUAGES, OPEN_LEAD_STAGES, type LeadLanguage, type LeadStage, type OpenLeadStage } from "./enums";

/**
 * Pure lead pipeline rules. No I/O: the service layer loads the lead, calls these and
 * persists the patch inside a locked transaction.
 */
export function isOpenStage(stage: string): stage is OpenLeadStage {
  return (OPEN_LEAD_STAGES as readonly string[]).includes(stage);
}

/**
 * Open stages may move forwards or backwards (sales reality), to LOST, and a LOST lead may be
 * reopened. CONVERTED is terminal and is only reached through a product conversion or convert / link (never by hand).
 */
export function canTransition(from: LeadStage, to: LeadStage): boolean {
  if (from === to) return false;
  if (from === "CONVERTED" || to === "CONVERTED") return false;
  return true;
}

/** The next open stage for a one-click "advance" button, or null at the end of the funnel. */
export function nextStage(from: LeadStage): OpenLeadStage | null {
  const i = (OPEN_LEAD_STAGES as readonly string[]).indexOf(from);
  if (i < 0) return null;
  return OPEN_LEAD_STAGES[i + 1] ?? null;
}

/** Position in the funnel (NEW = 0); CONVERTED counts as the end, LOST as outside. */
export function stageIndex(stage: LeadStage): number {
  if (stage === "CONVERTED") return OPEN_LEAD_STAGES.length;
  if (stage === "LOST") return -1;
  return (OPEN_LEAD_STAGES as readonly string[]).indexOf(stage);
}

/** A NEW lead nobody has touched within the first-response SLA. */
export function isUncontacted(lead: { stage: string; firstContactedAt: Date | null; createdAt: Date }, asOf: Date, slaHours: number) {
  return lead.stage === "NEW" && !lead.firstContactedAt && asOf.getTime() - lead.createdAt.getTime() > slaHours * 3_600_000;
}

/** An open lead with no activity for `staleDays`. */
export function isStale(lead: { stage: string; lastActivityAt: Date | null; createdAt: Date }, asOf: Date, staleDays: number) {
  if (!isOpenStage(lead.stage)) return false;
  const last = lead.lastActivityAt ?? lead.createdAt;
  return asOf.getTime() - last.getTime() > staleDays * 86_400_000;
}

/** Split a comma/newline separated tag string into unique, trimmed, lower-case tags. */
export function parseTags(input: string | null | undefined): string[] {
  if (!input) return [];
  return [
    ...new Set(
      input
        .split(/[,\n]/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 30);
}

/** Digits-only phone for wa.me links (WhatsApp wants no "+"). */
export function whatsappDigits(phone: string) {
  return phone.replace(/\D/g, "");
}

/** A language code from free text ("english", " Malayalam"); blank is null, any other language is OTHER. */
export function normalizeLanguage(input: string | null | undefined): LeadLanguage | null {
  const v = input?.trim().toUpperCase();
  if (!v) return null;
  return (LEAD_LANGUAGES as readonly string[]).includes(v) ? (v as LeadLanguage) : "OTHER";
}
