import { CONTACT_CHANNELS, SUPPORT_TOPICS } from "@edge/domain/crm/enums";
import { z } from "zod";
import { EnrollmentDto } from "./enrollment";
import { route } from "./route";
import { zEmail, zOk } from "./common";

export const PortalDto = z.object({
  enrollment: EnrollmentDto.extend({
    batch: z.object({
      name: z.string(),
      code: z.string(),
      startDate: z.string(),
      endDate: z.string().nullable(),
      scheduleText: z.string().nullable(),
      description: z.string().nullable(),
      courseTitle: z.string(),
      courseDescription: z.string().nullable(),
      advanceEnabled: z.boolean(),
      advancePresetsMinor: z.array(z.number()),
      mentors: z.array(z.object({ name: z.string(), title: z.string().nullable(), isLead: z.boolean() })),
    }),
  }).nullable(),
  entitlements: z.object({
    banner: z.enum(["NO_BATCH", "PENDING_PAYMENT", "PENDING_APPROVAL", "OVERDUE", "LOCKED_MANUAL", "REJECTED", "CANCELLED"]).nullable(),
    active: z.boolean(),
    fullyPaid: z.boolean(),
    canCheckout: z.boolean(),
    canPayBalance: z.boolean(),
    whatsappGroupUrl: z.string().nullable(),
    mentorship: z.boolean(),
  }),
  supportEmail: z.string(),
  now: z.string(),
});
export type PortalDto = z.infer<typeof PortalDto>;

export const ProfileInput = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80),
  jetaFxClientId: z.string().trim().max(50),
  marketingConsent: z.boolean(),
});

export const FreeClassDto = z.object({
  title: z.string(),
  /** ISO; null when no upcoming date is set. */
  startsAt: z.string().nullable(),
  durationMinutes: z.number(),
  platform: z.string(),
});
export type FreeClassDto = z.infer<typeof FreeClassDto>;

const utmField = z.string().trim().max(200).optional();
export const FreeClassLeadInput = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
  phone: z.string().trim().min(6, "Enter your WhatsApp number").max(30),
  /** Honeypot: people never see or fill it. */
  website: z.string().max(200).optional(),
  utm: z.object({ source: utmField, medium: utmField, campaign: utmField, content: utmField, term: utmField }).optional(),
});

/** Forex Growth Hub forms (a static site on another domain): the hero enquiry and the Inner Circle form. */
export const GrowthHubLeadInput = FreeClassLeadInput.omit({ phone: true }).extend({
  intent: z.enum(["enquiry", "inner-circle"]).default("enquiry"),
  whatsapp: z.string().trim().min(6, "Enter your WhatsApp number").max(30),
  /** Call number, when it is not the WhatsApp one. */
  phone: z.string().trim().max(30).optional(),
  email: z.union([z.literal(""), zEmail()]).optional(),
  /** Inner Circle: the account they opened with JetaFX through our link. */
  jetaFxClientId: z.string().trim().max(40).optional(),
  page: z.string().trim().max(500).optional(),
});

/** The contact page (/support): what the visitor needs, and optionally a note and their JetaFX client ID. */
export const SupportLeadInput = FreeClassLeadInput.extend({
  topic: z.enum(SUPPORT_TOPICS, { message: "Choose what you need help with" }),
  message: z.string().trim().max(1000, "Keep it under 1,000 characters").optional(),
  jetaFxClientId: z.string().trim().max(40).optional(),
});

/** Where the visitor goes next: the lead owner's (or support's) chat, with their first message typed in. */
const LandingLeadResult = z.object({
  ok: z.literal(true),
  contactUrl: z.string().nullable(),
  channel: z.enum(CONTACT_CHANNELS).nullable(),
  contactName: z.string().nullable(),
});

