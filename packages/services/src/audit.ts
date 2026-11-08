import { AuditLog } from "@edge/db";
import type { Actor, ActorVia } from "@edge/domain/enums";

export interface AuditEntry {
  actor: Actor;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

/** "via Claude" and the like: only a person can act through another app. */
export const viaOf = (actor: Actor): ActorVia | null => (actor.type === "USER" ? (actor.via ?? null) : null);

const plain = (v: unknown) =>
  v === undefined ? null : JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val)));

/** Joins the surrounding transaction automatically when called inside withTx(). */
export async function audit(e: AuditEntry) {
  await AuditLog.create([
    {
      actorType: e.actor.type,
      actorId: e.actor.id ?? null,
      via: viaOf(e.actor),
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      before: plain(e.before),
      after: plain(e.after),
      ip: e.ip ?? null,
      userAgent: e.userAgent ?? null,
    },
  ]);
}
