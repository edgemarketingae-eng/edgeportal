import { AuthUser, Lead, Role, StaffProfile, Types, type ProjectDoc } from "@edge/db";
import { OPEN_LEAD_STAGES } from "@edge/domain/crm/enums";

/** The role whose holders receive round-robin leads. */
const SALES_EXECUTIVE = "sales_executive";

/**
 * Active people with the sales executive role on a project's team. The default (General) project is open to
 * everyone, so there it is every active sales executive.
 */
export async function salesExecutivesFor(
  project: Pick<ProjectDoc, "_id" | "isDefault" | "managerIds" | "memberIds">,
  opts: { withPhone?: boolean } = {},
): Promise<{ id: string; name: string }[]> {
  const role = await Role.findOne({ key: SALES_EXECUTIVE }, { _id: 1 }).lean();
  if (!role) return [];
  const team = project.isDefault ? null : [...project.managerIds, ...project.memberIds];
  if (team && !team.length) return [];
  const staff = await StaffProfile.find(
    {
      roleIds: role._id,
      available: { $ne: false },
      ...(team ? { _id: { $in: team } } : {}),
      ...(opts.withPhone ? { phone: { $nin: [null, ""] } } : {}),
    },
    { _id: 1 },
  ).lean();
  if (!staff.length) return [];
  const users = await AuthUser.find({ _id: { $in: staff.map((x) => x._id) }, disabledAt: null }, { name: 1 })
    .sort({ name: 1 })
    .lean();
  return users.map((u) => ({ id: String(u._id), name: u.name }));
}

/**
 * Hands out a project's sales executives one lead at a time, always to whoever holds the fewest open leads in
 * that project, counting what this batch has already handed out. A batch spreads evenly and stays fair with the
 * existing load. `next()` is null when the project has no sales executives. `withPhone` limits it to people
 * with a saved phone (leads that are handed straight to a WhatsApp chat).
 */
export async function roundRobinPicker(
  project: Pick<ProjectDoc, "_id" | "isDefault" | "managerIds" | "memberIds">,
  opts: { withPhone?: boolean } = {},
) {
  const execs = await salesExecutivesFor(project, opts);
  const counts = execs.length
    ? await Lead.aggregate<{ _id: Types.ObjectId; n: number }>([
        {
          $match: {
            projectId: project._id,
            mergedIntoId: null,
            stage: { $in: [...OPEN_LEAD_STAGES] },
            ownerId: { $in: execs.map((e) => new Types.ObjectId(e.id)) },
          },
        },
        { $group: { _id: "$ownerId", n: { $sum: 1 } } },
      ])
    : [];
  const load = new Map(execs.map((e) => [e.id, 0]));
  for (const c of counts) load.set(String(c._id), c.n);
  return {
    size: execs.length,
    next(): string | null {
      let best: string | null = null;
      for (const e of execs) if (best === null || load.get(e.id)! < load.get(best)!) best = e.id;
      if (best) load.set(best, load.get(best)! + 1);
      return best;
    },
  };
}

/** Can a lead be handed straight to this person's WhatsApp: an active account, not Off, with a phone. */
export async function reachableExec(userId: string | Types.ObjectId | null | undefined) {
  if (!userId) return null;
  const _id = new Types.ObjectId(String(userId));
  const [profile, user] = await Promise.all([
    StaffProfile.findById(_id, { phone: 1, available: 1 }).lean(),
    AuthUser.findById(_id, { name: 1, disabledAt: 1 }).lean(),
  ]);
  if (!profile?.phone || profile.available === false || !user || user.disabledAt) return null;
  return { id: String(_id), name: user.name, phone: profile.phone };
}
