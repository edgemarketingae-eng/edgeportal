import { AuthUser, InAppNotification, Project, Role, StaffProfile, Types, type CrmTaskDoc, type LeadDoc, type ProjectDoc } from "@edge/db";
import type { Permission } from "@edge/domain/auth/permissions";
import { BusinessError, ForbiddenError, NotFoundError } from "../errors";

/**
 * What one CRM user may see and do, derived from permissions and project membership.
 * Loaded once per API request (apps/api/src/routes/crm.ts) and passed to every service.
 */
export interface CrmScope {
  userId: string;
  me: Types.ObjectId;
  permissions: Set<Permission>;
  /** crm.all: every project and lead. */
  all: boolean;
  /** Projects where the user is a manager (sees and assigns everything inside). */
  managed: Types.ObjectId[];
  /** Projects where the user is a member (own leads + the unassigned pool). */
  member: Types.ObjectId[];
  /** The default project is open to every CRM user. */
  defaultProjectId: Types.ObjectId;
}

export async function getDefaultProject(): Promise<ProjectDoc> {
  const p = await Project.findOne({ isDefault: true }).lean();
  if (!p) throw new Error("The default CRM project is missing: run `pnpm --filter @edge/api migrate`");
  return p as ProjectDoc;
}

export async function loadCrmScope(v: { userId: string; permissions: Set<Permission> }): Promise<CrmScope> {
  const me = new Types.ObjectId(v.userId);
  const all = v.permissions.has("crm.all");
  const [projects, def] = await Promise.all([
    all ? [] : Project.find({ $or: [{ managerIds: me }, { memberIds: me }] }, { managerIds: 1 }).lean(),
    getDefaultProject(),
  ]);
  const isManager = (p: { managerIds: Types.ObjectId[] }) => p.managerIds.some((x) => x.equals(me));
  return {
    userId: v.userId,
    me,
    permissions: v.permissions,
    all,
    managed: projects.filter(isManager).map((p) => p._id),
    member: projects.filter((p) => !isManager(p)).map((p) => p._id),
    defaultProjectId: def._id,
  };
}

export const has = (s: CrmScope, p: Permission) => s.permissions.has(p);

export function managesProject(s: CrmScope, projectId: Types.ObjectId) {
  return s.all || s.managed.some((x) => x.equals(projectId));
}

/**
 * Move a lead to another project: a manager of its project (or crm.all), or the person who owns it. The target can be
 * any project the mover is part of (see `moveLeadToProject`).
 */
export function canMoveLead(lead: Pick<LeadDoc, "projectId" | "ownerId">, s: CrmScope) {
  return managesProject(s, lead.projectId) || (!!lead.ownerId && lead.ownerId.equals(s.me));
}

/** Member, manager, or the default project (open to everyone). */
export function inProject(s: CrmScope, projectId: Types.ObjectId) {
  return managesProject(s, projectId) || projectId.equals(s.defaultProjectId) || s.member.some((x) => x.equals(projectId));
}

/** Mongo filter to AND into every lead query. */
export function leadScopeFilter(s: CrmScope): Record<string, unknown> {
  if (s.all) return {};
  const or: Record<string, unknown>[] = [{ ownerId: s.me }, { projectId: { $in: [...s.member, s.defaultProjectId] }, ownerId: null }];
  if (s.managed.length) or.push({ projectId: { $in: s.managed } });
  return { $or: or };
}

/** Mongo filter to AND into every task query. */
export function taskScopeFilter(s: CrmScope): Record<string, unknown> {
  if (s.all) return {};
  const or: Record<string, unknown>[] = [{ assigneeId: s.me }, { createdById: s.me }];
  if (s.managed.length) or.push({ projectId: { $in: s.managed } });
  return { $or: or };
}

export function canSeeLead(lead: Pick<LeadDoc, "projectId" | "ownerId">, s: CrmScope) {
  return (
    s.all ||
    (!!lead.ownerId && lead.ownerId.equals(s.me)) ||
    managesProject(s, lead.projectId) ||
    (!lead.ownerId && inProject(s, lead.projectId))
  );
}

/** 404 (not 403) for a lead outside the viewer's scope, so ids never leak. */
export function assertLeadVisible(lead: Pick<LeadDoc, "projectId" | "ownerId">, s: CrmScope) {
  if (!canSeeLead(lead, s)) throw new NotFoundError("Lead");
}

export function canSeeTask(task: Pick<CrmTaskDoc, "projectId" | "assigneeId" | "createdById">, s: CrmScope) {
  return s.all || !!task.assigneeId?.equals(s.me) || !!task.createdById?.equals(s.me) || managesProject(s, task.projectId);
}

/** An unassigned, still-open lead in one of the viewer's projects may be claimed by them. */
export function canClaim(lead: Pick<LeadDoc, "projectId" | "ownerId" | "stage" | "mergedIntoId">, s: CrmScope) {
  return has(s, "crm.write") && !lead.ownerId && !lead.mergedIntoId && lead.stage !== "CONVERTED" && inProject(s, lead.projectId);
}

