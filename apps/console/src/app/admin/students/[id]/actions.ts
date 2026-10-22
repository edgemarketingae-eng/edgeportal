"use server";

import { paymentRoutes } from "@edge/contracts";
import { text, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { refresh } from "next/cache";
import { dialogError } from "@/components/admin-ops/action-error";

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
