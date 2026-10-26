"use server";

import { crmRoutes, type RouteBody } from "@edge/contracts";
import { text, values, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { refresh } from "next/cache";
import { fail } from "./common";

function submitted(form: FormData, keys: string[], list: string) {
  return { ...values(form, keys), [list]: form.getAll(list).map(String).join(",") };
}

export async function createCrmStaffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let r: { tempPassword?: string };
  try {
    r = await api(crmRoutes.createStaff, {
      body: {
        name: text(form, "name"),
        email: text(form, "email"),
        title: text(form, "title"),
        workspaceEmail: text(form, "workspaceEmail"),
        phone: text(form, "phone"),
        roleKeys: form.getAll("roleKeys").map(String),
        projectIds: form.getAll("projectIds").map(String).filter(Boolean),
      } satisfies RouteBody<typeof crmRoutes.createStaff>,
    });
  } catch (e) {
    return fail(e, { ...submitted(form, ["name", "email", "title", "workspaceEmail", "phone"], "roleKeys"), projectIds: form.getAll("projectIds").map(String).join(",") });
  }
  refresh();
  return { ok: true, message: r.tempPassword ? `Account created. Temporary password ${r.tempPassword} was emailed.` : "Account created." };
}

export async function updateCrmStaffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api(crmRoutes.updateStaff, {
      params: { id: text(form, "userId") },
      body: { name: text(form, "name"), title: text(form, "title"), workspaceEmail: text(form, "workspaceEmail"), phone: text(form, "phone"), roleKeys: form.getAll("roleKeys").map(String) } satisfies RouteBody<typeof crmRoutes.updateStaff>,
    });
  } catch (e) {
    return fail(e, submitted(form, ["name", "title", "workspaceEmail", "phone"], "roleKeys"));
  }
  refresh();
  return { ok: true, message: "Saved." };
}

export async function toggleCrmStaffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const disable = text(form, "disable") === "1";
  try {
    await api(crmRoutes.setStaffDisabled, { params: { id: text(form, "userId") }, body: { disabled: disable } });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, message: disable ? "Account disabled and signed out." : "Account enabled." };
}

export async function toggleCrmStaffAvailableAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let message: string | undefined;
  try {
    ({ message } = await api(crmRoutes.setStaffAvailable, {
      params: { id: text(form, "userId") },
      body: { available: text(form, "available") === "1" },
    }));
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, message: message ?? "Saved." };
}

export async function resetCrmStaffPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let pw: string;
  try {
    pw = (await api(crmRoutes.resetStaffPassword, { params: { id: text(form, "userId") } })).tempPassword;
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, message: `New temporary password ${pw} was emailed.` };
}

export async function saveCrmRoleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api(crmRoutes.saveRole, {
      body: { id: text(form, "id") || undefined, name: text(form, "name"), description: text(form, "description"), permissions: form.getAll("permissions").map(String) } satisfies RouteBody<typeof crmRoutes.saveRole>,
    });
  } catch (e) {
    return fail(e, submitted(form, ["name", "description"], "permissions"));
  }
  refresh();
  return { ok: true, message: "Role saved." };
}
