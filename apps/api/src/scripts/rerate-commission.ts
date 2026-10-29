import { AuthUser, connectDb, disconnectDb } from "@edge/db";
import { fractionToPercent } from "@edge/domain/crm/commission";
import { formatMoney } from "@edge/domain/money";
import { closeRuntime, env, rerateLaterCommission } from "@edge/services";

/**
 * One-off: re-rate later-deposit commission by month (slabs used to apply per deposit). A dry run by default: prints
 * what would change per person and month. `--apply` saves it (audited), `--all` re-rates every month instead of only
 * the ones still rated per deposit, `--from 2026-10` skips earlier months.
 *
 *   pnpm --filter @edge/api rerate-commission
 *   pnpm --filter @edge/api rerate-commission -- --apply
 */
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const all = args.includes("--all");
const fromIdx = args.indexOf("--from");
const fromMonth = fromIdx >= 0 ? args[fromIdx + 1] : undefined;
const usd = (minor: number) => formatMoney(minor, "USD");

await connectDb(env.MONGODB_URI);
try {
  const rows = await rerateLaterCommission({ apply, all, fromMonth }, { type: "SYSTEM", id: "rerate-commission" });
  const users = await AuthUser.find({ _id: { $in: [...new Set(rows.map((r) => r.creditedToId))] } }, { name: 1 }).lean();
  const name = new Map(users.map((u) => [String(u._id), u.name]));
  const changed = rows.filter((r) => r.changed);
  if (!changed.length) console.log(`[rerate-commission] ${rows.length} person-month(s) checked, nothing to change.`);
  else {
    console.table(
      changed.map((r) => ({
        person: name.get(r.creditedToId) ?? r.creditedToId,
        month: r.month,
        deposits: r.count,
        "later total": usd(r.totalMinor),
        rate: `${fractionToPercent(r.pct)}%`,
        before: usd(r.beforeMinor),
        after: usd(r.afterMinor),
        change: usd(r.afterMinor - r.beforeMinor),
      })),
    );
    const before = changed.reduce((s, r) => s + r.beforeMinor, 0);
    const after = changed.reduce((s, r) => s + r.afterMinor, 0);
    console.log(
      `[rerate-commission] ${changed.length} of ${rows.length} person-month(s) change: ${usd(before)} -> ${usd(after)} (${usd(after - before)}).`,
    );
    console.log(apply ? "[rerate-commission] Applied." : "[rerate-commission] Dry run, nothing saved. Run again with --apply to save.");
  }
} finally {
  await closeRuntime();
  await disconnectDb();
}
