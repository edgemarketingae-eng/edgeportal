import { z } from "zod";
import { GATEWAYS } from "@edge/domain/enums";
import { zOk } from "./common";
import { route } from "./route";

export const FeeRateDto = z.object({
  key: z.string(),
  gateway: z.enum(GATEWAYS),
  label: z.string(),
  description: z.string().nullable(),
  pct: z.string(),
  fixedMinor: z.number(),
  feeVatRate: z.string(),
  countries: z.array(z.string()),
  excludeCountries: z.array(z.string()),
  minTotalMinor: z.number().nullable(),
  maxTotalMinor: z.number().nullable(),
  enabled: z.boolean(),
  sortOrder: z.number(),
});
export type FeeRateDto = z.infer<typeof FeeRateDto>;

export const SettingsDto = z.object({
  feeRates: z.array(FeeRateDto),
  vatCountries: z.array(z.string()),
  vatCourseRate: z.string(),
  reminderOffsets: z.array(z.number()),
  joinWindowMinutes: z.number(),
  checkoutExpiryMinutes: z.number(),
  academy: z.object({ name: z.string(), supportEmail: z.string(), supportWhatsapp: z.string(), website: z.string() }),
  odoo: z.object({
    courseProductId: z.number().nullable(),
    feeProductId: z.number().nullable(),
    taxStandardId: z.number().nullable(),
    taxZeroRatedId: z.number().nullable(),
    journalIds: z.record(z.string(), z.number()),
  }),
  modes: z.record(z.string(), z.string()),
});
export type SettingsDto = z.infer<typeof SettingsDto>;

export const FeeRateInput = z.object({
  key: z.string(),
  label: z.string().trim().min(1),
  pctPercent: z.coerce.number().min(0).max(50, "Percentage must be between 0 and 50"),
  fixed: z.string().trim(),
  min: z.string().trim().optional(),
  max: z.string().trim().optional(),
  countries: z.string().trim().optional(),
  excludeCountries: z.string().trim().optional(),
  enabled: z.boolean(),
});

export const GeneralSettingsInput = z.object({
  vatCountries: z.string(),
  vatRate: z.coerce.number().min(0).max(30),
  reminderOffsets: z.string(),
  joinWindowMinutes: z.coerce.number().int().min(0).max(120),
  checkoutExpiryMinutes: z.coerce.number().int().min(30).max(1440),
  name: z.string().trim().min(2),
  supportEmail: z.email(),
  supportWhatsapp: z.string().trim(),
  website: z.string().trim(),
});

const optId = z.union([z.literal(""), z.coerce.number().int().positive()]).optional();
export const OdooMappingInput = z.object({
  courseProductId: optId,
  feeProductId: optId,
  taxStandardId: optId,
  taxZeroRatedId: optId,
  journals: z.record(z.string(), optId),
});

export const settingsRoutes = {
  get: route({ method: "GET", path: "/api/v1/admin/settings", response: SettingsDto }),
  saveFeeRate: route({ method: "POST", path: "/api/v1/admin/settings/fee-rates", body: FeeRateInput, response: zOk }),
  saveGeneral: route({ method: "POST", path: "/api/v1/admin/settings/general", body: GeneralSettingsInput, response: zOk }),
  saveOdoo: route({ method: "POST", path: "/api/v1/admin/settings/odoo", body: OdooMappingInput, response: zOk }),
};
