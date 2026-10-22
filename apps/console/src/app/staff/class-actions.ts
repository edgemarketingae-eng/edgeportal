"use server";

import { classRoutes, type RouteBody } from "@edge/contracts";
import { checked, text, toActionState, values, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { refresh } from "next/cache";

const SCHEDULE_FIELDS = [
  "batchId",
  "hostId",
  "title",
  "date",
  "time",
  "durationMin",
  "description",
  "manualJoinUrl",
  "openToAlumni",
  "notify",
];
const RECORDING_FIELDS = ["batchId", "classSessionId", "driveUrl", "title", "description", "publish"];

/** These forms show one message at the top, so a validation error surfaces its first field message there. */
function fail(e: unknown, vals?: Record<string, string>): ActionState {
  const s = toActionState(e, vals);
  return s.error ? s : { ...s, error: Object.values(s.fieldErrors ?? {}).find(Boolean) ?? "Please check the form." };
}

export async function scheduleClassAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let r: { notified: number; warning: string | null };
  try {
    r = await api(classRoutes.schedule, {
      body: {
        batchId: text(form, "batchId"),
        hostId: text(form, "hostId"),
        title: text(form, "title"),
        description: text(form, "description"),
        date: text(form, "date"),
        time: text(form, "time"),
        durationMin: text(form, "durationMin"),
        manualJoinUrl: text(form, "manualJoinUrl"),
        openToAlumni: checked(form, "openToAlumni"),
        notify: checked(form, "notify"),
      } satisfies RouteBody<typeof classRoutes.schedule>,
    });
  } catch (e) {
    return fail(e, values(form, SCHEDULE_FIELDS));
  }
  refresh();
  return {
    ok: true,
    message: `Class scheduled${r.notified ? ` and ${r.notified} students emailed` : ""}.${r.warning ? ` Note: ${r.warning}` : ""}`,
  };
}

export async function rescheduleClassAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api(classRoutes.reschedule, {
      params: { id: text(form, "id") },
      body: {
        title: text(form, "title"),
        description: text(form, "description"),
        date: text(form, "date"),
        time: text(form, "time"),
        durationMin: text(form, "durationMin"),
        manualJoinUrl: text(form, "manualJoinUrl"),
        notify: checked(form, "notify"),
      } satisfies RouteBody<typeof classRoutes.reschedule>,
    });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, message: "Class updated." };
}

export async function cancelClassAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api(classRoutes.cancel, {
      params: { id: text(form, "id") },
      body: { reason: text(form, "reason"), notify: checked(form, "notify") } satisfies RouteBody<typeof classRoutes.cancel>,
    });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, message: "Class cancelled." };
}

export async function addRecordingAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api(classRoutes.addRecording, {
      body: {
        batchId: text(form, "batchId"),
        classSessionId: text(form, "classSessionId") || undefined,
        driveUrl: text(form, "driveUrl"),
        title: text(form, "title"),
        description: text(form, "description"),
        publish: checked(form, "publish"),
      } satisfies RouteBody<typeof classRoutes.addRecording>,
    });
  } catch (e) {
    return fail(e, values(form, RECORDING_FIELDS));
  }
  refresh();
  return { ok: true, message: "Recording added. It will be ready to stream shortly." };
}

export async function setRecordingStatusAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const status = text(form, "status") === "PUBLISHED" ? "PUBLISHED" : "HIDDEN";
  try {
    await api(classRoutes.setRecordingStatus, { params: { id: text(form, "id") }, body: { status } });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true, message: status === "PUBLISHED" ? "Published to students." : "Hidden from students." };
}
