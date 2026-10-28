import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Course, Lead, LeadInboundEvent, Project, Types, withTx, type LeadInboundEventDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import { INBOUND_SOURCES } from "@edge/domain/crm/enums";
import { normalizeLanguage, parseTags } from "@edge/domain/crm/machine";
import { isCountryCode } from "@edge/domain/countries";
import { parsePhone } from "@edge/domain/phone";
import { ApiError } from "@edge/contracts";
import { z } from "zod";
import { env } from "../env";
import { notifyUser } from "../notifications/in-app";
import { getSetting } from "../settings";
import { escapeRegex, findDuplicateLeads, leadHref, normalizeEmail, recordActivity } from "./common";
import { applyAssign, createLead } from "./leads";
import { reachableExec, roundRobinPicker } from "./round-robin";
import { getDefaultProject, notifyProjectManagers } from "./scope";

const minutesAgo = (m: number) => new Date(now().getTime() - m * 60_000);
const str = (max: number) => z.string().trim().max(max).optional();

/** Website form payload (server-to-server). Unknown keys are kept in the inbox payload. */
export const InboundLeadPayload = z
  .object({
    id: str(200),
    name: z.string().trim().min(1, "name is required").max(80),
    phone: str(40),
    email: z.union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email())]).optional(),
    country: str(2),
    message: str(5000),
    course: str(200),
    page: str(500),
    language: str(20),
    tags: z.array(z.string().max(50)).max(20).optional(),
    consent: z.boolean().optional(),
    whatsappConsent: z.boolean().optional(),
    utm: z.object({ source: str(200), medium: str(200), campaign: str(200), content: str(200), term: str(200) }).optional(),
    utm_source: str(200),
    utm_medium: str(200),
    utm_campaign: str(200),
    utm_content: str(200),
    utm_term: str(200),
  })
  .loose();
export type InboundLeadPayload = z.infer<typeof InboundLeadPayload>;

export type LeadWebhookResult = { status: number; body: Record<string, unknown> };

function safeEqual(a: string, b: string) {
  return a.length === b.length && a.length > 0 && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** HMAC-SHA256 of the raw body with LEAD_WEBHOOK_SECRET (what a website backend sends in x-edge-signature). */
export function signLeadPayload(secret: string, rawBody: string) {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/**
 * Public intake: verify the shared secret, store the event in the inbox (dedupe), then create or
 * update the lead. Mirrors the payment webhook pattern so retries and replays are harmless.
 */
export async function handleLeadWebhook(source: string, rawBody: string, headers: Headers, ip: string | null): Promise<LeadWebhookResult> {
  const secret = env.LEAD_WEBHOOK_SECRET;
  if (!secret || !(INBOUND_SOURCES as readonly string[]).includes(source)) return { status: 404, body: { error: "unknown source" } };
  const sig = headers.get("x-edge-signature") ?? "";
  const tok = headers.get("x-edge-lead-token") ?? "";
  if (!safeEqual(sig, signLeadPayload(secret, rawBody)) && !safeEqual(tok, secret))
    return { status: 401, body: { error: "invalid signature" } };
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "malformed json" } };
  }
  const parsed = InboundLeadPayload.safeParse(json);
  if (!parsed.success)
    return { status: 400, body: { error: "invalid payload", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) } };
  const externalEventId = parsed.data.id ?? createHash("sha256").update(rawBody).digest("hex");

  let ev: LeadInboundEventDoc | null;
  try {
    ev = await LeadInboundEvent.findOneAndUpdate(
      { source, externalEventId },
      { $setOnInsert: { signatureOk: true, payload: { ...parsed.data, _ip: ip }, receivedAt: now(), attempts: 0 } },
      { upsert: true, returnDocument: "after" },
    ).lean();
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e;
    ev = await LeadInboundEvent.findOne({ source, externalEventId }).lean();
  }
  if (!ev) return { status: 500, body: { error: "inbox write failed" } };
  if (ev.processedAt) return { status: 200, body: { received: true, duplicate: true, leadId: ev.leadId ? String(ev.leadId) : null } };
  return processInboundEvent(ev._id);
}

