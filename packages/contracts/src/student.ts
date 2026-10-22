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

export const studentRoutes = {
  portal: route({ method: "GET", path: "/api/v1/student/portal", response: PortalDto }),
  /** No session needed (sign-up page): the batch new students are assigned to. */
  enrollingNow: route({ method: "GET", path: "/api/v1/public/enrolling-now", response: z.object({ batch: z.object({ name: z.string(), startDate: z.string() }).nullable() }) }),
  updateProfile: route({ method: "POST", path: "/api/v1/student/profile", body: ProfileInput, response: zOk }),
};
