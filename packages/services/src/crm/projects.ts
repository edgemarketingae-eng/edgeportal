import type { ProjectDetail, ProjectDto, ProjectInput } from "@edge/contracts";
import { AuthUser, Batch, Course, CrmTask, Lead, Project, Role, StaffProfile, Types, withTx, type ProjectDoc } from "@edge/db";
import { now } from "@edge/domain/clock";
import { OPEN_LEAD_STAGES, OPEN_TASK_STATUSES, type ProjectStatus } from "@edge/domain/crm/enums";
import { startOfDubaiDay } from "@edge/domain/dates";
import type { Actor } from "@edge/domain/enums";
import { audit } from "../audit";
import { BusinessError, NotFoundError, ValidationError } from "../errors";
import { oid } from "../ids";
import { day, iso } from "../mappers";
import { notifyUser } from "../notifications/in-app";
import { actorId, leadHref, loadLead, lockLead, optId, recordActivity, tasksToDtos, userNames } from "./common";
import { listLeads, startOfDubaiMonth } from "./leads";
import { has, listCrmUsers, managesProject, projectTeam, projectsFor, type CrmScope } from "./scope";

const toDay = (s?: string) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
/** Zod-coerced optional integers arrive as unknown on the input type: accept numbers and numeric strings. */
const toInt = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim()) return Number.isFinite(Number(v)) ? Number(v) : null;
  return null;
};

async function loadProject(id: string, scope: CrmScope): Promise<ProjectDoc> {
  const p = await Project.findById(oid(id, "Project")).lean();
  if (!p || !(scope.all || p.isDefault || [...scope.managed, ...scope.member].some((x) => x.equals(p._id)))) throw new NotFoundError("Project");
  return p as ProjectDoc;
}

function assertManages(scope: CrmScope, p: ProjectDoc) {
  if (!managesProject(scope, p._id)) throw new NotFoundError("Project");
}

async function crmUserIds(ids: string[], field: string) {
  const users = await listCrmUsers();
  const set = new Set(users.map((u) => u.id));
  const out: Types.ObjectId[] = [];
  for (const id of [...new Set(ids)]) {
    if (!set.has(id)) throw new BusinessError("Choose CRM staff only", { [field]: "Not a CRM user" });
    out.push(new Types.ObjectId(id));
  }
  return out;
}

async function codeFor(name: string, given?: string) {
  const base = (given?.trim() || name).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "PROJECT";
  let code = base;
  for (let i = 2; await Project.exists({ code }); i++) code = `${base.slice(0, 26)}-${i}`;
  return code;
}

export async function projectStats(projectIds: Types.ObjectId[], at: Date) {
  const monthStart = startOfDubaiMonth(at);
  const todayStart = startOfDubaiDay(at);
  const [open, converted, overdue] = await Promise.all([
    Lead.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { projectId: { $in: projectIds }, mergedIntoId: null, stage: { $in: [...OPEN_LEAD_STAGES] } } }, { $group: { _id: "$projectId", n: { $sum: 1 } } }]),
    Lead.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { projectId: { $in: projectIds }, mergedIntoId: null, convertedAt: { $gte: monthStart } } }, { $group: { _id: "$projectId", n: { $sum: 1 } } }]),
    CrmTask.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { projectId: { $in: projectIds }, status: { $in: [...OPEN_TASK_STATUSES] }, dueAt: { $lt: todayStart } } }, { $group: { _id: "$projectId", n: { $sum: 1 } } }]),
  ]);
  const m = (rows: { _id: Types.ObjectId; n: number }[]) => new Map(rows.map((r) => [String(r._id), r.n]));
  return { open: m(open), converted: m(converted), overdue: m(overdue) };
}

