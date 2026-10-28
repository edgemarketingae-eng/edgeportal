"use server";

import { crmRoutes, type RouteBody } from "@edge/contracts";
import { checked, text, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { run } from "./common";

type ProductBody = RouteBody<typeof crmRoutes.createProduct>;

/** New product, or an edit when the form carries an id. */
export async function saveProductAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = text(form, "id");
  const body: ProductBody = {
    name: text(form, "name"),
    description: text(form, "description"),
    status: (text(form, "status") || "ACTIVE") as ProductBody["status"],
    isStudentCourse: checked(form, "isStudentCourse"),
    sortOrder: text(form, "sortOrder"),
  };
  return run(async () => {
    if (id) return api(crmRoutes.updateProduct, { params: { id }, body });
    await api(crmRoutes.createProduct, { body });
    return { ok: true, message: `${body.name} added.` };
  });
}

export async function markConversionsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const productIds = form.getAll("productIds").map(String).filter(Boolean);
  if (!productIds.length) return { error: "Choose at least one product." };
  return run(() => api(crmRoutes.markConversions, { params: { id: text(form, "id") }, body: { productIds, note: text(form, "note") } }));
}

export async function removeConversionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(crmRoutes.removeConversion, { params: { id: text(form, "id") } }));
}
