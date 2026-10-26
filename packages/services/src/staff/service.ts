import { randomBytes } from "node:crypto";
import { AuthAccount, AuthSession, AuthUser, Role, StaffProfile, Types, withTx } from "@edge/db";
import type { Actor } from "@edge/domain/enums";
import { isCrmRole, isPermission } from "@edge/domain/auth/permissions";
import { hashPassword } from "better-auth/crypto";
import { audit } from "../audit";
import { env } from "../env";
import { BusinessError, NotFoundError } from "../errors";
import { oid } from "../ids";
import { queueEmail } from "../notifications/email";
import { normalizePhone } from "../crm/common";
import { flushOutbox } from "../runtime";
import { invalidateRoleCache } from "../auth/viewer";
import { encryptTempPassword } from "./temp-password";

/** Readable temporary password, e.g. "Edge-k7Qm-4tXp-9Lw2". */
export function tempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const chars = [...randomBytes(12)].map((b) => alphabet[b % alphabet.length]).join("");
  return `Edge-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

/** Pure-CRM staff sign in at the CRM; everyone else at the staff console. */
export function loginUrlFor(roles: { permissions?: string[] | null }[]) {
  return `${roles.length && roles.every(isCrmRole) ? env.CRM_APP_URL : env.CONSOLE_APP_URL}/login`;
}

export async function rolesByKeys(keys: string[]) {
  const roles = await Role.find({ key: { $in: keys } }).lean();
  if (roles.length !== keys.length) throw new BusinessError("Unknown role selected");
  return roles;
}

async function isSuperAdmin(userId: string) {
  const staff = await StaffProfile.findById(oid(userId)).lean();
  if (!staff) return false;
  return !!(await Role.exists({ _id: { $in: staff.roleIds }, key: "super_admin" }));
}

/**
 * Writes Better Auth's user + credential account documents directly, in exactly the shape its
 * MongoDB adapter produces (ObjectId _id/userId, accountId = user id hex string).
 */
export async function createUserWithPasswordHash(input: {
  name: string;
  email: string;
  passwordHash: string;
  mustChangePassword?: boolean;
  emailVerified?: boolean;
}) {
  const _id = new Types.ObjectId();
  const at = new Date();
  await AuthUser.create([
    {
      _id,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      emailVerified: input.emailVerified ?? true,
      image: null,
      phoneNumber: null,
      phoneNumberVerified: false,
      twoFactorEnabled: false,
      mustChangePassword: !!input.mustChangePassword,
      disabledAt: null,
      createdAt: at,
      updatedAt: at,
    },
  ]);
  await AuthAccount.create([
    { accountId: _id.toHexString(), providerId: "credential", userId: _id, password: input.passwordHash, createdAt: at, updatedAt: at },
  ]);
  return _id;
}

export async function createUserWithPassword(input: {
  name: string;
  email: string;
  password: string;
  mustChangePassword: boolean;
  emailVerified?: boolean;
}) {
  return createUserWithPasswordHash({ ...input, passwordHash: await hashPassword(input.password) });
}

export async function createStaff(
  input: { name: string; email: string; roleKeys: string[]; title?: string; workspaceEmail?: string; phone?: string; password?: string },
  actor: Actor,
) {
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone);
  if (await AuthUser.exists({ email })) throw new BusinessError("A user with this email already exists", { email: "Already in use" });
  if (!input.roleKeys.length) throw new BusinessError("Choose at least one role");
  const roles = await rolesByKeys(input.roleKeys);
  if (roles.some((r) => r.key === "super_admin") && actor.type === "USER" && !(await isSuperAdmin(actor.id))) {
    throw new BusinessError("Only a super admin can create another super admin");
  }
  const password = input.password ?? tempPassword();
  const tempPasswordEnc = input.password ? null : await encryptTempPassword(password);
  const id = await withTx(async () => {
    const userId = await createUserWithPassword({ name: input.name, email, password, mustChangePassword: !input.password });
    await StaffProfile.create([
      {
        _id: userId,
        title: input.title || null,
        workspaceEmail: input.workspaceEmail?.trim().toLowerCase() || null,
        phone,
        roleIds: roles.map((r) => r._id),
        tempPasswordEnc,
      },
    ]);
    await audit({ actor, action: "staff.create", entityType: "User", entityId: String(userId), after: { email, roles: input.roleKeys } });
    if (!input.password) {
      await queueEmail({
        to: email,
        userId: String(userId),
        template: "auth.staffWelcome",
        data: { name: input.name, email, tempPassword: password, loginUrl: loginUrlFor(roles) },
      });
    }
    return userId;
  });
  await flushOutbox();
  return { id: String(id), tempPassword: input.password ? undefined : password };
}

export async function updateStaff(
  userId: string,
  input: { name: string; roleKeys: string[]; title?: string; workspaceEmail?: string; phone?: string },
  actor: Actor & { type: "USER" },
) {
  const _id = oid(userId, "Staff member");
  const phone = normalizePhone(input.phone);
  if (!input.roleKeys.length) throw new BusinessError("Choose at least one role");
  const roles = await rolesByKeys(input.roleKeys);
  const staff = await StaffProfile.findById(_id).lean();
  if (!staff) throw new NotFoundError("Staff member");
  const current = await Role.find({ _id: { $in: staff.roleIds } }).lean();
  const hadSuper = current.some((r) => r.key === "super_admin");
  const willSuper = roles.some((r) => r.key === "super_admin");
  if (hadSuper !== willSuper && !(await isSuperAdmin(actor.id)))
    throw new BusinessError("Only a super admin can grant or remove super admin");
  if (userId === actor.id && hadSuper && !willSuper) throw new BusinessError("You cannot remove your own super admin role");
  await withTx(async () => {
    await AuthUser.updateOne({ _id }, { $set: { name: input.name.trim(), updatedAt: new Date() } });
    await StaffProfile.updateOne(
      { _id },
      {
        $set: {
          title: input.title || null,
          workspaceEmail: input.workspaceEmail?.trim().toLowerCase() || null,
          // Omitted keeps the saved number; an empty string clears it.
          ...(input.phone === undefined ? {} : { phone }),
          roleIds: roles.map((r) => r._id),
        },
      },
    );
    await audit({
      actor,
      action: "staff.update",
      entityType: "User",
      entityId: userId,
      before: { roles: current.map((r) => r.key), phone: staff.phone ?? null },
      after: { roles: input.roleKeys, title: input.title, phone: input.phone === undefined ? (staff.phone ?? null) : phone },
    });
  });
}

export async function setStaffDisabled(userId: string, disabled: boolean, actor: Actor & { type: "USER" }) {
  if (userId === actor.id) throw new BusinessError("You cannot disable your own account");
  const _id = oid(userId, "Staff member");
  await withTx(async () => {
    await AuthUser.updateOne({ _id }, { $set: { disabledAt: disabled ? new Date() : null } });
    if (disabled) await AuthSession.deleteMany({ userId: _id });
    await audit({ actor, action: disabled ? "staff.disable" : "staff.enable", entityType: "User", entityId: userId });
  });
}

export async function resetStaffPassword(userId: string, actor: Actor & { type: "USER" }) {
  const _id = oid(userId, "Staff member");
  const user = await AuthUser.findById(_id).lean();
  if (!user) throw new NotFoundError("Staff member");
  const profile = await StaffProfile.findById(_id).lean();
  const roles = await Role.find({ _id: { $in: profile?.roleIds ?? [] } }).lean();
  const password = tempPassword();
  const hash = await hashPassword(password);
  const tempPasswordEnc = await encryptTempPassword(password);
  await withTx(async () => {
    const acc = await AuthAccount.findOne({ userId: _id, providerId: "credential" }).lean();
    if (acc) await AuthAccount.updateOne({ _id: acc._id }, { $set: { password: hash, updatedAt: new Date() } });
    else
      await AuthAccount.create([
        {
          accountId: _id.toHexString(),
          providerId: "credential",
          userId: _id,
          password: hash,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    await AuthUser.updateOne({ _id }, { $set: { mustChangePassword: true } });
    await StaffProfile.updateOne({ _id }, { $set: { tempPasswordEnc } });
    await AuthSession.deleteMany({ userId: _id });
    await audit({ actor, action: "staff.resetPassword", entityType: "User", entityId: userId });
    await queueEmail({
      to: user.email,
      userId,
      template: "auth.staffWelcome",
      data: { name: user.name, email: user.email, tempPassword: password, loginUrl: loginUrlFor(roles) },
    });
  });
  await flushOutbox();
  return password;
}

export async function saveRole(
  input: { id?: string; name: string; description?: string; permissions: string[] },
  actor: Actor & { type: "USER" },
) {
  const permissions = input.permissions.filter(isPermission);
  if (input.id) {
    const role = await Role.findById(oid(input.id, "Role")).lean();
    if (!role) throw new NotFoundError("Role");
    if (role.key === "super_admin") throw new BusinessError("The super admin role always has every permission");
    await Role.updateOne({ _id: role._id }, { $set: { name: input.name, description: input.description || null, permissions } });
    await audit({
      actor,
      action: "role.update",
      entityType: "Role",
      entityId: input.id,
      before: { permissions: role.permissions },
      after: { permissions },
    });
    invalidateRoleCache();
    return input.id;
  }
  const key = input.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  if (!key) throw new BusinessError("Enter a role name");
  if (await Role.exists({ key })) throw new BusinessError("A role with this name already exists");
  const [role] = await Role.create([{ key, name: input.name, description: input.description || null, permissions }]);
  await audit({ actor, action: "role.create", entityType: "Role", entityId: String(role!._id), after: { key, permissions } });
  invalidateRoleCache();
  return String(role!._id);
}