async function toProjectDtos(projects: ProjectDoc[], scope: CrmScope): Promise<ProjectDto[]> {
  if (!projects.length) return [];
  const at = now();
  const [stats, names, courses, batches] = await Promise.all([
    projectStats(projects.map((p) => p._id), at),
    userNames(projects.flatMap((p) => [...p.managerIds, ...p.memberIds])),
    Course.find({ _id: { $in: projects.map((p) => p.courseId).filter(Boolean) } }, { title: 1 }).lean(),
    Batch.find({ _id: { $in: projects.map((p) => p.batchId).filter(Boolean) } }, { name: 1 }).lean(),
  ]);
  const courseMap = new Map(courses.map((c) => [String(c._id), c.title]));
  const batchMap = new Map(batches.map((b) => [String(b._id), b.name]));
  const ref = (id: Types.ObjectId) => ({ id: String(id), name: names.get(String(id)) ?? "Unknown" });
  return projects.map((p) => ({
    id: String(p._id),
    name: p.name,
    code: p.code,
    description: p.description ?? null,
    status: p.status as ProjectStatus,
    courseId: p.courseId ? String(p.courseId) : null,
    courseTitle: p.courseId ? (courseMap.get(String(p.courseId)) ?? null) : null,
    batchId: p.batchId ? String(p.batchId) : null,
    batchName: p.batchId ? (batchMap.get(String(p.batchId)) ?? null) : null,
    startDate: day(p.startDate),
    endDate: day(p.endDate),
    targetLeads: p.targetLeads ?? null,
    targetConversions: p.targetConversions ?? null,
    isDefault: !!p.isDefault,
    managers: p.managerIds.map(ref),
    members: p.memberIds.map(ref),
    stats: { openLeads: stats.open.get(String(p._id)) ?? 0, convertedMonth: stats.converted.get(String(p._id)) ?? 0, overdueTasks: stats.overdue.get(String(p._id)) ?? 0, team: new Set([...p.managerIds, ...p.memberIds].map(String)).size },
    canManage: managesProject(scope, p._id),
    createdAt: iso(p.createdAt)!,
  }));
}

export async function listProjects(scope: CrmScope, f: { status?: ProjectStatus } = {}): Promise<ProjectDto[]> {
  const projects = (await projectsFor(scope)).filter((p) => !f.status || p.status === f.status);
  return toProjectDtos(projects, scope);
}

export async function getProject(id: string, scope: CrmScope): Promise<ProjectDetail> {
  const p = await loadProject(id, scope);
  const at = now();
  const monthStart = startOfDubaiMonth(at);
  const todayStart = startOfDubaiDay(at);
  const [dto] = await toProjectDtos([p], scope);
  const teamIds = [...new Set([...p.managerIds, ...p.memberIds].map(String))].map((x) => new Types.ObjectId(x));
  const [byStage, users, staff, perOwnerOpen, perOwnerConverted, perOwnerOverdue, recent, openTasks, courses, batches, allStaff] = await Promise.all([
    Lead.aggregate<{ _id: string; n: number }>([{ $match: { projectId: p._id, mergedIntoId: null } }, { $group: { _id: "$stage", n: { $sum: 1 } } }]),
    AuthUser.find({ _id: { $in: teamIds } }, { name: 1, email: 1 }).lean(),
    StaffProfile.find({ _id: { $in: teamIds } }, { roleIds: 1 }).lean(),
    Lead.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { projectId: p._id, mergedIntoId: null, stage: { $in: [...OPEN_LEAD_STAGES] }, ownerId: { $ne: null } } }, { $group: { _id: "$ownerId", n: { $sum: 1 } } }]),
    Lead.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { projectId: p._id, mergedIntoId: null, convertedAt: { $gte: monthStart }, ownerId: { $ne: null } } }, { $group: { _id: "$ownerId", n: { $sum: 1 } } }]),
    CrmTask.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { projectId: p._id, status: { $in: [...OPEN_TASK_STATUSES] }, dueAt: { $lt: todayStart }, assigneeId: { $ne: null } } }, { $group: { _id: "$assigneeId", n: { $sum: 1 } } }]),
    listLeads({ project: String(p._id), view: "all", sort: "recent", pageSize: 10 }, scope),
    CrmTask.find({ projectId: p._id, status: { $in: [...OPEN_TASK_STATUSES] } }).sort({ dueAt: 1, order: 1 }).limit(20).lean(),
    Course.find({ isActive: true }).sort({ title: 1 }).lean(),
    Batch.find({ status: { $ne: "ARCHIVED" } }).sort({ startDate: -1 }).lean(),
    listCrmUsers(),
  ]);
  const roleIds = [...new Set(staff.flatMap((s) => s.roleIds.map(String)))].map((x) => new Types.ObjectId(x));
  const roles = new Map((await Role.find({ _id: { $in: roleIds } }, { name: 1 }).lean()).map((r) => [String(r._id), r.name]));
  const staffRoles = new Map(staff.map((s) => [String(s._id), s.roleIds.map((r) => roles.get(String(r)) ?? "").filter(Boolean)]));
  const count = (rows: { _id: Types.ObjectId; n: number }[], id: string) => rows.find((r) => String(r._id) === id)?.n ?? 0;
  const managerSet = new Set(p.managerIds.map(String));
  const team = users
    .map((u) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: (managerSet.has(String(u._id)) ? "manager" : "member") as "manager" | "member",
      roles: staffRoles.get(String(u._id)) ?? [],
      openLeads: count(perOwnerOpen, String(u._id)),
      convertedMonth: count(perOwnerConverted, String(u._id)),
      overdueTasks: count(perOwnerOverdue, String(u._id)),
    }))
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "manager" ? -1 : 1));
  return {
    project: dto!,
    byStage: Object.fromEntries(byStage.map((s) => [s._id, s.n])),
    team,
    recentLeads: recent.rows,
    openTasks: await tasksToDtos(openTasks as never),
    options: {
      courses: courses.map((c) => ({ id: String(c._id), title: c.title })),
      batches: batches.map((b) => ({ id: String(b._id), label: `${b.name} (${b.code})`, courseId: String(b.courseId) })),
      staff: allStaff,
    },
  };
}

