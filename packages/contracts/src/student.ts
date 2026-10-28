import { z } from "zod";
import { EnrollmentDto } from "./enrollment";
import { route } from "./route";
import { zOk } from "./common";

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

/** Forex Growth Hub hero form (a static site on another domain). */
export const GrowthHubLeadInput = FreeClassLeadInput.omit({ phone: true }).extend({
  whatsapp: z.string().trim().min(6, "Enter your WhatsApp number").max(30),
  /** Call number, when it is not the WhatsApp one. */
  phone: z.string().trim().max(30).optional(),
  page: z.string().trim().max(500).optional(),
});

const LandingLeadResult = z.object({ ok: z.literal(true), whatsappUrl: z.string().nullable(), contactName: z.string().nullable() });

export const studentRoutes = {
  portal: route({ method: "GET", path: "/api/v1/student/portal", response: PortalDto }),
  /** No session needed (sign-up page): the batch new students are assigned to. */
  enrollingNow: route({ method: "GET", path: "/api/v1/public/enrolling-now", response: z.object({ batch: z.object({ name: z.string(), startDate: z.string() }).nullable() }) }),
  /** No session needed (landing page): the next free live class, or null when switched off. */
  freeClass: route({ method: "GET", path: "/api/v1/public/free-class", response: z.object({ freeClass: FreeClassDto.nullable() }) }),
  /** No session needed (landing page): creates the CRM lead and returns the assigned sales executive's WhatsApp link. */
  freeClassLead: route({
    method: "POST",
    path: "/api/v1/public/free-class/leads",
    body: FreeClassLeadInput,
    response: LandingLeadResult,
  }),
  updateProfile: route({ method: "POST", path: "/api/v1/student/profile", body: ProfileInput, response: zOk }),
};

/** Browser-facing routes on the public API host (api.edgeacademy.ae/api/public/...), for the academy's other sites. */
export const publicRoutes = {
  /** CORS: PUBLIC_FORM_ORIGINS only. Creates the CRM lead and returns the owner's WhatsApp link. */
  growthHubLead: route({ method: "POST", path: "/api/public/growth-hub/leads", body: GrowthHubLeadInput, response: LandingLeadResult }),
};