async function processInboundEvent(eventId: Types.ObjectId): Promise<LeadWebhookResult> {
  const claimed = await LeadInboundEvent.findOneAndUpdate(
    { _id: eventId, processedAt: null, $or: [{ processingAt: null }, { processingAt: { $lt: minutesAgo(2) } }] },
    { $set: { processingAt: now() }, $inc: { attempts: 1 } },
    { returnDocument: "after" },
  ).lean();
  if (!claimed) return { status: 200, body: { received: true, inProgress: true } };
  try {
    const r = await ingestInboundLead(claimed.source, claimed.payload as InboundLeadPayload, claimed._id);
    await LeadInboundEvent.updateOne(
      { _id: eventId },
      { $set: { processedAt: now(), processingAt: null, error: null, leadId: new Types.ObjectId(r.leadId) } },
    );
    return { status: 200, body: { received: true, leadId: r.leadId, existing: r.existing } };
  } catch (e) {
    const permanent = e instanceof ApiError && e.status < 500;
    await LeadInboundEvent.updateOne(
      { _id: eventId },
      { $set: { processingAt: null, error: String(e).slice(0, 2000), ...(permanent ? { processedAt: now() } : {}) } },
    );
    if (permanent) return { status: e.status, body: { error: e.message, fieldErrors: e.fieldErrors ?? null } };
    console.error("[lead-webhook] processing failed", e);
    return { status: 500, body: { error: "processing failed" } };
  }
}

async function matchCourse(text?: string) {
  if (!text?.trim()) return null;
  const rx = new RegExp(escapeRegex(text.trim()), "i");
  const c = await Course.findOne(
    { isActive: true, $or: [{ code: text.trim().toUpperCase() }, { title: rx }, { slug: text.trim().toLowerCase() }] },
    { _id: 1 },
  ).lean();
  return c ? String(c._id) : null;
}

/**
 * Create the lead, or append an INBOUND entry to an existing live lead with the same phone/email.
 * `assignExecWithPhone` (landing pages) always round-robins an unowned lead to a sales executive
 * who has a phone, whatever the CRM's round-robin setting, because the visitor is sent to that person's WhatsApp.
 * `altPhone` is a second number of the visitor's (e.g. calls vs WhatsApp): an existing lead under it also matches.
 */
