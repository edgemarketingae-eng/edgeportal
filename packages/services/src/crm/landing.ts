import type { FreeClassDto } from "@edge/contracts";
import { Types } from "@edge/db";
import { now } from "@edge/domain/clock";
import type { ContactChannel } from "@edge/domain/crm/enums";
import { whatsappDigits } from "@edge/domain/crm/machine";
import { HOME_COUNTRY } from "@edge/domain/countries";
import { parsePhone } from "@edge/domain/phone";
import { getSetting } from "../settings";
import { recordActivity } from "./common";
import { ingestInboundLead } from "./ingest";
import { reachableExec } from "./round-robin";

/**
 * Public lead pages that send the visitor straight to a sales executive's chat (WhatsApp or Telegram, whichever the
 * executive uses): the free live class landing page (student app home) and the Forex Growth Hub forms
 * (growthhub.edgeverse.ae, a separate static site).
 */

const SOURCE_DETAIL = "Free live class landing page";
const GROWTH_HUB_DETAIL = "Forex Growth Hub";
/** CRM project (by code) for new Growth Hub leads; General if it is missing or not active. */
const GROWTH_HUB_PROJECT = "FREE-COURSE-SUPPORT";

type Utm = { source?: string; medium?: string; campaign?: string; content?: string; term?: string };

/** The class to show, or null when switched off. A date that has already ended is dropped, not the class. */
export async function getPublicFreeClass(): Promise<FreeClassDto | null> {
  const fc = await getSetting("marketing.freeClass");
  if (!fc.enabled) return null;
  const ended = fc.startsAt ? new Date(fc.startsAt).getTime() + fc.durationMinutes * 60_000 < now().getTime() : false;
  return { title: fc.title, startsAt: ended ? null : fc.startsAt, durationMinutes: fc.durationMinutes, platform: fc.platform };
}

/** Chat link with the visitor's first message typed in; they press send, so the conversation is theirs. */
function chatLink(channel: ContactChannel, handle: string, text: string) {
  const q = `?text=${encodeURIComponent(text)}`;
  return channel === "TELEGRAM" ? `https://t.me/${handle}${q}` : `https://wa.me/${whatsappDigits(handle)}${q}`;
}

/**
 * The owner on their channel when they are active, not Off and have a phone/username for it; otherwise the
 * academy's support WhatsApp.
 */
async function contactFor(ownerId: string | null) {
  const exec = await reachableExec(ownerId);
  if (exec) return { channel: exec.channel, handle: exec.handle, name: exec.name, greet: exec.name.split(/\s+/)[0]!, exec: true };
  const academy = await getSetting("academy.profile");
  // The academy's own number, typed by an admin in Dubai, so a local number is read as UAE.
  const support = academy.supportWhatsapp.trim() ? parsePhone(academy.supportWhatsapp, HOME_COUNTRY) : null;
  return support
    ? { channel: "WHATSAPP" as ContactChannel, handle: support.e164, name: academy.name, greet: academy.name, exec: false }
    : null;
}

const CHANNEL_NAME: Record<ContactChannel, string> = { WHATSAPP: "WhatsApp", TELEGRAM: "Telegram" };

/**
 * Create (or refresh) the CRM lead in the General project (or `projectCode`), round-robin it to a sales executive
 * on that project who can be chatted with, note on the timeline where the visitor was sent, and return the chat link.
 */
