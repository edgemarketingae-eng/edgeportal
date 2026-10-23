"use server";

import { crmRoutes, type RouteBody } from "@edge/contracts";
import { text, toActionState, values, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { run } from "./common";

const PROJECT_FIELDS = ["name", "code", "description", "status", "courseId", "batchId", "startDate", "endDate", "targetLeads", "targetConversions"];
type ProjectBody = RouteBody<typeof crmRoutes.createProject>;

function projectBody(form: FormData): ProjectBody {
  return {
    name: text(form, "name"),
    code: text(form, "code"),
    description: text(form, "description"),
    status: (text(form, "status") || "ACTIVE") as ProjectBody["status"],
    courseId: text(form, "courseId"),
    batchId: text(form, "batchId"),
    startDate: text(form, "startDate"),
    endDate: text(form, "endDate"),
    targetLeads: text(form, "targetLeads"),
    targetConversions: text(form, "targetConversions"),
    ...(form.has("managerIds") ? { managerIds: form.getAll("managerIds").map(String).filter(Boolean) } : {}),
    ...(form.has("memberIds") ? { memberIds: form.getAll("memberIds").map(String).filter(Boolean) } : {}),
  };
}

export async function saveProjectAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = text(form, "id");
  let created: { id: string } | null = null;
  try {
    if (id) await api(crmRoutes.updateProject, { params: { id }, body: projectBody(form) });
    else created = await api(crmRoutes.createProject, { body: projectBody(form) });
  } catch (e) {
    const s = toActionState(e, { ...values(form, PROJECT_FIELDS), managerIds: form.getAll("managerIds").map(String).join(","), memberIds: form.getAll("memberIds").map(String).join(",") });
    return s.error || !s.fieldErrors ? s : { ...s, error: "Please fix the highlighted fields." };
  }
  if (created) redirect(`/projects/${created.id}?created=1`);
  refresh();
  return { ok: true, message: "Project saved." };
}

export async function projectMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(crmRoutes.projectMember, { params: { id: text(form, "id") }, body: { userId: text(form, "userId"), role: text(form, "role") as "manager" | "member" } }));
}

export async function removeProjectMemberAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(crmRoutes.removeProjectMember, { params: { id: text(form, "id") }, body: { userId: text(form, "userId") } }));
}
