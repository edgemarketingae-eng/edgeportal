import { recordRoutes } from "@edge/contracts";
import { deleterFor } from "@edge/services";
import { Router } from "express";
import { actorOf, requirePermission } from "../http/guards";
import { register } from "../http/route";

/**
 * Permanent deletes behind one check-then-delete pair. Each record type names the permissions it needs (staff
 * managers for staff accounts, `records.delete` for everything else); phones never reach these routes.
 */
export function recordsRouter() {
  const r = Router();
  register(r, recordRoutes.check, async (req) => {
    const d = deleterFor(req.valid.params.type);
    return d.check(req.valid.params.id, actorOf(requirePermission(req, ...d.permissions)));
  });
  register(r, recordRoutes.remove, async (req) => {
    const d = deleterFor(req.valid.params.type);
    const { message } = await d.remove(req.valid.params.id, actorOf(requirePermission(req, ...d.permissions)));
    return { ok: true as const, message };
  });
  return r;
}
