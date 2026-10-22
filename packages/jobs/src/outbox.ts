import { JobOutbox } from "@edge/db";
import type { JobPayloads, QueueName, SendOptions } from "./names";
import type { JobProducer } from "./producer";

/**
 * Record a job inside the current transaction (the session is attached automatically through
 * Mongoose's transaction AsyncLocalStorage). Nothing reaches Redis until dispatchOutbox() runs
 * after commit, so a rolled-back or retried transaction never leaks a job.
 */
export async function enqueueInTx<Q extends QueueName>(queue: Q, data: JobPayloads[Q], opts: SendOptions = {}) {
  await JobOutbox.create([{ queue, data, dedupeId: opts.dedupeId ?? null, delayMs: opts.delayMs ?? 0 }]);
}

/** Publish pending outbox rows to BullMQ. Safe to run concurrently (each row is claimed first). */
export async function dispatchOutbox(producer: JobProducer, limit = 200) {
  const pending = await JobOutbox.find({ status: "PENDING" }, { _id: 1 }).sort({ createdAt: 1 }).limit(limit).lean();
  let published = 0;
  for (const { _id } of pending) {
    const row = await JobOutbox.findOneAndUpdate({ _id, status: "PENDING" }, { $set: { status: "PUBLISHED", publishedAt: new Date() } }, { returnDocument: "after" }).lean();
    if (!row) continue; // another dispatcher took it
    try {
      await producer.send(row.queue as QueueName, row.data as never, { dedupeId: row.dedupeId ?? undefined, delayMs: row.delayMs || undefined });
      published++;
    } catch (e) {
      await JobOutbox.updateOne({ _id }, { $set: { status: "PENDING", publishedAt: null } });
      console.error(`[outbox] publish failed for ${row.queue}; will retry`, (e as Error).message);
      break; // Redis is probably down; the sweeper retries
    }
  }
  return { published, pending: pending.length };
}
