import type { LeadActivityDto } from "@edge/contracts";
import { ACTIVITY_LABELS, CALL_OUTCOME_LABELS, FOLLOWUP_TYPE_LABELS, LEAD_STAGE_LABELS } from "@edge/domain/crm/labels";
import { formatDateTime } from "@edge/domain/dates";

const s = (v: unknown) => (typeof v === "string" && v ? v : null);
const stage = (v: unknown) => (s(v) ? ((LEAD_STAGE_LABELS as Record<string, string>)[s(v)!] ?? s(v)) : null);

/** Title line and a short detail line for a timeline entry. */
export function describeActivity(a: LeadActivityDto): { title: string; detail: string | null } {
  const d = a.data;
  const base = ACTIVITY_LABELS[a.type] ?? a.type;
  switch (a.type) {
    case "CALL":
      return { title: `${base}${a.outcome ? `: ${(CALL_OUTCOME_LABELS as Record<string, string>)[a.outcome] ?? a.outcome}` : ""}`, detail: null };
    case "WHATSAPP":
    case "EMAIL":
      return { title: `${base}${a.direction === "IN" ? " received" : a.direction === "OUT" ? " sent" : ""}`, detail: null };
    case "STAGE_CHANGED":
      return { title: d.auto ? `Moved to ${stage(d.to)} automatically` : `${stage(d.from) ?? "?"} → ${stage(d.to) ?? "?"}`, detail: s(d.lostReason) ? `Reason: ${s(d.lostReason)}` : null };
    case "ASSIGNED":
      return { title: s(d.toName) ? `Assigned to ${s(d.toName)}` : "Unassigned", detail: s(d.fromName) ? `Previously ${s(d.fromName)}` : null };
    case "CLAIMED":
      return { title: `Claimed by ${s(d.toName) ?? "a team member"}`, detail: null };
    case "PROJECT_CHANGED":
      return { title: `Moved to ${s(d.toName) ?? "another project"}`, detail: [s(d.fromName) ? `From ${s(d.fromName)}` : null, d.ownerKept === false ? "owner unassigned" : null].filter(Boolean).join(" · ") || null };
    case "TASK_CREATED":
      return { title: `${d.auto ? "Automatic follow-up" : "Follow-up scheduled"}: ${s(d.title) ?? ""}`, detail: s(d.dueAt) ? `${(FOLLOWUP_TYPE_LABELS as Record<string, string>)[s(d.type) ?? ""] ?? ""} · due ${formatDateTime(s(d.dueAt)!)}` : null };
    case "TASK_DONE":
      return { title: `Done: ${s(d.title) ?? "follow-up"}${a.outcome ? ` · ${(CALL_OUTCOME_LABELS as Record<string, string>)[a.outcome] ?? a.outcome}` : ""}`, detail: null };
    case "TASK_CANCELLED":
      return { title: `Cancelled: ${s(d.title) ?? "follow-up"}`, detail: null };
    case "INBOUND":
      return { title: "Enquired again", detail: [s(d.page) ? `via ${s(d.page)}` : null, s(d.course) ? `course: ${s(d.course)}` : null].filter(Boolean).join(" · ") || null };
    case "CONVERTED":
      return { title: d.auto ? `Became a student (${s(d.via) ?? "portal"})` : "Converted to student", detail: s(d.batchName) ? `Enrolled in ${s(d.batchName)}` : null };
    case "LINKED":
      return { title: `Linked to student${s(d.name) ? ` ${s(d.name)}` : ""}`, detail: null };
    case "MERGED":
      return { title: `Merged in ${s(d.fromName) ?? "a duplicate"}`, detail: [s(d.fromPhone), s(d.fromEmail)].filter(Boolean).join(" · ") || null };
    case "CREATED":
    case "IMPORTED":
      return { title: base, detail: s(d.sourceDetail) };
    default:
      return { title: base, detail: null };
  }
}
