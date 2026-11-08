import type { CrmDeviceDoc } from "@edge/db";
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
      /** Set when the request came from the CRM phone app with a device token instead of a Next.js server. */
      device?: CrmDeviceDoc;
      /** Set when Claude made this request for someone (our /mcp endpoint calling the API with their Claude token). */
      mcp?: { grantId: string; clientId: string; readOnly: boolean };
      valid?: { params?: unknown; query?: unknown; body?: unknown };
    }
  }
}

export function clientIp(req: Request): string | null {
  return req.ip ?? null;
}
