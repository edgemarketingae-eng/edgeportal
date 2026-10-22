import { ApiError } from "./errors";
import { buildPath, type RouteDef } from "./route";
import type { z } from "zod";

export interface CallOptions {
  params?: Record<string, string | number>;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
}

/**
 * Minimal typed client. `send` performs the HTTP call (server-side: internal URL + forwarded
 * cookie; browser-side: same-origin fetch through the app's rewrite).
 */
export function createClient(send: (path: string, init: { method: string; body?: string; headers: Record<string, string> }) => Promise<Response>) {
  return async function call<R extends z.ZodType>(def: RouteDef<z.ZodType, z.ZodType, z.ZodType, R>, opts: CallOptions = {}): Promise<z.output<R>> {
    let path = buildPath(def.path, opts.params);
    if (opts.query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
      const s = qs.toString();
      if (s) path += `?${s}`;
    }
    const res = await send(path, {
      method: def.method,
      headers: opts.body !== undefined ? { "content-type": "application/json" } : {},
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw ApiError.fromBody(res.status, json);
    return json as z.output<R>;
  };
}
