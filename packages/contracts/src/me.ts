import { z } from "zod";
import { route } from "./route";

export const ViewerDto = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    phoneNumber: z.string().nullable(),
    phoneNumberVerified: z.boolean(),
    twoFactorEnabled: z.boolean(),
    mustChangePassword: z.boolean(),
  }),
  permissions: z.array(z.string()),
  student: z.object({ country: z.string(), pendingPhone: z.string().nullable(), jetaFxClientId: z.string().nullable(), marketingConsent: z.boolean() }).nullable(),
  staff: z.object({ title: z.string().nullable(), workspaceEmail: z.string().nullable() }).nullable(),
  twoFactorRequired: z.boolean(),
  unreadNotifications: z.number().int(),
  homes: z.object({ student: z.string().nullable(), console: z.string().nullable() }),
});
export type ViewerDto = z.infer<typeof ViewerDto>;

export const NotificationDto = z.object({ id: z.string(), title: z.string(), body: z.string(), href: z.string().nullable(), readAt: z.string().nullable(), createdAt: z.string() });
export type NotificationDto = z.infer<typeof NotificationDto>;

export const meRoutes = {
  me: route({ method: "GET", path: "/api/v1/me", response: ViewerDto }),
  /** Latest 50; marks them read. */
  notifications: route({ method: "GET", path: "/api/v1/notifications", response: z.array(NotificationDto) }),
};
