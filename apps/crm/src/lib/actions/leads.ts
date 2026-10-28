"use server";

import { crmRoutes, type RouteBody } from "@edge/contracts";
import { checked, dialogError, text, toActionState, values, type ActionState } from "@edge/web/actions";
import { api } from "@edge/web/server";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { UNASSIGN } from "../bulk";
import { fail, run } from "./common";

const LEAD_FIELDS = [
  "projectId",
  "name",
  "phone",
  "email",
  "country",
  "source",
  "sourceDetail",
  "courseInterestId",
  "batchInterestId",
  "experienceLevel",
  "temperature",
  "preferredChannel",
  "language",
  "jetaFxClientId",
  "qualificationExperience",
  "qualificationOccupation",
  "qualificationPurpose",
  "tags",
  "notes",
  "marketingConsent",
  "whatsappConsent",
  "nextFollowUpAt",
  "ownerId",
  "allowDuplicate",
];
const ACTIVITY_FIELDS = ["type", "body", "outcome", "direction", "nextFollowUpAt", "nextFollowUpTitle", "nextFollowUpType"];

type LeadBody = RouteBody<typeof crmRoutes.create>;
type LeadFiltersBody = NonNullable<RouteBody<typeof crmRoutes.bulkDelete>["filters"]>;

function qualificationBody(form: FormData): LeadBody["qualification"] {
  return {
    experience: text(form, "qualificationExperience"),
    occupation: text(form, "qualificationOccupation"),
    purpose: text(form, "qualificationPurpose"),
  };
}

function leadBody(form: FormData): LeadBody {
  return {
    projectId: text(form, "projectId"),
    name: text(form, "name"),
    phone: text(form, "phone"),
    email: text(form, "email"),
    country: text(form, "country"),
    source: text(form, "source") as LeadBody["source"],
    sourceDetail: text(form, "sourceDetail"),
    courseInterestId: text(form, "courseInterestId"),
    batchInterestId: text(form, "batchInterestId"),
    experienceLevel: text(form, "experienceLevel") as LeadBody["experienceLevel"],
    temperature: text(form, "temperature") as LeadBody["temperature"],
    preferredChannel: text(form, "preferredChannel") as LeadBody["preferredChannel"],
    language: text(form, "language") as LeadBody["language"],
    jetaFxClientId: text(form, "jetaFxClientId"),
    qualification: qualificationBody(form),
    tags: text(form, "tags"),
    notes: text(form, "notes"),
    marketingConsent: checked(form, "marketingConsent"),
    whatsappConsent: checked(form, "whatsappConsent"),
    nextFollowUpAt: text(form, "nextFollowUpAt"),
    ...(form.has("ownerId") ? { ownerId: text(form, "ownerId") } : {}),
    allowDuplicate: checked(form, "allowDuplicate"),
  };
}

export async function saveLeadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = text(form, "id");
  let created: { id: string } | null = null;
  try {
    if (id) {
      const { projectId: _ignored, ...body } = leadBody(form);
      await api(crmRoutes.update, { params: { id }, body });
    } else created = await api(crmRoutes.create, { body: leadBody(form) });
  } catch (e) {
    const s = toActionState(e, values(form, LEAD_FIELDS));
    return s.error || !s.fieldErrors ? s : { ...s, error: "Please fix the highlighted fields." };
  }
  if (created) redirect(`/leads/${created.id}?created=1`);
  refresh();
  return { ok: true, message: "Lead saved." };
}

/** The Qualification card on the lead page: only the three answers. */
export async function saveQualificationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(crmRoutes.update, { params: { id: text(form, "id") }, body: { qualification: qualificationBody(form) } }));
}

export async function quickAddLeadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const name = text(form, "name");
  try {
    await api(crmRoutes.create, {
      body: {
        projectId: text(form, "projectId"),
        name,
        phone: text(form, "phone"),
        email: text(form, "email"),
        source: text(form, "source") as LeadBody["source"],
        notes: text(form, "notes"),
        nextFollowUpAt: text(form, "nextFollowUpAt"),
        ...(form.has("ownerId") ? { ownerId: text(form, "ownerId") } : {}),
        allowDuplicate: checked(form, "allowDuplicate"),
      } satisfies LeadBody,
    });
  } catch (e) {
    return dialogError(e);
  }
  refresh();
  return { ok: true, message: `${name} added.` };
}