export async function createProject(input: ProjectInput, actor: Actor & { type: "USER" }, scope: CrmScope) {
  if (!has(scope, "crm.projects.manage")) throw new NotFoundError("Project");
  const [managerIds, memberIds] = await Promise.all([crmUserIds(input.managerIds ?? [], "managerIds"), crmUserIds(input.memberIds ?? [], "memberIds")]);
  const courseId = optId(input.courseId);
  if (input.courseId && !courseId) throw new ValidationError({ courseId: "Unknown course" });
  const batchId = optId(input.batchId);
  const code = await codeFor(input.name, input.code);
  const [p] = await Project.create([
    {
      name: input.name.trim(),
      code,
      description: input.description?.trim() || null,
      status: input.status ?? "ACTIVE",
      courseId,
      batchId,
      startDate: toDay(input.startDate || undefined),
      endDate: toDay(input.endDate || undefined),
      targetLeads: toInt(input.targetLeads),
      targetConversions: toInt(input.targetConversions),
      managerIds,
      memberIds: memberIds.filter((m) => !managerIds.some((x) => x.equals(m))),
      createdById: actorId(actor),
    },
  ]);
  await audit({ actor, action: "project.create", entityType: "Project", entityId: String(p!._id), after: { name: input.name, code, managerIds: managerIds.map(String) } });
  for (const uid of [...managerIds, ...memberIds]) if (String(uid) !== actor.id) await notifyUser(String(uid), { title: `You were added to ${input.name}`, body: managerIds.some((x) => x.equals(uid)) ? "As project manager." : "As a team member.", href: `${leadHref("").replace(/\/leads\/$/, "")}/projects/${p!._id}` });
  return String(p!._id);
}

export async function updateProject(id: string, input: Partial<ProjectInput>, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const p = await loadProject(id, scope);
  assertManages(scope, p);
  const admin = has(scope, "crm.projects.manage");
  const set: Record<string, unknown> = {};
  if (input.name !== undefined) set.name = input.name.trim();
  if (input.description !== undefined) set.description = input.description.trim() || null;
  if (input.courseId !== undefined) set.courseId = optId(input.courseId);
  if (input.batchId !== undefined) set.batchId = optId(input.batchId);
  if (input.startDate !== undefined) set.startDate = toDay(input.startDate || undefined);
  if (input.endDate !== undefined) set.endDate = toDay(input.endDate || undefined);
  if (input.targetLeads !== undefined) set.targetLeads = toInt(input.targetLeads);
  if (input.targetConversions !== undefined) set.targetConversions = toInt(input.targetConversions);
  if (input.status !== undefined && input.status !== p.status) {
    if (!admin) throw new BusinessError("Only a CRM manager can change a project's status");
    if (p.isDefault && input.status !== "ACTIVE") throw new BusinessError("The default project stays active");
    set.status = input.status;
  }
  if (input.managerIds !== undefined) {
    if (!admin) throw new BusinessError("Only a CRM manager can change project managers");
    set.managerIds = await crmUserIds(input.managerIds, "managerIds");
  }
  if (input.memberIds !== undefined) set.memberIds = await crmUserIds(input.memberIds, "memberIds");
  if (!Object.keys(set).length) return;
  await Project.updateOne({ _id: p._id }, { $set: set });
  await audit({ actor, action: "project.update", entityType: "Project", entityId: id, after: set });
}

