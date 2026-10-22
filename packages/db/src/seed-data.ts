import { SYSTEM_ROLES } from "@edge/domain/auth/permissions";
import { FeeRate } from "./models/payments";
import { Role } from "./models/people";

/** Gateway fee rates: public list prices until the client confirms its contracts (editable in Settings). */
export const FEE_RATES = [
  { key: "STRIPE_CARD_AE", gateway: "STRIPE", label: "Card (UAE)", description: "Visa / Mastercard via Stripe", pct: "0.029", fixedMinor: 100, countries: ["AE"], excludeCountries: [], sortOrder: 10 },
  { key: "STRIPE_CARD_INTL", gateway: "STRIPE", label: "Card (international)", description: "Visa / Mastercard via Stripe", pct: "0.039", fixedMinor: 100, countries: [], excludeCountries: ["AE"], sortOrder: 11 },
  { key: "NOMOD_CARD_AE", gateway: "NOMOD", label: "Card (Nomod)", description: "UAE cards via Nomod", pct: "0.0237", fixedMinor: 80, countries: ["AE"], excludeCountries: [], sortOrder: 20 },
  { key: "TABBY_AE", gateway: "TABBY", label: "Tabby", description: "Split in 4 interest-free payments", pct: "0.0675", fixedMinor: 100, countries: ["AE"], excludeCountries: [], sortOrder: 30 },
  { key: "TAMARA_AE", gateway: "TAMARA", label: "Tamara", description: "Split into interest-free payments", pct: "0.0675", fixedMinor: 100, countries: ["AE"], excludeCountries: [], sortOrder: 40 },
  { key: "MANUAL", gateway: "MANUAL", label: "Bank transfer / cash", description: "Recorded by finance staff", pct: "0", fixedMinor: 0, countries: [], excludeCountries: [], sortOrder: 99 },
] as const;

/** Idempotent: system roles are kept in sync; fee rates are only inserted when missing. */
export async function seedBaseData() {
  for (const r of SYSTEM_ROLES) {
    await Role.updateOne(
      { key: r.key },
      { $set: { name: r.name, description: r.description, permissions: r.permissions, isSystem: true } },
      { upsert: true },
    );
  }
  for (const f of FEE_RATES) {
    await FeeRate.updateOne({ key: f.key }, { $setOnInsert: { ...f, countries: [...f.countries], excludeCountries: [...f.excludeCountries] } }, { upsert: true });
  }
}
