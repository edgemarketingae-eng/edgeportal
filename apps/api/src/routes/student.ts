import { studentRoutes } from "@edge/contracts";
import { captureFreeClassLead, getCurrentBatch, getPublicFreeClass, getStudentPortal, updateStudentProfile } from "@edge/services";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireStudent } from "../http/guards";
import { register } from "../http/route";

export function studentRouter() {
  const r = Router();
  register(r, studentRoutes.enrollingNow, async () => {
    const current = await getCurrentBatch();
    return { batch: current ? { name: current.batch.name, startDate: current.batch.startDate.toISOString().slice(0, 10) } : null };
  });
  register(r, studentRoutes.freeClass, async () => ({ freeClass: await getPublicFreeClass() }));
  // Only the student app calls this (internal token); req.ip is the visitor it forwards.
  const leadLimiter = rateLimit({
    windowMs: 10 * 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again in a few minutes." } },
  });
  register(r, studentRoutes.freeClassLead, leadLimiter, async (req) => {
    const { website, ...input } = req.valid.body;
    if (website) return { ok: true as const, whatsappUrl: null, contactName: null };
    return { ok: true as const, ...(await captureFreeClassLead(input)) };
  });
  register(r, studentRoutes.portal, async (req) => getStudentPortal(requireStudent(req).userId));
  register(r, studentRoutes.updateProfile, async (req) => {
    await updateStudentProfile(requireStudent(req).userId, req.valid.body);
    return { ok: true as const, message: "Profile saved." };
  });
  return r;
}
