import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { JobPayloads, QueueName, SendOptions } from "./names";

export interface JobProducer {
  send<Q extends QueueName>(queue: Q, data: JobPayloads[Q], opts?: SendOptions): Promise<void>;
  close?(): Promise<void>;
}

export const DEFAULT_JOB_OPTS = {
  attempts: 6,
  backoff: { type: "exponential" as const, delay: 30_000 },
  removeOnComplete: { age: 24 * 3600, count: 2000 },
  removeOnFail: { age: 14 * 24 * 3600 },
};

/** BullMQ producer. Fails fast (no offline queue) so callers can fall back to the outbox. */
export function createBullProducer(redisUrl: string, prefix = "edge"): JobProducer {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
  connection.on("error", () => undefined); // surfaced through failed sends
  const queues = new Map<string, Queue>();
  const queueFor = (name: string) => {
    let q = queues.get(name);
    if (!q) {
      q = new Queue(name, { connection, prefix });
      queues.set(name, q);
    }
    return q;
  };
  return {
    async send(queue, data, opts = {}) {
      if (opts.dedupeId?.includes(":")) throw new Error(`dedupeId must not contain ':' (${opts.dedupeId})`);
      await queueFor(queue).add(queue, data, {
        ...DEFAULT_JOB_OPTS,
        delay: opts.delayMs,
        deduplication: opts.dedupeId ? { id: opts.dedupeId } : undefined,
      });
    },
    async close() {
      await Promise.all([...queues.values()].map((q) => q.close()));
      await connection.quit().catch(() => undefined);
    },
  };
}

/** Test/dev double that records jobs instead of sending them. */
export class CaptureProducer implements JobProducer {
  jobs: { queue: QueueName; data: unknown; opts?: SendOptions }[] = [];
  async send<Q extends QueueName>(queue: Q, data: JobPayloads[Q], opts?: SendOptions) {
    this.jobs.push({ queue, data, opts });
  }
  take() {
    const j = this.jobs;
    this.jobs = [];
    return j;
  }
}
