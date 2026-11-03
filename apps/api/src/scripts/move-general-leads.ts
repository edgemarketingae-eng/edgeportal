import { connectDb, disconnectDb } from "@edge/db";
import { closeRuntime, env, moveDefaultProjectLeads } from "@edge/services";

/**
 * One-off: move every lead in the General project to FREE-COURSE-MAL (or `--to CODE`), keeping owners and open tasks.
 * A dry run by default: prints how many leads move, per owner. `--apply` moves them (timeline entry on each, audited).
 *
 *   pnpm --filter @edge/api move-general-leads
 *   pnpm --filter @edge/api move-general-leads -- --apply
 */
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const toIdx = args.indexOf("--to");
const to = toIdx >= 0 ? args[toIdx + 1]! : "FREE-COURSE-MAL";

await connectDb(env.MONGODB_URI);
try {
  const r = await moveDefaultProjectLeads(to, { apply }, { type: "SYSTEM", id: "move-general-leads" });
  console.log(`[move-general-leads] ${r.total} lead(s) in ${r.from} -> ${r.to}`);
  if (r.total) console.table(Object.entries(r.byOwner).map(([owner, leads]) => ({ owner, leads })));
  console.log(
    !r.total
      ? "[move-general-leads] Nothing to move."
      : apply
        ? "[move-general-leads] Moved."
        : "[move-general-leads] Dry run, nothing saved. Run again with --apply to move them.",
  );
} catch (e) {
  console.error(`[move-general-leads] ${e instanceof Error ? e.message : e}`);
  process.exitCode = 1;
} finally {
  await closeRuntime();
  await disconnectDb();
}