async function captureLandingLead(input: {
  name: string;
  phone: string;
  email?: string;
  /** A second number of the visitor's: an existing lead under either number is theirs. */
  altPhone?: string | null;
  jetaFxClientId?: string;
  message?: string;
  page: string;
  tags: string[];
  projectCode?: string;
  /** Short id for the timeline entry (data.landing) and the page named in it. */
  landing: { id: string; label: string };
  utm?: Utm;
  text: (greet: string, visitor: string) => string;
}) {
  const out = await ingestInboundLead(
    "website",
    {
      name: input.name,
      phone: input.phone,
      email: input.email,
      message: input.message,
      page: input.page,
      utm: input.utm,
      whatsappConsent: true,
      tags: input.tags,
    },
    null,
    { assignReachableExec: true, altPhone: input.altPhone, projectCode: input.projectCode, jetaFxClientId: input.jetaFxClientId },
  );
  const contact = await contactFor(out.ownerId);
  if (contact)
    await recordActivity(
      new Types.ObjectId(out.leadId),
      "SYSTEM",
      { type: "WEBHOOK", id: "leads:website" },
      {
        body: `Sent to ${contact.exec ? `${contact.name}'s` : "the academy support"} ${CHANNEL_NAME[contact.channel]} from ${input.landing.label}. Expect their message.`,
        data: { landing: input.landing.id, channel: contact.channel, [contact.channel === "TELEGRAM" ? "telegram" : "whatsapp"]: contact.handle },
      },
    );
  return {
    contactUrl: contact ? chatLink(contact.channel, contact.handle, input.text(contact.greet, input.name.trim())) : null,
    channel: contact?.channel ?? null,
    contactName: contact?.name ?? null,
  };
}

/** Free live class landing page. */
export async function captureFreeClassLead(input: { name: string; phone: string; utm?: Utm }) {
  const fc = await getSetting("marketing.freeClass");
  const title = fc.enabled ? fc.title : null;
  return captureLandingLead({
    name: input.name,
    phone: input.phone,
    page: SOURCE_DETAIL,
    tags: ["free-live-class"],
    landing: { id: "free-class", label: "the free class page" },
    utm: input.utm,
    text: (greet, visitor) =>
      `Hi ${greet}, I'm ${visitor}. I'd like to join the free live trading class${title ? ` (${title})` : ""}. Please send me the details.`,
  });
}

/**
 * Forex Growth Hub forms: the hero enquiry (people watching the recorded classes) and the Inner Circle form (people
 * who opened a JetaFX account through our link). New leads go to the Free Course support project.
 * The lead's phone is the WhatsApp number; a different call number is kept in the notes and also used to find a
 * known lead.
 */
export async function captureGrowthHubLead(input: {
  name: string;
  whatsapp: string;
  phone?: string;
  email?: string;
  jetaFxClientId?: string;
  intent?: "enquiry" | "inner-circle";
  page?: string;
  utm?: Utm;
}) {
  const wa = parsePhone(input.whatsapp)?.e164 ?? null;
  const call = input.phone?.trim() ? (parsePhone(input.phone)?.e164 ?? null) : null;
  const otherCall = call && call !== wa ? call : null;
  const innerCircle = input.intent === "inner-circle";
  const clientId = input.jetaFxClientId?.trim() || undefined;
  const notes = [
    innerCircle ? `Inner Circle request: opened a JetaFX account${clientId ? ` (Client ID ${clientId})` : ""}.` : null,
    // Both numbers, so a known lead found under its call number still gets the WhatsApp one on its timeline.
    otherCall ? `WhatsApp: ${wa}\nPhone (calls): ${otherCall}` : null,
  ].filter(Boolean);
  return captureLandingLead({
    name: input.name,
    phone: input.whatsapp,
    email: input.email?.trim() || undefined,
    altPhone: otherCall,
    jetaFxClientId: clientId,
    message: notes.length ? notes.join("\n") : undefined,
    page: innerCircle ? `${GROWTH_HUB_DETAIL} · Inner Circle` : GROWTH_HUB_DETAIL,
    tags: innerCircle ? ["growth-hub", "inner-circle"] : ["growth-hub"],
    projectCode: GROWTH_HUB_PROJECT,
    landing: innerCircle ? { id: "growth-hub-inner-circle", label: "the Forex Growth Hub Inner Circle form" } : { id: "growth-hub", label: "Forex Growth Hub" },
    utm: input.utm,
    text: innerCircle
      ? (greet, visitor) =>
          `Hi ${greet}, I'm ${visitor}. I have created my JetaFX account${clientId ? ` (Client ID: ${clientId})` : ""}. Please add me to the Inner Circle.`
      : (greet, visitor) =>
          `Hi ${greet}, I'm ${visitor}. I watched the free trading classes on Forex Growth Hub and I'd like to know about your courses. Please send me the details.`,
  });
}
