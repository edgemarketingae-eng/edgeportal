import { meRoutes } from "@edge/contracts";
import { listNotifications, toViewerDto } from "@edge/services";
import { Router } from "express";
import { requireViewer } from "../http/guards";
import { register } from "../http/route";

export function meRouter() {
  const router = Router();
  register(router, meRoutes.me, async (req) => toViewerDto(requireViewer(req, { allowMustChangePassword: true })));
  register(router, meRoutes.notifications, async (req) => listNotifications(requireViewer(req).userId, req.valid.query));
  return router;
}
