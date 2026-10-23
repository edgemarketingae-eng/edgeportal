import { ApiError } from "@edge/contracts";
import { NotificationLog } from "@edge/db";
import { allHandlers, devRoutesEnabled } from "@edge/services";
import type { QueueName } from "@edge/jobs";
import { Router } from "express";

/** Development/test only: run a job handler inline, optionally "as of" a future time. */
export function devRouter() {
  const router = Router();
  router.post("/api/dev/jobs/:name", async (req, res, next) => {
    try {
      if (!devRoutesEnabled()) throw new ApiError(404, "NOT_FOUND", "Not found");
      const handler = allHandlers()[req.params.name as QueueName] as ((d: unknown) => Promise<unknown>) | undefined;
      if (!handler) throw new ApiError(404, "NOT_FOUND", `Unknown job ${req.params.name}`);
      res.json({ ok: true, result: await handler(req.body ?? {}) });
    } catch (e) {
      next(e);
    }
  });
  /** Development/test only: the last email queued for an address (lets e2e tests follow set-password links). */
  router.get("/api/dev/last-email", async (req, res, next) => {
    try {
      if (!devRoutesEnabled()) throw new ApiError(404, "NOT_FOUND", "Not found");
      const to = String(req.query.to ?? "").trim().toLowerCase();
      if (!to) throw new ApiError(400, "VALIDATION", "to is required");
      const log = await NotificationLog.findOne({ to }).sort({ createdAt: -1 }).lean();
      if (!log) throw new ApiError(404, "NOT_FOUND", "No email for that address");
      res.json({ template: log.template, status: log.status, payload: log.payload, createdAt: log.createdAt });
    } catch (e) {
      next(e);
    }
  });
  return router;
}
