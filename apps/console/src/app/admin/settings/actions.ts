"use server";

import { settingsRoutes, type RouteBody } from "@edge/contracts";
import { GATEWAYS } from "@edge/domain/enums";
import { checked, text, toActionState, values, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { refresh } from "next/cache";

const GENERAL_FIELDS = [
  "vatCountries",
  "vatRate",
  "reminderOffsets",
  "joinWindowMinutes",
  "checkoutExpiryMinutes",
  "name",
  "supportEmail",
  "supportWhatsapp",
  "website",
];
const ODOO_FIELDS = ["courseProductId", "feeProductId", "taxStandardId", "taxZeroRatedId"];
const JOURNAL_GATEWAYS = GATEWAYS.filter((g) => g !== "MOCK");

/** These forms show one message (and a toast), so a validation error surfaces its first field message there. */
function fail(e: unknown, vals?: Record<string, string>): ActionState {
  const s = toActionState(e, vals);
  return s.error ? s : { ...s, error: Object.values(s.fieldErrors ?? {}).find(Boolean) ?? "Please check the form." };
}

export async function saveFeeRateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let message: string | undefined;
  try {
    ({ message } = await api(settingsRoutes.saveFeeRate, {
      body: {
        key: text(form, "key"),
        label: text(form, "label"),
        pctPercent: text(form, "pctPercent"),
        fixed: text(form, "fixed"),
        min: text(form, "min"),
        max: text(form, "max"),
        countries: text(form, "countries"),
        enabled: checked(form, "enabled"),
      } satisfies RouteBody<typeof settingsRoutes.saveFeeRate>,
    }));
  } catch (e) {
    return fail(e, values(form, ["label", "pctPercent", "fixed", "min", "max", "countries", "enabled"]));
  }
  refresh();
  return { ok: true, message: message ?? "Saved." };
}

export async function saveGeneralSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const body = values(form, GENERAL_FIELDS);
  try {
    await api(settingsRoutes.saveGeneral, { body: body as RouteBody<typeof settingsRoutes.saveGeneral> });
  } catch (e) {
    return fail(e, body);
  }
  refresh();
  return { ok: true, message: "Settings saved." };
}

export async function saveOdooMappingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api(settingsRoutes.saveOdoo, {
      body: {
        courseProductId: text(form, "courseProductId"),
        feeProductId: text(form, "feeProductId"),
        taxStandardId: text(form, "taxStandardId"),
        taxZeroRatedId: text(form, "taxZeroRatedId"),
        journals: Object.fromEntries(JOURNAL_GATEWAYS.map((g) => [g, text(form, `journal_${g}`)])),
      } satisfies RouteBody<typeof settingsRoutes.saveOdoo>,
    });
  } catch (e) {
    return fail(e, values(form, [...ODOO_FIELDS, ...JOURNAL_GATEWAYS.map((g) => `journal_${g}`)]));
  }
  refresh();
  return { ok: true, message: "Odoo mapping saved." };
}
