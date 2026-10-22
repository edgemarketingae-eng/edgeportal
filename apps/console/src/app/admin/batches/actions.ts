"use server";

import { catalogRoutes, type BatchInput, type RouteBody } from "@edge/contracts";
import { checked, text, toActionState, values, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";

const COURSE_FIELDS = ["code", "title", "description", "isActive"];
const BATCH_FIELDS = [
  "courseId",
  "code",
  "name",
  "description",
  "startDate",
  "endDate",
  "scheduleText",
  "capacity",
  "status",
  "fee",
  "advanceEnabled",
  "advancePresets",
  "allowCustomAdvance",
  "balanceDueRule",
  "balanceDueDate",
  "balanceDueDays",
  "lockGraceDays",
  "whatsappGroupUrl",
  "isCurrentForEnrollment",
];

export async function saveCourseAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api(catalogRoutes.saveCourse, {
      body: {
        id: text(form, "id") || undefined,
        code: text(form, "code"),
        title: text(form, "title"),
        description: text(form, "description"),
        isActive: checked(form, "isActive"),
      } satisfies RouteBody<typeof catalogRoutes.saveCourse>,
    });
  } catch (e) {
    return toActionState(e, values(form, COURSE_FIELDS));
  }
  refresh();
  return { ok: true, message: "Course saved." };
}

export async function saveBatchAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = text(form, "id");
  const mentorIds = form.getAll("mentorIds").map(String);
  let saved: { id: string };
  try {
    saved = await api(catalogRoutes.saveBatch, {
      body: {
        id: id || undefined,
        courseId: text(form, "courseId"),
        code: text(form, "code"),
        name: text(form, "name"),
        description: text(form, "description"),
        startDate: text(form, "startDate"),
        endDate: text(form, "endDate"),
        scheduleText: text(form, "scheduleText"),
        capacity: text(form, "capacity"),
        status: text(form, "status") as BatchInput["status"],
        fee: text(form, "fee"),
        advanceEnabled: checked(form, "advanceEnabled"),
        advancePresets: text(form, "advancePresets"),
        allowCustomAdvance: checked(form, "allowCustomAdvance"),
        balanceDueRule: text(form, "balanceDueRule") as BatchInput["balanceDueRule"],
        balanceDueDate: text(form, "balanceDueDate"),
        balanceDueDays: text(form, "balanceDueDays"),
        lockGraceDays: text(form, "lockGraceDays"),
        whatsappGroupUrl: text(form, "whatsappGroupUrl"),
        isCurrentForEnrollment: checked(form, "isCurrentForEnrollment"),
        mentorIds,
      } satisfies RouteBody<typeof catalogRoutes.saveBatch>,
    });
  } catch (e) {
    const s = toActionState(e, { ...values(form, BATCH_FIELDS), mentorIds: mentorIds.join(",") });
    return s.error || !s.fieldErrors ? s : { ...s, error: "Please fix the highlighted fields." };
  }
  if (!id) redirect(`/admin/batches/${saved.id}?created=1`);
  refresh();
  return { ok: true, message: "Batch saved." };
}
