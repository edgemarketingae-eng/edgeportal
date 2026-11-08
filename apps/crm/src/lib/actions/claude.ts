"use server";

import { claudeRoutes } from "@edge/contracts";
import { checked, text, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { fail, run } from "./common";

/** The consent page's answer; the browser then goes back to Claude (an external address) itself. */
export type ConnectState = ActionState & { redirectTo?: string };

export async function approveConnectAction(_prev: ConnectState, form: FormData): Promise<ConnectState> {
  try {
    const { redirectUrl } = await api(claudeRoutes.approve, {
      params: { id: text(form, "request") },
      body: { readOnly: checked(form, "readOnly") },
    });
    return { ok: true, redirectTo: redirectUrl };
  } catch (e) {
    return fail(e);
  }
}

export async function denyConnectAction(_prev: ConnectState, form: FormData): Promise<ConnectState> {
  try {
    const { redirectUrl } = await api(claudeRoutes.deny, { params: { id: text(form, "request") } });
    return { ok: true, redirectTo: redirectUrl };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectClaudeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(claudeRoutes.disconnect, { params: { id: text(form, "connectionId") } }));
}

export async function saveClaudeAccessAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(claudeRoutes.saveAccess, { body: { enabled: checked(form, "enabled") } }));
}
