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
    default: {
      courseProductId: null,
      feeProductId: null,
      taxStandardId: null,
      taxZeroRatedId: null,
      journalIds: {} as Record<string, number>,
    },
  },
  "crm.config": {
    schema: z.object({
      followUpSlaHours: z.number().int().min(1).max(720),
      staleAfterDays: z.number().int().min(1).max(365),
      batchUrgencyDays: z.number().int().min(0).max(60),
      roundRobin: z.boolean(),
      lostReasons: z.array(z.string()),
    }),
    default: {
      followUpSlaHours: 24,
      staleAfterDays: 7,
      batchUrgencyDays: 7,
      roundRobin: false,
      lostReasons: ["Budget", "Timing", "Not interested", "Unreachable", "Chose another academy", "Duplicate"],
    },
  },
  /**
   * Commission on verified broker deposits, as fractions ("0.1" = 10%): a rate for first deposits, and amount slabs
   * for later ones (sorted by `fromMinor`, the first from 0).
   */
  "crm.commission": {
    schema: z.object({
      firstPct: z.string(),
      slabs: z.array(z.object({ fromMinor: z.number().int().min(0), pct: z.string() })).min(1),
    }),
    default: { firstPct: "0", slabs: [{ fromMinor: 0, pct: "0" }] },
  },
  "academy.profile": {
    schema: z.object({ name: z.string(), supportEmail: z.string(), supportWhatsapp: z.string(), website: z.string() }),
    default: {
      name: "Edge Trading Academy",
      supportEmail: "support@edgeacademy.ae",
      supportWhatsapp: "",
      website: "https://edgeacademy.ae",
    },
  },
  /** The free live class promoted on the student app's landing page. */
  "marketing.freeClass": {
    schema: z.object({
      enabled: z.boolean(),
      title: z.string(),
      startsAt: z.string().nullable(),
      durationMinutes: z.number().int().min(15).max(480),
      platform: z.string(),
    }),
    default: {
      enabled: false,
      title: "Free Live Forex & Gold Class",
      startsAt: null as string | null,
      durationMinutes: 90,
      platform: "Live on Zoom / Google Meet",
    },
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]["schema"]>;

export function parseSetting<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const def = SETTINGS[key];
  const parsed = def.schema.safeParse(raw);
  return (parsed.success ? parsed.data : def.default) as SettingValue<K>;
}
