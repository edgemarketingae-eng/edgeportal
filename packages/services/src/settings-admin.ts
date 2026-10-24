import type { SettingsDto } from "@edge/contracts";
import { FeeRate } from "@edge/db";
import { isCountryCode } from "@edge/domain/countries";
import type { Actor } from "@edge/domain/enums";
import { toMinor } from "@edge/domain/money";
import { audit } from "./audit";
import { env } from "./env";
import { BusinessError, NotFoundError } from "./errors";
import { getSetting, setSetting } from "./settings";

const optMinor = (v?: string) => (v && v.trim() ? toMinor(v) : null);

export async function getSettingsDto(): Promise<SettingsDto> {
  const [rates, vatCountries, vatRate, offsets, join, expiry, academy, odoo] = await Promise.all([
    FeeRate.find({ gateway: { $ne: "MOCK" } })
      .sort({ sortOrder: 1 })
      .lean(),
    getSetting("vat.countries"),
    getSetting("vat.courseRate"),
    getSetting("reminders.balanceDueOffsetsDays"),
    getSetting("classes.joinWindowMinutes"),
    getSetting("payments.checkoutExpiryMinutes"),
    getSetting("academy.profile"),
    getSetting("odoo.mapping"),
  ]);
  return {
    feeRates: rates.map((r) => ({
      key: r.key,
      gateway: r.gateway,
      label: r.label,
      description: r.description ?? null,
      pct: r.pct,
      fixedMinor: r.fixedMinor,
      feeVatRate: r.feeVatRate ?? "0.05",
      countries: r.countries ?? [],
      excludeCountries: r.excludeCountries ?? [],
      minTotalMinor: r.minTotalMinor ?? null,
      maxTotalMinor: r.maxTotalMinor ?? null,
      enabled: r.enabled ?? true,
      sortOrder: r.sortOrder ?? 0,
    })),
    vatCountries,
    vatCourseRate: vatRate,
    reminderOffsets: offsets,
    joinWindowMinutes: join,
    checkoutExpiryMinutes: expiry,
    academy,
    odoo,
    modes: {
      Payments: env.PAYMENTS_MODE,
      "Mobile OTP (Twilio)": env.OTP_MODE,
      Email: env.EMAIL_MODE,
      Odoo: env.ODOO_MODE,
      "Google Meet / Drive": env.GOOGLE_MODE,
      MailerLite: env.MAILERLITE_MODE,
    },
  };
}

/** "AE, sa in" -> ["AE", "SA", "IN"]; an unknown code is a field error instead of being dropped silently. */
function countryList(text: string | undefined, field: string) {
  const codes = (text ?? "")
    .toUpperCase()
    .split(/[,\s]+/)
    .filter(Boolean);
  const bad = codes.filter((c) => !isCountryCode(c));
  if (bad.length)
    throw new BusinessError(`Unknown country code: ${bad.join(", ")}`, {
      [field]: `Unknown: ${bad.join(", ")} (use 2-letter codes like AE, SA, IN)`,
    });
  return [...new Set(codes)];
}

export async function saveFeeRate(
  input: {
    key: string;
    label: string;
    pctPercent: number;
    fixed: string;
    min?: string;
    max?: string;
    countries?: string;
    excludeCountries?: string;
    enabled: boolean;
  },
  actor: Actor & { type: "USER" },
) {
  const before = await FeeRate.findOne({ key: input.key }).lean();
  if (!before) throw new NotFoundError("Fee rate");
  let fixedMinor: number;
  try {
    fixedMinor = toMinor(input.fixed || "0");
  } catch {
    throw new BusinessError("Enter a valid fixed fee", { fixed: "Enter an amount" });
  }
  const data = {
    label: input.label,
    pct: (input.pctPercent / 100).toFixed(6),
    fixedMinor,
    enabled: input.enabled,
    minTotalMinor: optMinor(input.min),
    maxTotalMinor: optMinor(input.max),
    countries: countryList(input.countries, "countries"),
    excludeCountries: countryList(input.excludeCountries, "excludeCountries"),
    updatedById: actor.id,
  };
  await FeeRate.updateOne({ key: input.key }, { $set: data });
  await audit({
    actor,
    action: "feeRate.update",
    entityType: "FeeRate",
    entityId: input.key,
    before: { pct: before.pct, fixedMinor: before.fixedMinor, enabled: before.enabled },
    after: data,
  });
}

export async function saveGeneralSettings(
  d: {
    vatCountries: string;
    vatRate: number;
    reminderOffsets: string;
    joinWindowMinutes: number;
    checkoutExpiryMinutes: number;
    name: string;
    supportEmail: string;
    supportWhatsapp: string;
    website: string;
  },
  actor: Actor & { type: "USER" },
) {
  const offsets = [
    ...new Set(
      d.reminderOffsets
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(Number),
    ),
  ].filter((n) => Number.isInteger(n) && n >= 0 && n <= 60);
  await setSetting("vat.countries", countryList(d.vatCountries, "vatCountries"), actor.id);
  await setSetting("vat.courseRate", (d.vatRate / 100).toFixed(4), actor.id);
  await setSetting(
    "reminders.balanceDueOffsetsDays",
    offsets.sort((a, b) => b - a),
    actor.id,
  );
  await setSetting("classes.joinWindowMinutes", d.joinWindowMinutes, actor.id);
  await setSetting("payments.checkoutExpiryMinutes", d.checkoutExpiryMinutes, actor.id);
  await setSetting(
    "academy.profile",
    { name: d.name, supportEmail: d.supportEmail, supportWhatsapp: d.supportWhatsapp, website: d.website },
    actor.id,
  );
  await audit({ actor, action: "settings.general.update", entityType: "Setting", entityId: "general", after: d });
}

export async function saveOdooMapping(
  input: {
    courseProductId?: number | "";
    feeProductId?: number | "";
    taxStandardId?: number | "";
    taxZeroRatedId?: number | "";
    journals: Record<string, number | "" | undefined>;
  },
  actor: Actor & { type: "USER" },
) {
  const n = (v: number | "" | undefined) => (typeof v === "number" ? v : null);
  const journalIds: Record<string, number> = {};
  for (const [g, v] of Object.entries(input.journals)) if (typeof v === "number") journalIds[g] = v;
  const current = await getSetting("odoo.mapping");
  const next = {
    courseProductId: n(input.courseProductId),
    feeProductId: n(input.feeProductId),
    taxStandardId: n(input.taxStandardId),
    taxZeroRatedId: n(input.taxZeroRatedId),
    journalIds,
  };
  await setSetting("odoo.mapping", next, actor.id);
  await audit({ actor, action: "settings.odoo.update", entityType: "Setting", entityId: "odoo.mapping", before: current, after: next });
}