export async function ingestInboundLead(
  source: string,
  p: InboundLeadPayload,
  eventId: Types.ObjectId | null,
  opts: { assignExecWithPhone?: boolean; altPhone?: string | null } = {},
): Promise<{ leadId: string; existing: boolean; ownerId: string | null }> {
  const email = normalizeEmail(p.email);
  const parsedPhone = p.phone?.trim() ? parsePhone(p.phone, p.country?.toUpperCase()) : null;
  const phone = parsedPhone?.e164 ?? null;
  if (!phone && !email) throw new ApiError(422, "VALIDATION", "A valid phone or email is required", { phone: "Invalid or missing" });
  const utm = {
    source: p.utm?.source ?? p.utm_source ?? null,
    medium: p.utm?.medium ?? p.utm_medium ?? null,
    campaign: p.utm?.campaign ?? p.utm_campaign ?? null,
    content: p.utm?.content ?? p.utm_content ?? null,
    term: p.utm?.term ?? p.utm_term ?? null,
  };
  const notes = [p.message?.trim(), p.phone && !phone ? `Phone as typed: ${p.phone}` : null].filter(Boolean).join("\n");
  const actor = { type: "WEBHOOK" as const, id: `leads:${source}` };

  const altPhone = opts.altPhone?.trim() ? (parsePhone(opts.altPhone, p.country?.toUpperCase())?.e164 ?? null) : null;
  const [existing] = await findDuplicateLeads({ phone, email, altPhone });
  if (existing) {
    const at = now();
    let ownerId = existing.ownerId ? String(existing.ownerId) : null;
    // The visitor is about to message the owner on WhatsApp: an owner who is Off (or unreachable) hands the lead on.
    let reassignTo: string | null = null;
    if (opts.assignExecWithPhone && !(await reachableExec(ownerId))) {
      const project = await Project.findById(existing.projectId).lean();
      reassignTo = project ? (await roundRobinPicker(project, { withPhone: true })).next() : null;
      if (reassignTo) ownerId = reassignTo;
    }
    await withTx(async () => {
      const set: Record<string, unknown> = { lastActivityAt: at };
      if (existing.stage === "LOST") Object.assign(set, { stage: "NEW", stageChangedAt: at, lostReason: null, lostNote: null });
      for (const k of ["source", "medium", "campaign", "content", "term"] as const)
        if (!existing.utm?.[k] && utm[k]) set[`utm.${k}`] = utm[k];
      if (!existing.email && email) set.email = email;
      if (!existing.phone && phone) set.phone = phone;
      if (p.consent) Object.assign(set, { "consent.marketing": true, "consent.marketingAt": existing.consent?.marketingAt ?? at });
      if (p.whatsappConsent) set["consent.whatsapp"] = true;
      const tags = parseTags((p.tags ?? []).join(","));
      await Lead.updateOne({ _id: existing._id }, { $set: set, ...(tags.length ? { $addToSet: { tags: { $each: tags } } } : {}) });
      await recordActivity(existing._id, "INBOUND", actor, {
        body: p.message?.trim() || null,
        direction: "IN",
        data: { source, page: p.page ?? null, course: p.course ?? null, utm, eventId: eventId ? String(eventId) : null },
      });
      if (existing.stage === "LOST")
        await recordActivity(existing._id, "STAGE_CHANGED", actor, { data: { from: "LOST", to: "NEW", auto: true } });
      if (reassignTo) await applyAssign(existing, new Types.ObjectId(reassignTo), actor);
      else if (existing.ownerId)
        await notifyUser(String(existing.ownerId), {
          title: `${existing.name} enquired again`,
          body: p.message?.trim().slice(0, 140) || `New enquiry from the ${source}`,
          href: leadHref(existing._id),
        });
      else
        await notifyProjectManagers(existing.projectId, {
          title: `${existing.name} enquired again`,
          body: "Unassigned lead, enquiry from the website.",
          href: leadHref(existing._id),
        });
    });
    return { leadId: String(existing._id), existing: true, ownerId };
  }

  const cfg = await getSetting("crm.config");
  const project = await getDefaultProject();
  const ownerId = opts.assignExecWithPhone
    ? ((await roundRobinPicker(project, { withPhone: true })).next() ?? "")
    : cfg.roundRobin
      ? ((await roundRobinPicker(project)).next() ?? "")
      : "";
  const leadId = await createLead(
    {
      projectId: String(project._id),
      name: p.name,
      phone: phone ?? undefined,
      email: email ?? undefined,
      country: parsedPhone?.country ?? (isCountryCode(p.country) ? p.country.toUpperCase() : undefined),
      source: "WEBSITE",
      sourceDetail: p.page?.trim() || p.course?.trim() || undefined,
      courseInterestId: (await matchCourse(p.course)) ?? undefined,
      language: normalizeLanguage(p.language) ?? undefined,
      tags: (p.tags ?? []).join(","),
      notes: notes || undefined,
      marketingConsent: !!p.consent,
      whatsappConsent: !!p.whatsappConsent,
      preferredChannel: p.whatsappConsent ? "WHATSAPP" : undefined,
      ownerId,
      allowDuplicate: true,
    },
    actor,
    undefined,
    { inboundEventId: eventId, utm },
  );
  if (!ownerId)
    await notifyProjectManagers(project._id, {
      title: "New website lead",
      body: `${p.name}${p.course ? ` · ${p.course}` : ""}`,
      href: leadHref(leadId),
    });
  return { leadId, existing: false, ownerId: ownerId || null };
}

/** Job: reprocess inbox events whose processing failed or never finished. */
export async function sweepLeadInbox() {
  const stuck = await LeadInboundEvent.find(
    {
      processedAt: null,
      receivedAt: { $gt: minutesAgo(7 * 24 * 60) },
      $or: [{ processingAt: null }, { processingAt: { $lt: minutesAgo(2) } }],
    },
    { _id: 1 },
  )
    .limit(100)
    .lean();
  let ok = 0;
  for (const e of stuck) if ((await processInboundEvent(e._id)).status === 200) ok++;
  return { checked: stuck.length, processed: ok };
}
