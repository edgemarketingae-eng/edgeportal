"use server";

import { staffRoutes, type RouteBody } from "@edge/contracts";
import { text, toActionState, values, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { refresh } from "next/cache";

/** These forms show one message at the top, so a validation error surfaces its first field message there. */
function fail(e: unknown, vals?: Record<string, string>): ActionState {
  const s = toActionState(e, vals);
  return s.error ? s : { ...s, error: Object.values(s.fieldErrors ?? {}).find(Boolean) ?? "Please check the form." };
}

function submitted(form: FormData, keys: string[], list: string) {
  return { ...values(form, keys), [list]: form.getAll(list).map(String).join(",") };
}

export async function createStaffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let r: { tempPassword?: string };
  try {
    r = await api(staffRoutes.create, {
      body: {
        name: text(form, "name"),
        email: text(form, "email"),
        title: text(form, "title"),
        workspaceEmail: text(form, "workspaceEmail"),
        phone: text(form, "phone"),
        roleKeys: form.getAll("roleKeys").map(String),
      } satisfies RouteBody<typeof staffRoutes.create>,
    });
  } catch (e) {
    return fail(e, submitted(form, ["name", "email", "title", "workspaceEmail", "phone"], "roleKeys"));
  }
  refresh();
  return { ok: true, message: r.tempPassword ? `Account created. Temporary password ${r.tempPassword} was emailed.` : "Account created." };
}

export async function updateStaffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api(staffRoutes.update, {
      params: { id: text(form, "userId") },
      body: {
        name: text(form, "name"),
        title: text(form, "title"),
        workspaceEmail: text(form, "workspaceEmail"),
        phone: text(form, "phone"),
        roleKeys: form.getAll("roleKeys").map(String),
      } satisfies RouteBody<typeof staffRoutes.update>,
    });
  } catch (e) {
    return fail(e, submitted(form, ["name", "title", "workspaceEmail", "phone"], "roleKeys"));
  }
  refresh();
  return { ok: true, message: "Saved." };
}

export async function toggleStaffAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const disable = text(form, "disable") === "1";
  try {
    await api(staffRoutes.setDisabled, { params: { id: text(form, "userId") }, body: { disabled: disable } });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, message: disable ? "Account disabled and signed out." : "Account enabled." };
}

export async function resetStaffPasswordAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let pw: string;
  try {
    pw = (await api(staffRoutes.resetPassword, { params: { id: text(form, "userId") } })).tempPassword;
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, message: `New temporary password ${pw} was emailed.` };
}

export async function saveRoleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api(staffRoutes.saveRole, {
      body: {
        id: text(form, "id") || undefined,
        name: text(form, "name"),
        description: text(form, "description"),
        permissions: form.getAll("permissions").map(String),
      } satisfies RouteBody<typeof staffRoutes.saveRole>,
    });
  } catch (e) {
    return fail(e, submitted(form, ["name", "description"], "permissions"));
  }
  refresh();
  return { ok: true, message: "Role saved." };
}
