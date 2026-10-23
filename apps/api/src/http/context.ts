import type { CrmScope, Viewer } from "@edge/services";
import type { Request } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      viewer?: Viewer | null;
      /** Project-aware CRM scope, loaded once per request by the CRM routes. */
      crmScope?: CrmScope;
      sessionToken?: string | null;
      valid?: { params?: unknown; query?: unknown; body?: unknown };
    }
  }
}

export function clientIp(req: Request): string | null {
  return req.ip ?? null;
}
