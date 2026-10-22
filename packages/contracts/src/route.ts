import type { z } from "zod";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** A typed API route shared by the Express handler and the Next.js client. */
export interface RouteDef<P extends z.ZodType = z.ZodType, Q extends z.ZodType = z.ZodType, B extends z.ZodType = z.ZodType, R extends z.ZodType = z.ZodType> {
  method: Method;
  path: string; // Express-style: /api/v1/admin/enrollments/:id/approve
  params?: P;
  query?: Q;
  body?: B;
  response: R;
}

export function route<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType, R extends z.ZodType>(def: RouteDef<P, Q, B, R>) {
  return def;
}

export type RouteParams<T> = T extends RouteDef<infer P> ? z.input<P> : never;
export type RouteQuery<T> = T extends RouteDef<z.ZodType, infer Q> ? z.input<Q> : never;
export type RouteBody<T> = T extends RouteDef<z.ZodType, z.ZodType, infer B> ? z.input<B> : never;
export type RouteResponse<T> = T extends RouteDef<z.ZodType, z.ZodType, z.ZodType, infer R> ? z.output<R> : never;

export function buildPath(path: string, params?: Record<string, string | number>) {
  return path.replace(/:([A-Za-z0-9_]+)/g, (_m, k: string) => {
    const v = params?.[k];
    if (v === undefined) throw new Error(`Missing path param ${k} for ${path}`);
    return encodeURIComponent(String(v));
  });
}