export async function setProjectMember(id: string, input: { userId: string; role: "manager" | "member" }, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const p = await loadProject(id, scope);
  assertManages(scope, p);
  if (input.role === "manager" && !has(scope, "crm.projects.manage")) throw new BusinessError("Only a CRM manager can add project managers");
  if (p.isDefault) throw new BusinessError("The default project is open to everyone; it has no team list");
  const [uid] = await crmUserIds([input.userId], "userId");
  const add = input.role === "manager" ? "managerIds" : "memberIds";
  const pull = input.role === "manager" ? "memberIds" : "managerIds";
  if (input.role === "member" && p.managerIds.some((x) => x.equals(uid!)) && !has(scope, "crm.projects.manage")) throw new BusinessError("Only a CRM manager can demote a project manager");
  await Project.updateOne({ _id: p._id }, { $addToSet: { [add]: uid }, $pull: { [pull]: uid } });
  await audit({ actor, action: "project.member", entityType: "Project", entityId: id, after: { userId: input.userId, role: input.role } });
  if (String(uid) !== actor.id) await notifyUser(String(uid), { title: `You were added to ${p.name}`, body: input.role === "manager" ? "As project manager." : "As a team member.", href: `${leadHref("").replace(/\/leads\/$/, "")}/projects/${p._id}` });
}

export async function removeProjectMember(id: string, userId: string, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const p = await loadProject(id, scope);
  assertManages(scope, p);
  const uid = oid(userId, "Staff member");
  if (p.managerIds.some((x) => x.equals(uid)) && !has(scope, "crm.projects.manage")) throw new BusinessError("Only a CRM manager can remove a project manager");
  await Project.updateOne({ _id: p._id }, { $pull: { managerIds: uid, memberIds: uid } });
  await audit({ actor, action: "project.member.remove", entityType: "Project", entityId: id, after: { userId } });
}

/** Move a lead (and its open tasks) to another project; the owner is kept only if they are on the new team. */
export async function moveLeadToProject(leadId: string, projectId: string, actor: Actor & { type: "USER" }, scope: CrmScope) {
  const lead = await loadLead(leadId, scope);
  const target = await loadProject(projectId, scope);
  if (!managesProject(scope, lead.projectId) || !managesProject(scope, target._id)) throw new NotFoundError("Project");
  if (target.status === "ARCHIVED") throw new BusinessError("That project is archived");
  if (lead.projectId.equals(target._id)) return;
  const team = await projectTeam(target);
  const keepOwner = !!lead.ownerId && (scope.all || team.some((t) => t.id === String(lead.ownerId)));
  await withTx(async () => {
    const l = await lockLead(lead._id);
    const [fromName] = await Promise.all([Project.findById(l.projectId, { name: 1 }).lean()]);
    await Lead.updateOne({ _id: l._id }, { $set: { projectId: target._id, lastActivityAt: now(), ...(keepOwner ? {} : { ownerId: null, assignedAt: null }) } });
    await CrmTask.updateMany({ leadId: l._id, status: { $in: [...OPEN_TASK_STATUSES] } }, { $set: { projectId: target._id, ...(keepOwner ? {} : { assigneeId: null }) } });
    await recordActivity(l._id, "PROJECT_CHANGED", actor, { data: { from: String(l.projectId), fromName: fromName?.name ?? null, to: String(target._id), toName: target.name, ownerKept: keepOwner } });
    await audit({ actor, action: "lead.moveProject", entityType: "Lead", entityId: leadId, before: { projectId: String(l.projectId) }, after: { projectId: String(target._id) } });
  });
}
