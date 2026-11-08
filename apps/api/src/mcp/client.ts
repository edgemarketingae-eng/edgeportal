import { createClient, type RouteDef } from "@edge/contracts";
import { env } from "@edge/services";
import type { Request } from "express";

export type Call = ReturnType<typeof createClient>;

/**
 * Tool calls go through the real API routes, as the person, so validation, permissions, project scope and the audit
 * trail are exactly the web's. The internal token is what lets a Claude token into /api/v1 at all (see `apiGate`), and
 * each tool may only reach the routes it declares.
 */
export function loopbackClient(req: Request, token: string, routes: readonly RouteDef[]): Call {
  const base = env.MCP_API_URL ?? `http://127.0.0.1:${req.socket.localPort}`;
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "x-internal-token": env.INTERNAL_API_TOKEN,
    "x-request-id": req.requestId,
  };
  if (req.ip) headers["x-forwarded-for"] = req.ip;
  const ua = req.header("user-agent");
  if (ua) headers["x-forwarded-user-agent"] = ua.slice(0, 300);
  const raw = createClient((path, init) =>
    fetch(`${base}${path}`, { ...init, headers: { ...init.headers, ...headers }, signal: AbortSignal.timeout(60_000) }),
  );
  const guarded: Call = (def, opts) => {
    if (!routes.includes(def as RouteDef)) throw new Error(`This tool can't call ${def.method} ${def.path}`);
    return raw(def, opts);
  };
  return guarded;
}
