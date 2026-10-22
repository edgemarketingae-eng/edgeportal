import { z } from "zod";

/**
 * Admin-editable settings (stored in the settings collection by key).
 * Secrets never live here; they stay in environment variables.
 */
export const SETTINGS = {
  "vat.countries": { schema: z.array(z.string().length(2)), default: ["AE"] },
  "vat.courseRate": { schema: z.string(), default: "0.05" },
  "reminders.balanceDueOffsetsDays": { schema: z.array(z.number().int()), default: [7, 3, 1, 0] },
  "classes.joinWindowMinutes": { schema: z.number().int().min(0), default: 15 },
  "payments.checkoutExpiryMinutes": { schema: z.number().int().min(5), default: 60 },
  "odoo.mapping": {
    schema: z.object({
      courseProductId: z.number().int().nullable(),
      feeProductId: z.number().int().nullable(),
      taxStandardId: z.number().int().nullable(),
      taxZeroRatedId: z.number().int().nullable(),
      journalIds: z.record(z.string(), z.number().int()),
    }),
    default: { courseProductId: null, feeProductId: null, taxStandardId: null, taxZeroRatedId: null, journalIds: {} as Record<string, number> },
  },
  "academy.profile": {
    schema: z.object({ name: z.string(), supportEmail: z.string(), supportWhatsapp: z.string(), website: z.string() }),
    default: { name: "Edge Trading Academy", supportEmail: "support@edgeacademy.ae", supportWhatsapp: "", website: "https://edgeacademy.ae" },
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]["schema"]>;

export function parseSetting<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const def = SETTINGS[key];
  const parsed = def.schema.safeParse(raw);
  return (parsed.success ? parsed.data : def.default) as SettingValue<K>;
}