/** May hand leads/tasks in this project to other people. */
export function canAssignIn(s: CrmScope, projectId: Types.ObjectId) {
  return has(s, "crm.assign") && managesProject(s, projectId);
}

/** Active staff whose roles grant crm.access, with their role names (for pickers). */
export async function listCrmUsers(): Promise<{ id: string; name: string; roles: string[]; available: boolean }[]> {
  const roles = await Role.find({}, { name: 1, permissions: 1 }).lean();
  const crmRoleIds = roles.filter((r) => r.permissions?.includes("crm.access")).map((r) => r._id);
  if (!crmRoleIds.length) return [];
  const roleName = new Map(roles.map((r) => [String(r._id), r.name]));
  const staff = await StaffProfile.find({ roleIds: { $in: crmRoleIds } }, { _id: 1, roleIds: 1, available: 1 }).lean();
  const off = new Set(staff.filter((x) => x.available === false).map((x) => String(x._id)));
  const rolesOf = new Map(
    staff.map((x) => [String(x._id), (x.roleIds ?? []).map((r) => roleName.get(String(r))).filter((n): n is string => !!n)]),
  );
  const users = await AuthUser.find({ _id: { $in: staff.map((x) => x._id) }, disabledAt: null }, { name: 1 })
    .sort({ name: 1 })
    .lean();
  return users.map((u) => ({
    id: String(u._id),
    name: u.name,
    roles: rolesOf.get(String(u._id)) ?? [],
    available: !off.has(String(u._id)),
  }));
}

/** Managers and members of a project (every CRM user for the default project), active accounts only. */
export async function projectTeam(project: ProjectDoc | Types.ObjectId): Promise<{ id: string; name: string; available?: boolean }[]> {
  const p = project instanceof Types.ObjectId ? await Project.findById(project).lean() : project;
  if (!p) return [];
  if (p.isDefault) return listCrmUsers();
  const ids = [...new Set([...p.managerIds, ...p.memberIds].map(String))].map((x) => new Types.ObjectId(x));
  if (!ids.length) return [];
  const [users, off] = await Promise.all([
    AuthUser.find({ _id: { $in: ids }, disabledAt: null }, { name: 1 })
      .sort({ name: 1 })
      .lean(),
    StaffProfile.find({ _id: { $in: ids }, available: false }, { _id: 1 }).lean(),
  ]);
  const offIds = new Set(off.map((x) => String(x._id)));
  return users.map((u) => ({ id: String(u._id), name: u.name, available: !offIds.has(String(u._id)) }));
}

/** Resolve an owner/assignee for a project: yourself is always fine inside your projects; others need crm.assign in a managed project and must be on the team. */
export async function assertAssignable(s: CrmScope, projectId: Types.ObjectId, userId: string, field = "ownerId"): Promise<Types.ObjectId> {
  if (!Types.ObjectId.isValid(userId) || userId.length !== 24) throw new BusinessError("Choose a team member", { [field]: "Unknown user" });
  if (userId === s.userId) {
    if (!inProject(s, projectId)) throw new NotFoundError("Project");
    return s.me;
  }
  if (!canAssignIn(s, projectId)) throw new ForbiddenError("You can only assign work within projects you manage.");
  const team = s.all ? await listCrmUsers() : await projectTeam(projectId);
  if (!team.some((t) => t.id === userId))
    throw new BusinessError("That person is not on this project's team", { [field]: "Not on the project team" });
  return new Types.ObjectId(userId);
}

/** Projects the viewer can see (and create leads in when ACTIVE). */
export async function projectsFor(s: CrmScope): Promise<ProjectDoc[]> {
  const filter = s.all ? {} : { _id: { $in: [...s.managed, ...s.member, s.defaultProjectId] } };
  return (await Project.find(filter).sort({ isDefault: -1, name: 1 }).lean()) as ProjectDoc[];
}

/** In-app note for a project's managers; projects without managers fall back to everyone with crm.all. */
export async function notifyProjectManagers(projectId: Types.ObjectId, n: { title: string; body: string; href?: string }) {
  const p = await Project.findById(projectId, { managerIds: 1 }).lean();
  let ids: Types.ObjectId[] = p?.managerIds ?? [];
  if (!ids.length) {
    const roleIds = (await Role.find({ permissions: "crm.all" }, { _id: 1 }).lean()).map((r) => r._id);
    ids = (await StaffProfile.find({ roleIds: { $in: roleIds } }, { _id: 1 }).lean()).map((x) => x._id);
  }
  const active = await AuthUser.find({ _id: { $in: ids }, disabledAt: null }, { _id: 1 }).lean();
  if (!active.length) return 0;
  await InAppNotification.create(active.map((u) => ({ userId: u._id, title: n.title, body: n.body, href: n.href ?? null })));
  return active.length;
}
