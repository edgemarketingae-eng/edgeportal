"use server";

import { crmRoutes, type RouteBody } from "@edge/contracts";
import { checked, text, values, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { refresh } from "next/cache";
import { fail } from "./common";

const SETTINGS_FIELDS = ["followUpSlaHours", "staleAfterDays", "batchUrgencyDays", "roundRobin", "lostReasons"];

export async function saveCrmSettingsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api(crmRoutes.saveSettings, {
      body: {
        followUpSlaHours: text(form, "followUpSlaHours"),
        staleAfterDays: text(form, "staleAfterDays"),
        batchUrgencyDays: text(form, "batchUrgencyDays"),
        roundRobin: checked(form, "roundRobin"),
        lostReasons: text(form, "lostReasons"),
      } satisfies RouteBody<typeof crmRoutes.saveSettings>,
    });
  } catch (e) {
    return fail(e, values(form, SETTINGS_FIELDS));
  }
  refresh();
  return { ok: true, message: "CRM settings saved." };
}
