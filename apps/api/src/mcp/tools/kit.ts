import type { RouteDef } from "@edge/contracts";
import type { Permission } from "@edge/domain/auth/permissions";
import { toDubaiLocal } from "@edge/domain/dates";
import type { Viewer } from "@edge/services";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Call } from "../client";

/**
 * Tool definitions for the Claude connector. Each tool is a thin, LLM-friendly front for one or two CRM API routes:
 * plain input schemas (the API still validates with the contract), Dubai local times, USD amounts, and compact output.
 * Permissions here only decide which tools a person sees; the API decides what they may actually do.
 */

/** read: looks only. write: adds or changes things. destructive: deletes, merges, rejects or changes many at once. */
export type ToolKind = "read" | "write" | "destructive";

export interface ToolContext {
  viewer: Viewer;
  readOnly: boolean;
  call: Call;
}

export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  input: S;
  /** Every route `run` calls; each must be in `mcpRoutes`. */
  routes: readonly RouteDef[];
  /** Shown only to people holding all of these (plus crm.access)... */
  perms: readonly Permission[];
  /** ...and at least one of these, when set. */
  anyPerm?: readonly Permission[];
  kind: ToolKind;
  idempotent?: boolean;
  /** Reaches outside the CRM (sends an email). */
  openWorld?: boolean;
  run(args: z.output<z.ZodObject<S>>, ctx: ToolContext): Promise<unknown>;
}

export function defineTool<S extends z.ZodRawShape>(t: ToolDef<S>): ToolDef<S> {
  return t;
}

export function toolVisible(t: ToolDef, perms: Set<Permission>, readOnly: boolean) {
  if (readOnly && t.kind !== "read") return false;
  if (!perms.has("crm.access") || !t.perms.every((p) => perms.has(p))) return false;
  return !t.anyPerm || t.anyPerm.some((p) => perms.has(p));
}

export function toolAnnotations(t: ToolDef): ToolAnnotations {
  return {
    title: t.title,
    readOnlyHint: t.kind === "read",
    destructiveHint: t.kind === "destructive",
    idempotentHint: t.kind === "read" || !!t.idempotent,
    openWorldHint: !!t.openWorld,
  };
}

// ─── Inputs ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const zId = (what: string) => z.string().trim().min(1).max(64).describe(`${what} id`);
export const zWhen = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use YYYY-MM-DDTHH:mm")
  .describe("Dubai local time, YYYY-MM-DDTHH:mm");
export const zDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .describe("Date, YYYY-MM-DD");
export const zPageNo = z.number().int().min(1).max(10_000).optional().describe("Page number, from 1");
export const zPageSize = z.number().int().min(1).max(50).optional().describe("Results per page (default 25, at most 50)");

/** Tool inputs use null for "clear this"; the CRM's routes use "" (what an empty form field sends). */
export const clear = <T>(v: T | null | undefined): T | "" | undefined => (v === null ? "" : v);
/** Drops undefined keys so a partial update only sends what Claude set. */
export function defined<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// ─── Output ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** ISO instants become Dubai local time and `…Minor` amounts become `…Usd` (every CRM amount is USD). */
export function shape(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (k.endsWith("Minor") && (typeof x === "number" || x === null)) out[`${k.slice(0, -5)}Usd`] = x === null ? null : x / 100;
      else out[k] = shape(x);
    }
    return out;
  }
  if (typeof v === "string" && ISO_INSTANT.test(v)) return toDubaiLocal(v);
  return v;
}

export const clip = (s: string | null | undefined, n: number) =>
  s && s.length > n ? `${s.slice(0, n)}… (cut, ${s.length} characters)` : s;

const TEXT_LIMIT = 25_000;

export function toolText(out: unknown): string {
  const text = JSON.stringify(shape(out), null, 1);
  if (text.length <= TEXT_LIMIT) return text;
  return `${text.slice(0, TEXT_LIMIT)}\n… (truncated: ask for fewer results, a smaller page or a narrower filter)`;
}

/** A person or project reference, flattened for reading. */
export const ref = (r: { id: string; name: string } | null | undefined) => (r ? { id: r.id, name: r.name } : null);
