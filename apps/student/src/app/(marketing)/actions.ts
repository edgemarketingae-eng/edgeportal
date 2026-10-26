"use server";

import { studentRoutes, type RouteBody } from "@edge/contracts";
import { dialogError, text, values, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";

export type JoinState = ActionState & { whatsappUrl?: string | null; contactName?: string | null };

const UTM = ["source", "medium", "campaign", "content", "term"] as const;

/** Free class landing form: creates the CRM lead and returns the assigned sales executive's WhatsApp link. */
export async function joinFreeClassAction(_prev: JoinState, form: FormData): Promise<JoinState> {
  try {
    const r = await api(studentRoutes.freeClassLead, {
      body: {
        name: text(form, "name"),
        phone: text(form, "phone"),
        website: text(form, "website") || undefined,
        utm: Object.fromEntries(UTM.map((k) => [k, text(form, `utm_${k}`).slice(0, 200) || undefined])),
      } satisfies RouteBody<typeof studentRoutes.freeClassLead>,
    });
    return { ok: true, whatsappUrl: r.whatsappUrl, contactName: r.contactName };
  } catch (e) {
    return { ...dialogError(e), values: values(form, ["name", "phone"]) };
  }
}
