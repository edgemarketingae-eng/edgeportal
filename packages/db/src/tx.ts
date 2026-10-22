import type { ClientSession, Model } from "mongoose";
import { mongoose } from "./connection";

/**
 * Multi-document transaction. The callback may run MORE THAN ONCE (write conflicts are retried),
 * so it must not perform HTTP calls or enqueue jobs: write outbox rows instead.
 */
export function withTx<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  return mongoose.connection.transaction(fn, {
    readPreference: "primary",
    readConcern: { level: "snapshot" },
    writeConcern: { w: "majority" },
  });
}

export class DbNotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
  }
}

/**
 * Mongo has no SELECT ... FOR UPDATE. Writing first (bumping `rev`) makes any concurrent
 * transaction touching the same document hit a WriteConflict and retry against fresh data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function lockForUpdate<T>(model: Model<any>, filter: Record<string, unknown>, session?: ClientSession): Promise<T> {
  // Inside withTx() the session is attached automatically (transactionAsyncLocalStorage).
  const doc = await model.findOneAndUpdate(filter, { $inc: { rev: 1 } }, { ...(session ? { session } : {}), returnDocument: "after" }).lean();
  if (!doc) throw new DbNotFoundError(model.modelName);
  return doc as T;
}

export function isDuplicateKey(e: unknown) {
  return (e as { code?: number })?.code === 11000;
}
