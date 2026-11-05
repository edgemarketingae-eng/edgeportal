import { AsyncLocalStorage } from "node:async_hooks";
import type { DeletePlan } from "@edge/contracts";
import { FileAsset, withTx, type Types } from "@edge/db";
import type { Permission } from "@edge/domain/auth/permissions";
import type { Actor } from "@edge/domain/enums";
import { audit } from "../audit";
import { env } from "../env";
import { BusinessError } from "../errors";
import { deleteFile } from "../files/service";
import { flushOutbox } from "../runtime";

export type UserActor = Actor & { type: "USER" };

const inDeleteTx = new AsyncLocalStorage<true>();

/**
 * Runs queries side by side for the delete check, one after another inside the delete's transaction (a MongoDB
 * transaction runs one operation at a time). Plans use this instead of Promise.all.
 */
export async function gather<T extends readonly (() => Promise<unknown>)[]>(
  thunks: T,
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  if (!inDeleteTx.getStore()) return Promise.all(thunks.map((t) => t())) as never;
  const out: unknown[] = [];
  for (const t of thunks) out.push(await t());
  return out as never;
}

/** One deletable record type, as the API's delete check and delete routes see it. */
export interface Deleter {
  /** All of these are required. Super-admin deletes use `records.delete`. */
  permissions: Permission[];
  check(id: string, actor: UserActor): Promise<DeletePlan>;
  remove(id: string, actor: UserActor): Promise<{ message: string }>;
}

/** Collects what a delete would do; `done()` gives the API's DeletePlan. */
export class Plan {
  readonly blockers: DeletePlan["blockers"] = [];
  readonly removes: string[] = [];
  readonly warnings: string[] = [];
  constructor(readonly label: string) {}
  block(message: string, href: string | null = null) {
    this.blockers.push({ message, href });
    return this;
  }
  /** Blocks when `n > 0`: "3 leads" with a link. */
  blockIf(n: number, one: string, many: string = `${one}s`, href: string | null = null) {
    if (n > 0) this.block(plural(n, one, many), href);
    return this;
  }
  /** Lists what goes with the record when `n > 0`. */
  remove(n: number, one: string, many: string = `${one}s`) {
    if (n > 0) this.removes.push(plural(n, one, many));
    return this;
  }
  warn(message: string) {
    this.warnings.push(message);
    return this;
  }
  done(): DeletePlan {
    return { label: this.label, blockers: this.blockers, removes: this.removes, warnings: this.warnings };
  }
}

export const plural = (n: number, one: string, many: string = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

export const consoleUrl = (path: string) => `${env.CONSOLE_APP_URL}${path}`;
export const crmUrl = (path: string) => `${env.CRM_APP_URL}${path}`;

const REDACTED = "[redacted]";
const CHILD_CAP = 200;

/**
 * A plain copy of a document for the audit log's `before`. `redact` blanks keys anywhere in the tree (pay amounts,
 * IBANs: HR keeps salary figures out of the audit log); arrays longer than 200 keep their first 200 and a count.
 */
export function snapshot(doc: unknown, redact: readonly string[] = []): unknown {
  const keys = new Set(redact);
  const walk = (v: unknown): unknown => {
    if (v === null || v === undefined) return v ?? null;
    if (typeof v === "bigint") return v.toString();
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "object" && "_bsontype" in (v as object)) return String(v);
    if (Array.isArray(v)) {
      const items = v.slice(0, CHILD_CAP).map(walk);
      return v.length > CHILD_CAP ? { items, total: v.length } : items;
    }
    if (typeof v === "object")
      return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, keys.has(k) ? REDACTED : walk(x)]));
    return v;
  };
  return walk(doc);
}

/** Pay fields that never go into the audit log. */
export const PAY_FIELDS = ["baseMinor", "amountMinor", "allowances", "iban", "accountName", "bankName", "lines"] as const;

export interface DeleterSpec<T> {
  permissions?: Permission[];
  /** Reads the record (throw NotFoundError when it's gone). Runs again inside the delete's transaction. */
  load(id: string, actor: UserActor): Promise<T>;
  /** Fills in what's in the way and what goes with it. Runs again inside the delete's transaction. */
  plan(record: T, actor: UserActor): Promise<Plan>;
  /** Deletes inside the transaction. It may run more than once (write conflicts retry): no HTTP, no files. */
  apply(record: T, actor: UserActor, plan: Plan): Promise<void>;
  /** Side effects after commit: storage, caches, mailing lists. Failures are logged, not thrown. */
  after?(record: T, actor: UserActor): Promise<void>;
  /** The toast, e.g. "Task deleted." */
  done(record: T, plan: Plan): string;
}

/**
 * Builds a Deleter from a spec. `remove()` re-reads and re-checks inside the transaction, so a record that gained a
 * blocker since the dialog opened is refused, then runs `after` and flushes the outbox once the delete is committed.
 */
export function deleter<T>(spec: DeleterSpec<T>): Deleter {
  return {
    permissions: spec.permissions ?? ["records.delete"],
    async check(id, actor) {
      return (await spec.plan(await spec.load(id, actor), actor)).done();
    },
    async remove(id, actor) {
      const { record, plan } = await withTx(() =>
        inDeleteTx.run(true, async () => {
          const record = await spec.load(id, actor);
          const plan = await spec.plan(record, actor);
          if (plan.blockers.length)
            throw new BusinessError(`${capitalise(plan.label)} can't be deleted yet: ${plan.blockers.map((b) => b.message).join("; ")}.`);
          await spec.apply(record, actor, plan);
          return { record, plan };
        }),
      );
      if (spec.after) await spec.after(record, actor).catch((e: unknown) => console.error("[records] after-delete step failed", e));
      await flushOutbox();
      return { message: spec.done(record, plan) };
    },
  };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Files that belonged to a deleted record: unlinked inside the transaction (so the orphan sweep removes them even if
 * the storage call below fails), then deleted from storage after commit with `dropFiles`.
 */
export async function unlinkFiles(ids: (Types.ObjectId | null | undefined)[]) {
  const list = ids.filter((x): x is Types.ObjectId => !!x);
  if (list.length) await FileAsset.updateMany({ _id: { $in: list } }, { $set: { linkedAt: null, linkedType: null, linkedId: null } });
}
export async function dropFiles(ids: (Types.ObjectId | null | undefined)[]) {
  for (const id of ids) if (id) await deleteFile(String(id)).catch(() => undefined);
}

/** The audit entry every delete writes: the full record (redacted where needed) and what went with it. */
export async function auditDelete(e: {
  actor: UserActor;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after?: unknown;
}) {
  await audit({
    actor: e.actor,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    before: e.before,
    after: e.after ?? null,
  });
}
