import { ApiError } from "@edge/contracts";
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
  return router;
}