export const studentRoutes = {
  portal: route({ method: "GET", path: "/api/v1/student/portal", response: PortalDto }),
  /** No session needed (sign-up page): the batch new students are assigned to. */
  enrollingNow: route({
    method: "GET",
    path: "/api/v1/public/enrolling-now",
    response: z.object({ batch: z.object({ name: z.string(), startDate: z.string() }).nullable() }),
  }),
  /** No session needed (landing page): the next free live class, or null when switched off. */
  freeClass: route({ method: "GET", path: "/api/v1/public/free-class", response: z.object({ freeClass: FreeClassDto.nullable() }) }),
  /** No session needed (landing page): creates the CRM lead and returns the assigned sales executive's chat link. */
  freeClassLead: route({
    method: "POST",
    path: "/api/v1/public/free-class/leads",
    body: FreeClassLeadInput,
    response: LandingLeadResult,
  }),
  /** No session needed (contact page): creates the lead in the Support project and returns the chat link. */
  supportLead: route({ method: "POST", path: "/api/v1/public/support/leads", body: SupportLeadInput, response: LandingLeadResult }),
  updateProfile: route({ method: "POST", path: "/api/v1/student/profile", body: ProfileInput, response: zOk }),
};

const formText = (max: number) => z.string().trim().max(max).optional();
/** A checkbox: "on" (its default value), "true", "1" or "yes" is ticked; JSON may send a real boolean. */
const formBool = z
  .preprocess((v) => (typeof v === "string" ? ["on", "true", "1", "yes"].includes(v.trim().toLowerCase()) : v), z.boolean())
  .optional();

/**
 * A lead from any website form (plain HTML or JavaScript), sent as JSON or as a form post. Field names match the
 * signed webhook's, so one form can use either. Needs a name and a phone or an email.
 */
export const WebsiteLeadInput = z
  .object({
    name: z.string().trim().min(1, "Enter your name").max(80, "Name is too long"),
    phone: formText(40),
    email: z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.union([z.literal(""), zEmail()])).optional(),
    /** Two-letter country code (AE, IN…) for numbers typed without +; anything else is ignored. */
    country: formText(60),
    message: formText(5000),
    course: formText(200),
    page: formText(500),
    language: formText(20),
    /** An array, or comma separated text in a form. */
    tags: z
      .preprocess(
        (v) =>
          typeof v === "string"
            ? v
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : v,
        z.array(z.string().trim().max(50)).max(20),
      )
      .optional(),
    consent: formBool,
    whatsappConsent: formBool,
    utm: z.object({ source: utmField, medium: utmField, campaign: utmField, content: utmField, term: utmField }).optional(),
    utm_source: utmField,
    utm_medium: utmField,
    utm_campaign: utmField,
    utm_content: utmField,
    utm_term: utmField,
    /** CRM project code for new leads; unknown or empty means General. */
    project: formText(40),
    /** Plain form posts: where to send the visitor afterwards (a page on an allowed website). */
    redirect: formText(1000),
    /** Honeypot: hide it from people; bots that fill it get a fake success. */
    website: z.string().max(500).optional(),
  })
  .superRefine((d, ctx) => {
    if (!d.phone && !d.email) ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter a phone number or an email" });
  });
export type WebsiteLeadInput = z.infer<typeof WebsiteLeadInput>;

/** Browser-facing routes on the public API host (api.edgeacademy.ae/api/public/...), for the academy's other sites. */
export const publicRoutes = {
  /** CORS: PUBLIC_FORM_ORIGINS only. Creates the CRM lead and returns the owner's chat link (WhatsApp or Telegram). */
  growthHubLead: route({ method: "POST", path: "/api/public/growth-hub/leads", body: GrowthHubLeadInput, response: LandingLeadResult }),
  /**
   * Any allowed website's form (CRM Settings → Website forms, plus PUBLIC_FORM_ORIGINS). JSON or
   * application/x-www-form-urlencoded. JSON callers get `{ ok: true }`; a browser form post is redirected to `redirect`
   * (303) or shown a short thank-you page. Never says whether the person was already a lead.
   */
  websiteLead: route({ method: "POST", path: "/api/public/leads", body: WebsiteLeadInput, response: z.object({ ok: z.literal(true) }) }),
};
