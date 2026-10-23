import type { CrmStaffRow } from "@edge/contracts";
import { Lead, Project, Role, StaffProfile, Types } from "@edge/db";
import { isCrmPermission, isCrmRole } from "@edge/domain/auth/permissions";
import { OPEN_LEAD_STAGES } from "@edge/domain/crm/enums";
import type { Actor } from "@edge/domain/enums";
import { BusinessError, NotFoundError } from "../errors";
import { oid } from "../ids";
import { listRoles, listStaff } from "./queries";
import { createStaff, resetStaffPassword, rolesByKeys, saveRole, setStaffDisabled, updateStaff } from "./service";

/**
 * Staff and role management from inside the CRM. A CRM admin may only touch "pure CRM users"
 * (every role is a CRM role) and may only grant CRM roles, so the admin console keeps full authority.
 */

export async function assertCrmRoleKeys(keys: string[]) {
  if (!keys.length) throw new BusinessError("Choose at least one role", { roleKeys: "Choose a role" });
  const roles = await rolesByKeys(keys);
  if (!roles.every(isCrmRole)) throw new BusinessError("Only CRM roles can be assigned here", { roleKeys: "Choose CRM roles only" });
  return roles;
}

/** 404 (not 403) so console accounts cannot be enumerated from the CRM. */
export async function assertPureCrmUser(userId: string) {
  const staff = await StaffProfile.findById(oid(userId, "Staff member")).lean();
  if (!staff) throw new NotFoundError("Staff member");
  const roles = await Role.find({ _id: { $in: staff.roleIds } }).lean();
  if (!roles.length || !roles.every(isCrmRole)) throw new NotFoundError("Staff member");
  return { staff, roles };
}

async function enrich(rows: Awaited<ReturnType<typeof listStaff>>): Promise<CrmStaffRow[]> {
  const ids = rows.map((r) => new Types.ObjectId(r.id));
  const [projects, open] = await Promise.all([
    Project.find({ $or: [{ managerIds: { $in: ids } }, { memberIds: { $in: ids } }] }, { name: 1, managerIds: 1, memberIds: 1 }).lean(),
    Lead.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { ownerId: { $in: ids }, mergedIntoId: null, stage: { $in: [...OPEN_LEAD_STAGES] } } }, { $group: { _id: "$ownerId", n: { $sum: 1 } } }]),
  ]);
  const openMap = new Map(open.map((o) => [String(o._id), o.n]));
  return rows.map((r) => ({
    ...r,
    projects: projects
      .filter((p) => p.managerIds.some((x) => String(x) === r.id) || p.memberIds.some((x) => String(x) === r.id))
      .map((p) => ({ id: String(p._id), name: p.name, role: (p.managerIds.some((x) => String(x) === r.id) ? "manager" : "member") as "manager" | "member" })),
    openLeads: openMap.get(r.id) ?? 0,
  }));
}

/** Staff whose every role is a CRM role. */
export async function listCrmStaff(): Promise<CrmStaffRow[]> {
  const [rows, roles] = await Promise.all([listStaff(), Role.find().lean()]);
  const crmKeys = new Set(roles.filter(isCrmRole).map((r) => r.key));
  return enrich(rows.filter((r) => r.roles.length > 0 && r.roles.every((x) => crmKeys.has(x.key))));
}

export async function getCrmStaff(id: string): Promise<CrmStaffRow> {
  await assertPureCrmUser(id);
  const [row] = await enrich((await listStaff([new Types.ObjectId(id)])).slice(0, 1));
  if (!row) throw new NotFoundError("Staff member");
  return row;
}

export async function listCrmRoles() {
  return (await listRoles()).filter(isCrmRole);
}

export async function createCrmStaff(input: { name: string; email: string; roleKeys: string[]; title?: string; workspaceEmail?: string; projectIds?: string[] }, actor: Actor & { type: "USER" }) {
  await assertCrmRoleKeys(input.roleKeys);
  const out = await createStaff({ name: input.name, email: input.email, roleKeys: input.roleKeys, title: input.title, workspaceEmail: input.workspaceEmail }, actor);
  const projectIds = (input.projectIds ?? []).map((p) => oid(p, "Project"));
  if (projectIds.length) await Project.updateMany({ _id: { $in: projectIds }, isDefault: { $ne: true } }, { $addToSet: { memberIds: new Types.ObjectId(out.id) } });
  return out;
}

export async function updateCrmStaff(id: string, input: { name: string; roleKeys: string[]; title?: string; workspaceEmail?: string }, actor: Actor & { type: "USER" }) {
  await assertPureCrmUser(id);
  await assertCrmRoleKeys(input.roleKeys);
  await updateStaff(id, input, actor);
}

export async function setCrmStaffDisabled(id: string, disabled: boolean, actor: Actor & { type: "USER" }) {
  await assertPureCrmUser(id);
  await setStaffDisabled(id, disabled, actor);
}

export async function resetCrmStaffPassword(id: string, actor: Actor & { type: "USER" }) {
  await assertPureCrmUser(id);
  return resetStaffPassword(id, actor);
}

/** Create or edit a CRM role; non-CRM permissions are dropped, and only CRM roles may be edited here. */
export async function saveCrmRole(input: { id?: string; name: string; description?: string; permissions: string[] }, actor: Actor & { type: "USER" }) {
  const permissions = input.permissions.filter(isCrmPermission);
  if (!permissions.length) throw new BusinessError("Choose at least one CRM permission", { permissions: "Choose a permission" });
  if (input.id) {
    const role = await Role.findById(oid(input.id, "Role")).lean();
    if (!role || !isCrmRole(role)) throw new NotFoundError("Role");
  }
  return saveRole({ ...input, permissions }, actor);
}
