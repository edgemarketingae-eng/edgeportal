import { studentRoutes } from "@edge/contracts";
import { getCurrentBatch, getStudentPortal, updateStudentProfile } from "@edge/services";
import { Router } from "express";
import { requireStudent } from "../http/guards";
import { register } from "../http/route";

export function studentRouter() {
  const r = Router();
  register(r, studentRoutes.enrollingNow, async () => {
    const current = await getCurrentBatch();
    return { batch: current ? { name: current.batch.name, startDate: current.batch.startDate.toISOString().slice(0, 10) } : null };
  });
  register(r, studentRoutes.portal, async (req) => getStudentPortal(requireStudent(req).userId));
  register(r, studentRoutes.updateProfile, async (req) => {
    await updateStudentProfile(requireStudent(req).userId, req.valid.body);
    return { ok: true as const, message: "Profile saved." };
  });
  return r;
}
