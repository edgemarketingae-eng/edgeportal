import type { LeadListItem, TaskDto } from "@edge/contracts";
import { ref } from "./kit";

/** A lead in a list: what Claude needs to pick one and talk about it. */
export const leadRow = (l: LeadListItem) => ({
  id: l.id,
  name: l.name,
  phone: l.phone,
  email: l.email,
  country: l.country,
  stage: l.stage,
  temperature: l.temperature,
  source: l.source,
  project: { id: l.project.id, name: l.project.name },
  owner: ref(l.owner),
  nextFollowUpAt: l.nextFollowUpAt,
  lastActivityAt: l.lastActivityAt,
  createdAt: l.createdAt,
  tags: l.tags,
  language: l.language,
  products: l.products.map((p) => p.name),
  ...(l.lostReason ? { lostReason: l.lostReason } : {}),
  ...(l.studentId ? { studentId: l.studentId } : {}),
});

export const taskRow = (t: TaskDto) => ({
  id: t.id,
  title: t.title,
  type: t.type,
  priority: t.priority,
  status: t.status,
  dueAt: t.dueAt,
  project: { id: t.project.id, name: t.project.name },
  lead: t.leadId ? { id: t.leadId, name: t.leadName, phone: t.leadPhone } : null,
  assignee: ref(t.assignee),
  ...(t.description ? { description: t.description } : {}),
  ...(t.completedAt ? { completedAt: t.completedAt } : {}),
  ...(t.commentCount ? { comments: t.commentCount } : {}),
});
