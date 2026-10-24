import { AuthSession, AuthUser, Role, StaffProfile, Types } from "@edge/db";
import { NotFoundError } from "../errors";
import { iso } from "../mappers";
import { decryptTempPassword } from "./temp-password";

export async function listStaff(ids?: Types.ObjectId[]) {
  const staff = await StaffProfile.find(ids ? { _id: { $in: ids } } : {}).lean();
  const sids = staff.map((s) => s._id);
  const [users, roles, sessions] = await Promise.all([
    AuthUser.find({ _id: { $in: sids } }).lean(),
    Role.find().lean(),
    AuthSession.aggregate<{ _id: Types.ObjectId; last: Date }>([
      { $match: { userId: { $in: sids } } },
      { $group: { _id: "$userId", last: { $max: "$createdAt" } } },
    ]),
  ]);
  const roleById = new Map(roles.map((r) => [String(r._id), r]));
  const last = new Map(sessions.map((s) => [String(s._id), s.last]));
  const profile = new Map(staff.map((s) => [String(s._id), s]));
  const rows = await Promise.all(
    users.map(async (u) => {
      const p = profile.get(String(u._id))!;
      return {
        id: String(u._id),
        name: u.name,
        email: u.email,
        title: p.title ?? null,
        workspaceEmail: p.workspaceEmail ?? null,
        roles: (p.roleIds ?? [])
          .map((r) => roleById.get(String(r)))
          .filter(Boolean)
          .map((r) => ({ key: r!.key, name: r!.name })),
        disabled: !!u.disabledAt,
        invited: !!u.mustChangePassword,
        tempPassword: u.mustChangePassword ? await decryptTempPassword(p.tempPasswordEnc) : null,
        lastSignInAt: iso(last.get(String(u._id))),
      };
    }),
  );
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getStaff(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError("Staff member");
  const [row] = await listStaff([new Types.ObjectId(id)]);
  if (!row) throw new NotFoundError("Staff member");
  return row;
}

export async function listRoles() {
  const [roles, counts] = await Promise.all([
    Role.find().sort({ name: 1 }).lean(),
    StaffProfile.aggregate<{ _id: Types.ObjectId; n: number }>([{ $unwind: "$roleIds" }, { $group: { _id: "$roleIds", n: { $sum: 1 } } }]),
  ]);
  const c = new Map(counts.map((x) => [String(x._id), x.n]));
  return roles.map((r) => ({
    id: String(r._id),
    key: r.key,
    name: r.name,
    description: r.description ?? null,
    permissions: r.permissions ?? [],
    isSystem: !!r.isSystem,
    members: c.get(String(r._id)) ?? 0,
  }));
}
