import { publicRoutes } from "@edge/contracts";
import { captureGrowthHubLead } from "@edge/services";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { register } from "../http/route";

/** /api/public: called from the browser by the academy's other sites (CORS in app.ts). req.ip is the visitor (nginx). */
export function publicRouter() {
  const r = Router();
  const leadLimiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again in a few minutes." } },
  });
  register(r, publicRoutes.growthHubLead, leadLimiter, async (req) => {
    const { website, ...input } = req.valid.body;
    if (website) return { ok: true as const, contactUrl: null, channel: null, contactName: null };
    return { ok: true as const, ...(await captureGrowthHubLead(input)) };
  });
  return r;
}
