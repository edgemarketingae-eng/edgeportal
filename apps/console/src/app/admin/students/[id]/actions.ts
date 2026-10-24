"use server";

import { adminRoutes, paymentRoutes } from "@edge/contracts";
import { dialogError, text, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { refresh } from "next/cache";

export async function manualPaymentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api(paymentRoutes.manual, {
      body: {
        studentId: text(form, "studentId"),
        kind: text(form, "kind"),
        amount: text(form, "amount") || undefined,
        method: text(form, "method"),
        reference: text(form, "reference"),
        notes: text(form, "notes") || undefined,
      },
    });
  } catch (e) {
    return dialogError(e);
  }
  refresh();
  return { ok: true, message: "Payment recorded." };
}

export async function setStudentCountryAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api(adminRoutes.setStudentCountry, { params: { id: text(form, "studentId") }, body: { country: text(form, "country") } });
  } catch (e) {
    return dialogError(e);
  }
  refresh();
  return { ok: true, message: "Country updated." };
}
