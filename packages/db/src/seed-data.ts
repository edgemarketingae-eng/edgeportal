import { RETIRED_SYSTEM_ROLES, SYSTEM_ROLES } from "@edge/domain/auth/permissions";
import { LEAD_LANGUAGES, SUPPORT_PROJECT_CODE } from "@edge/domain/crm/enums";
import { normalizeLanguage } from "@edge/domain/crm/machine";
import { Lead, LeadDeposit, Project } from "./models/crm";
import { FeeRate, Setting } from "./models/payments";
import { Role, StaffProfile } from "./models/people";

/** Gateway fee rates: public list prices until the client confirms its contracts (editable in Settings). */
export const FEE_RATES = [
  {
    key: "STRIPE_CARD_AE",
    gateway: "STRIPE",
    label: "Card (UAE)",
    description: "Visa / Mastercard via Stripe",
    pct: "0.029",
    fixedMinor: 100,
    countries: ["AE"],
    excludeCountries: [],
    sortOrder: 10,
  },
  {
    key: "STRIPE_CARD_INTL",
    gateway: "STRIPE",
    label: "Card (international)",
    description: "Visa / Mastercard via Stripe",
    pct: "0.039",
    fixedMinor: 100,
    countries: [],
    excludeCountries: ["AE"],
    sortOrder: 11,
  },
  {
    key: "NOMOD_CARD_AE",
    gateway: "NOMOD",
    label: "Card (Nomod)",
    description: "UAE cards via Nomod",
    pct: "0.0237",
    fixedMinor: 80,
    countries: ["AE"],
    excludeCountries: [],
    sortOrder: 20,
  },
  {
    key: "TABBY_AE",
    gateway: "TABBY",
    label: "Tabby",
    description: "Split in 4 interest-free payments",
    pct: "0.0675",
    fixedMinor: 100,
    countries: ["AE"],
    excludeCountries: [],
    sortOrder: 30,
  },
  {
    key: "TAMARA_AE",
    gateway: "TAMARA",
    label: "Tamara",
    description: "Split into interest-free payments",
    pct: "0.0675",
    fixedMinor: 100,
    countries: ["AE"],
    excludeCountries: [],
    sortOrder: 40,
  },
  {
    key: "MANUAL",
    gateway: "MANUAL",
    label: "Bank transfer / cash",
    description: "Recorded by finance staff",
    pct: "0",
    fixedMinor: 0,
    countries: [],
    excludeCountries: [],
    sortOrder: 99,
  },
] as const;

/** Idempotent: system roles are kept in sync; fee rates and the default and Support CRM projects are only inserted when missing. */
export async function seedBaseData() {
  for (const r of SYSTEM_ROLES) {
    await Role.updateOne(
      { key: r.key },
      { $set: { name: r.name, description: r.description, permissions: r.permissions, isSystem: true } },
      { upsert: true },
    );
  }
  // Retired system roles: move members to the replacement role, then drop the old one.
  for (const { key, replacedBy } of RETIRED_SYSTEM_ROLES) {
    const [old, repl] = await Promise.all([Role.findOne({ key }).lean(), Role.findOne({ key: replacedBy }).lean()]);
    if (!old || !repl) continue;
    await StaffProfile.updateMany({ roleIds: old._id }, { $addToSet: { roleIds: repl._id } });
    await StaffProfile.updateMany({ roleIds: old._id }, { $pull: { roleIds: old._id } });
    await Role.deleteOne({ _id: old._id });
  }
  await Project.updateOne(
    { isDefault: true },
    {
      $setOnInsert: {
        name: "General",
        code: "GENERAL",
        description: "Inbound and unassigned leads. Open to every CRM user.",
        status: "ACTIVE",
        isDefault: true,
        managerIds: [],
        memberIds: [],
      },
    },
    { upsert: true },
  );
  // Leads from the student app's contact page; admins add the support team to it.
  await Project.updateOne(
    { code: SUPPORT_PROJECT_CODE },
    {
      $setOnInsert: {
        name: "Support",
        description: "Enquiries from the contact page: help, broker accounts, courses, Inner Circle, free classes.",
        status: "ACTIVE",
        isDefault: false,
        managerIds: [],
        memberIds: [],
      },
    },
    { upsert: true },
  );
  for (const f of FEE_RATES) {
    await FeeRate.updateOne(
      { key: f.key },
      { $setOnInsert: { ...f, countries: [...f.countries], excludeCountries: [...f.excludeCountries] } },
      { upsert: true },
    );
  }
  await normalizeLeadLanguages();
  await migrateCommission();
}

/** Lead language used to be free text; map old values onto the dropdown codes (no-op once done). */
async function normalizeLeadLanguages() {
  const legacy = await Lead.collection.distinct("language", { language: { $type: "string", $nin: [...LEAD_LANGUAGES] } });
  for (const old of legacy as string[]) {
    await Lead.collection.updateMany({ language: old }, { $set: { language: normalizeLanguage(old) } });
  }
}

/**
 * Commission used to have a rate per 1st / 2nd / later deposit; now later deposits are rated by amount slab. 2nd
 * deposits become later ones (verified ones keep their commission) and the old later rate becomes the base slab.
 * No-op once done.
 */
async function migrateCommission() {
  await LeadDeposit.collection.updateMany({ sequence: "SECOND" }, { $set: { sequence: "LATER" } });
  const row = await Setting.findById("crm.commission").lean();
  const v = row?.value as { firstPct?: string; laterPct?: string; slabs?: unknown } | undefined;
  if (v && !v.slabs)
    await Setting.updateOne(
      { _id: "crm.commission" },
      { $set: { value: { firstPct: v.firstPct ?? "0", slabs: [{ fromMinor: 0, pct: v.laterPct ?? "0" }] } } },
    );
}
