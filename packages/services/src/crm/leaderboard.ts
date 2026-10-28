import type { LeaderboardDto, LeaderboardRow } from "@edge/contracts";
import { AuthUser, CrmProduct, Lead, LeadConversion, LeadDeposit, Role, StaffProfile, Types } from "@edge/db";
import { now } from "@edge/domain/clock";
import type { LeaderboardPeriod } from "@edge/domain/crm/enums";
import { between, optId, periodRange, userNames } from "./common";
import { has, type CrmScope } from "./scope";

/** Active people holding the sales executive role (Off or not): they are always on the board, even at zero. */
async function salesExecutiveIds() {
  const role = await Role.findOne({ key: "sales_executive" }, { _id: 1 }).lean();
  if (!role) return [];
  const staff = await StaffProfile.find({ roleIds: role._id }, { _id: 1 }).lean();
  const users = await AuthUser.find({ _id: { $in: staff.map((s) => s._id) }, disabledAt: null }, { _id: 1 }).lean();
  return users.map((u) => String(u._id));
}

/**
 * Sales ranking for a period (Dubai calendar), everyone across every project unless one is chosen. Ranked by product
 * conversions credited to the person, then verified deposit volume. Commission is only included for commission managers;
 * everyone sees their own in `me`.
 */
export async function getLeaderboard(q: { period?: LeaderboardPeriod; project?: string }, scope: CrmScope): Promise<LeaderboardDto> {
  const period = q.period ?? "month";
  const range = periodRange(period, now());
  const projectId = optId(q.project);
  const inProject = projectId ? { projectId } : {};
  const convertedAt = between(range.from, range.to);
  const createdAt = between(range.from, range.to);
  const depositedAt = between(range.fromDay, range.toDay);

  const [conversions, newLeads, deposits, pending, execs, products] = await Promise.all([
    LeadConversion.aggregate<{ _id: { c: Types.ObjectId; p: Types.ObjectId }; n: number }>([
      { $match: { creditedToId: { $ne: null }, ...inProject, ...(convertedAt ? { convertedAt } : {}) } },
      { $group: { _id: { c: "$creditedToId", p: "$productId" }, n: { $sum: 1 } } },
    ]),
    Lead.aggregate<{ _id: Types.ObjectId; n: number; converted: number }>([
      { $match: { mergedIntoId: null, ownerId: { $ne: null }, ...inProject, ...(createdAt ? { createdAt } : {}) } },
      {
        $group: {
          _id: "$ownerId",
          n: { $sum: 1 },
          converted: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$convertedAt", null] }, null] }, 1, 0] } },
        },
      },
    ]),
    LeadDeposit.aggregate<{ _id: Types.ObjectId; amount: number; commission: number }>([
      { $match: { status: "VERIFIED", ...inProject, ...(depositedAt ? { depositedAt } : {}) } },
      { $group: { _id: "$creditedToId", amount: { $sum: "$amountMinor" }, commission: { $sum: { $ifNull: ["$commissionMinor", 0] } } } },
    ]),
    LeadDeposit.aggregate<{ _id: null; n: number; amount: number }>([
      { $match: { status: "PENDING", creditedToId: scope.me, ...inProject, ...(depositedAt ? { depositedAt } : {}) } },
      { $group: { _id: null, n: { $sum: 1 }, amount: { $sum: "$amountMinor" } } },
    ]),
    salesExecutiveIds(),
    CrmProduct.find({}, { name: 1, status: 1 }).sort({ sortOrder: 1, name: 1 }).lean(),
  ]);

  const byPerson = new Map<string, { conversions: number; byProduct: Record<string, number> }>();
  for (const c of conversions) {
    const k = String(c._id.c);
    const row = byPerson.get(k) ?? { conversions: 0, byProduct: {} };
    row.conversions += c.n;
    row.byProduct[String(c._id.p)] = (row.byProduct[String(c._id.p)] ?? 0) + c.n;
    byPerson.set(k, row);
  }
  const leadsBy = new Map(newLeads.map((l) => [String(l._id), l]));
  const depositsBy = new Map(deposits.map((d) => [String(d._id), d]));
  // Sales executives always appear; anyone else (managers, admins) only once they have a conversion in the period.
  const ids = [...new Set([...execs, ...byPerson.keys()])];
  const names = await userNames(ids);
  const showCommission = has(scope, "crm.commission.manage");
  const rows: LeaderboardRow[] = ids
    .filter((id) => names.has(id))
    .map((id) => {
      const c = byPerson.get(id);
      const l = leadsBy.get(id);
      const d = depositsBy.get(id);
      return {
        rank: 0,
        id,
        name: names.get(id)!,
        conversions: c?.conversions ?? 0,
        byProduct: c?.byProduct ?? {},
        newLeads: l?.n ?? 0,
        convertedLeads: l?.converted ?? 0,
        conversionRate: l?.n ? Math.round((l.converted / l.n) * 100) : null,
        depositsMinor: d?.amount ?? 0,
        commissionMinor: showCommission ? (d?.commission ?? 0) : null,
        isMe: id === scope.userId,
      };
    })
    .sort((a, b) => b.conversions - a.conversions || b.depositsMinor - a.depositsMinor || a.name.localeCompare(b.name));
  // Equal conversions and deposits share a rank (1, 2, 2, 4).
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.conversions === r.conversions && prev.depositsMinor === r.depositsMinor ? prev.rank : i + 1;
  });

  const used = new Set(conversions.map((c) => String(c._id.p)));
  const mine = byPerson.get(scope.userId);
  const myDeposits = depositsBy.get(scope.userId);
  return {
    period,
    products: products.filter((p) => p.status === "ACTIVE" || used.has(String(p._id))).map((p) => ({ id: String(p._id), name: p.name })),
    rows,
    showCommission,
    me: {
      conversions: mine?.conversions ?? 0,
      depositsMinor: myDeposits?.amount ?? 0,
      commissionMinor: myDeposits?.commission ?? 0,
      pendingCount: pending[0]?.n ?? 0,
      pendingMinor: pending[0]?.amount ?? 0,
    },
  };
}
