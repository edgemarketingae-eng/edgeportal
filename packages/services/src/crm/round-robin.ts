import { AuthUser, Project, Role, StaffProfile, Types, type ProjectDoc } from "@edge/db";
import type { ContactChannel } from "@edge/domain/crm/enums";

/** The role whose holders receive round-robin leads. */
const SALES_EXECUTIVE = "sales_executive";

/** Staff who can be chatted with on their current channel: a phone for WhatsApp, a username for Telegram. */
const HAS_CONTACT = {
  $or: [
    { contactChannel: "TELEGRAM" as const, telegramUsername: { $nin: [null, ""] } },
    { contactChannel: { $ne: "TELEGRAM" as const }, phone: { $nin: [null, ""] } },
  ],
};

/**
 * Active people with the sales executive role on a project's team. The default (General) project is open to
 * everyone, so there it is every active sales executive.
 */
export async function salesExecutivesFor(
  project: Pick<ProjectDoc, "_id" | "isDefault" | "managerIds" | "memberIds">,
  opts: { withContact?: boolean } = {},
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
      ...(opts.withContact ? HAS_CONTACT : {}),
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
 * Gives a project's sales executives one lead each in turn, however many leads they already hold. The turn is saved
 * on the project in user id order, so it carries on across batches, restarts and every intake path, and it survives
 * the last person going Off or leaving the team. Each `next()` is one atomic update, so leads arriving together get
 * different people. `next()` is null when the project has no sales executives. `withContact` limits it to people
 * who can be chatted with on their channel (leads that are handed straight to a WhatsApp or Telegram chat).
 */
export async function roundRobinPicker(
  project: Pick<ProjectDoc, "_id" | "isDefault" | "managerIds" | "memberIds">,
  opts: { withContact?: boolean } = {},
) {
  const execs = await salesExecutivesFor(project, opts);
  const ids = execs
    .map((e) => e.id)
    .sort()
    .map((id) => new Types.ObjectId(id));
  return {
    size: ids.length,
    async next(): Promise<string | null> {
      if (!ids.length) return null;
      const after = { $filter: { input: ids, cond: { $gt: ["$$this", "$roundRobinLastId"] } } };
      const updated = await Project.findByIdAndUpdate(
        project._id,
        [{ $set: { roundRobinLastId: { $ifNull: [{ $first: after }, ids[0]] } } }],
        { updatePipeline: true, timestamps: false, returnDocument: "after", projection: { roundRobinLastId: 1 } },
      ).lean();
      return updated?.roundRobinLastId ? String(updated.roundRobinLastId) : null;
    },
  };
}

/**
 * Can a lead be handed straight to this person's chat: an active account, not Off, with a phone (WhatsApp) or
 * a username (Telegram) for their current channel. `handle` is that phone or username.
 */
export async function reachableExec(
  userId: string | Types.ObjectId | null | undefined,
): Promise<{ id: string; name: string; channel: ContactChannel; handle: string } | null> {
  if (!userId) return null;
  const _id = new Types.ObjectId(String(userId));
  const [profile, user] = await Promise.all([
    StaffProfile.findById(_id, { phone: 1, telegramUsername: 1, contactChannel: 1, available: 1 }).lean(),
    AuthUser.findById(_id, { name: 1, disabledAt: 1 }).lean(),
  ]);
  if (!profile || profile.available === false || !user || user.disabledAt) return null;
  const channel: ContactChannel = profile.contactChannel === "TELEGRAM" ? "TELEGRAM" : "WHATSAPP";
  const handle = channel === "TELEGRAM" ? profile.telegramUsername : profile.phone;
  return handle ? { id: String(_id), name: user.name, channel, handle } : null;
}
