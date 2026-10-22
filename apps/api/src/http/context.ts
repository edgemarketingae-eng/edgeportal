import type { Viewer } from "@edge/services";
import type { Request } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      viewer?: Viewer | null;
      sessionToken?: string | null;
      valid?: { params?: unknown; query?: unknown; body?: unknown };
    }
  }
}

export function clientIp(req: Request): string | null {
  return req.ip ?? null;
}