export async function setStageAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() =>
    api(crmRoutes.stage, {
      params: { id: text(form, "id") },
      body: {
        stage: text(form, "stage") as RouteBody<typeof crmRoutes.stage>["stage"],
        lostReason: text(form, "lostReason"),
        note: text(form, "note"),
      },
    }),
  );
}

export async function assignAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(crmRoutes.assign, { params: { id: text(form, "id") }, body: { ownerId: text(form, "ownerId") } }));
}

export async function claimAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(crmRoutes.claim, { params: { id: text(form, "id") } }));
}

export async function moveProjectAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(crmRoutes.moveProject, { params: { id: text(form, "id") }, body: { projectId: text(form, "projectId") } }));
}

/** Ticked ids, or the list's filters when "select all matching" is on. */
function bulkTarget(form: FormData): { ids?: string[]; filters?: LeadFiltersBody } | null {
  if (text(form, "scope") === "filter") {
    const q = new URLSearchParams(text(form, "filters"));
    for (const k of ["page", "pageSize", "sort", "deleted"]) q.delete(k);
    return { filters: Object.fromEntries(q) as LeadFiltersBody };
  }
  const ids = form.getAll("ids").map(String).filter(Boolean);
  return ids.length ? { ids } : null;
}

export async function bulkAssignAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const target = bulkTarget(form);
  if (!target) return { error: "Select at least one lead." };
  const owner = text(form, "ownerId");
  if (!owner) return { error: "Choose who to assign the leads to." };
  return run(() => api(crmRoutes.bulkAssign, { body: { ...target, ownerId: owner === UNASSIGN ? "" : owner } }));
}

export async function addActivityAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const r = await api(crmRoutes.activity, {
      params: { id: text(form, "id") },
      body: {
        type: text(form, "type") as RouteBody<typeof crmRoutes.activity>["type"],
        body: text(form, "body"),
        outcome: text(form, "outcome") as RouteBody<typeof crmRoutes.activity>["outcome"],
        direction: text(form, "direction") as RouteBody<typeof crmRoutes.activity>["direction"],
        nextFollowUpAt: text(form, "nextFollowUpAt"),
        nextFollowUpTitle: text(form, "nextFollowUpTitle"),
        nextFollowUpType: text(form, "nextFollowUpType") as RouteBody<typeof crmRoutes.activity>["nextFollowUpType"],
      },
    });
    refresh();
    return { ok: true, message: r.message };
  } catch (e) {
    return fail(e, values(form, ACTIVITY_FIELDS));
  }
}

export async function convertAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  let message: string;
  try {
    ({ message } = await api(crmRoutes.convert, {
      params: { id: text(form, "id") },
      body: { batchId: text(form, "batchId") || undefined, sendSetPassword: checked(form, "sendSetPassword") },
    }));
  } catch (e) {
    return dialogError(e);
  }
  refresh();
  return { ok: true, message };
}

export async function linkStudentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(crmRoutes.link, { params: { id: text(form, "id") }, body: { studentId: text(form, "studentId") } }));
}

export async function resendWelcomeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(crmRoutes.resendWelcome, { params: { id: text(form, "id") } }));
}

export async function mergeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return run(() => api(crmRoutes.merge, { params: { id: text(form, "id") }, body: { fromId: text(form, "fromId") } }));
}

export async function deleteLeadAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (text(form, "confirm").trim().toUpperCase() !== "DELETE") return { error: "Type DELETE to confirm." };
  try {
    await api(crmRoutes.deleteLead, { params: { id: text(form, "id") } });
  } catch (e) {
    return dialogError(e);
  }
  redirect("/leads?deleted=1");
}

export async function bulkDeleteLeadsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const target = bulkTarget(form);
  if (!target) return { error: "Select at least one lead." };
  if (text(form, "confirm").trim().toUpperCase() !== "DELETE") return { error: "Type DELETE to confirm." };
  let r: { deleted: number; skipped: number };
  try {
    r = await api(crmRoutes.bulkDelete, { body: target });
  } catch (e) {
    return dialogError(e);
  }
  refresh();
  const msg = `${r.deleted} lead${r.deleted === 1 ? "" : "s"} deleted.`;
  return { ok: true, message: r.skipped ? `${msg} ${r.skipped} skipped (linked to a student account or not visible to you).` : msg };
}
