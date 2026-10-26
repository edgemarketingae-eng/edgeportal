import type { FreeClassDto } from "@edge/contracts";
import { Types } from "@edge/db";
import { now } from "@edge/domain/clock";
import { whatsappDigits } from "@edge/domain/crm/machine";
import { HOME_COUNTRY } from "@edge/domain/countries";
import { parsePhone } from "@edge/domain/phone";
import { getSetting } from "../settings";
import { recordActivity } from "./common";
import { ingestInboundLead } from "./ingest";
import { reachableExec } from "./round-robin";

/** Free live class landing page (student app home): the class it promotes and the lead it captures. */

const SOURCE_DETAIL = "Free live class landing page";

/** The class to show, or null when switched off. A date that has already ended is dropped, not the class. */
export async function getPublicFreeClass(): Promise<FreeClassDto | null> {
  const fc = await getSetting("marketing.freeClass");
  if (!fc.enabled) return null;
  const ended = fc.startsAt ? new Date(fc.startsAt).getTime() + fc.durationMinutes * 60_000 < now().getTime() : false;
  return { title: fc.title, startsAt: ended ? null : fc.startsAt, durationMinutes: fc.durationMinutes, platform: fc.platform };
}

/** wa.me link with the visitor's first message typed in; they press send, so the conversation is theirs. */
export function freeClassWhatsappUrl(phone: string, greet: string, visitor: string, title?: string | null) {
  const text = `Hi ${greet}, I'm ${visitor}. I'd like to join the free live trading class${title ? ` (${title})` : ""}. Please send me the details.`;
  return `https://wa.me/${whatsappDigits(phone)}?text=${encodeURIComponent(text)}`;
}

/** The owner's phone when they are active, not Off and have one; otherwise the academy's support WhatsApp. */
async function contactFor(ownerId: string | null) {
  const exec = await reachableExec(ownerId);
  if (exec) return { phone: exec.phone, name: exec.name, greet: exec.name.split(/\s+/)[0]!, exec: true };
  const academy = await getSetting("academy.profile");
  // The academy's own number, typed by an admin in Dubai, so a local number is read as UAE.
  const support = academy.supportWhatsapp.trim() ? parsePhone(academy.supportWhatsapp, HOME_COUNTRY) : null;
  return support ? { phone: support.e164, name: academy.name, greet: academy.name, exec: false } : null;
}

/**
 * Create (or refresh) the CRM lead in the General project, round-robin it to a sales executive who has a phone,
 * and return the WhatsApp link the visitor is sent to.
 */
export async function captureFreeClassLead(input: {
  name: string;
  phone: string;
  utm?: { source?: string; medium?: string; campaign?: string; content?: string; term?: string };
}) {
  const fc = await getSetting("marketing.freeClass");
  const out = await ingestInboundLead(
    "website",
    { name: input.name, phone: input.phone, page: SOURCE_DETAIL, utm: input.utm, whatsappConsent: true, tags: ["free-live-class"] },
    null,
    { assignExecWithPhone: true },
  );
  const contact = await contactFor(out.ownerId);
  if (contact)
    await recordActivity(
      new Types.ObjectId(out.leadId),
      "SYSTEM",
      { type: "WEBHOOK", id: "leads:website" },
      {
        body: `Sent to ${contact.exec ? `${contact.name}'s` : "the academy support"} WhatsApp from the free class page. Expect their message.`,
        data: { landing: "free-class", whatsapp: contact.phone },
      },
    );
  return {
    whatsappUrl: contact ? freeClassWhatsappUrl(contact.phone, contact.greet, input.name.trim(), fc.enabled ? fc.title : null) : null,
    contactName: contact?.name ?? null,
  };
}
