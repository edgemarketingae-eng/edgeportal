import { QueueEvents, Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { SCHEDULES, type QueueName } from "@edge/jobs";
import type { Handlers } from "@edge/services";

/** Per-queue concurrency: long or ordering-sensitive jobs run one at a time. */
const CONCURRENCY: Partial<Record<QueueName, number>> = {
  "email.send": 5,
  "odoo.sync": 2,
  "mailerlite.sync": 3,
  "recordings.cacheFill": 1,
  "enrollment.autolock": 1,
  "enrollment.reminders": 1,
  "crm.followUpDigest": 1,
  "crm.staleSweep": 1,
  "crm.batchUrgency": 1,
  "crm.autoLink": 2,
};

export interface WorkerOptions {
  redisUrl: string;
  prefix: string;
  handlers: Handlers;
  tz: string;
  schedules?: boolean;
  log?: (msg: string, extra?: unknown) => void;
}

export async function startWorker(o: WorkerOptions) {
  const log = o.log ?? ((m, e) => console.log(`[worker] ${m}`, e ?? ""));
  const connection = new Redis(o.redisUrl, { maxRetriesPerRequest: null });
  const workers: Worker[] = [];
  const queues: Queue[] = [];
  const names = Object.keys(o.handlers) as QueueName[];

  for (const name of names) {
    const handler = o.handlers[name] as (d: unknown) => Promise<unknown>;
    const w = new Worker(
      name,
      async (job) => {
        const started = Date.now();
        const result = await handler(job.data);
        log(`${name} #${job.id} ok in ${Date.now() - started}ms`, result);
        return result ?? null;
      },
      { connection, prefix: o.prefix, concurrency: CONCURRENCY[name] ?? 4 },
    );
    w.on("failed", (job, err) => log(`${name} #${job?.id} failed (attempt ${job?.attemptsMade})`, err.message));
    workers.push(w);
  }

  if (o.schedules !== false) {
    for (const name of names) {
      const q = new Queue(name, { connection, prefix: o.prefix });
      queues.push(q);
      const wanted = SCHEDULES.filter((s) => s.queue === name);
      for (const s of wanted) await q.upsertJobScheduler(s.id, { pattern: s.pattern, tz: o.tz }, { name, data: s.data ?? {}, opts: { attempts: 3 } });
      // Remove schedulers from older releases that are no longer declared.
      for (const existing of await q.getJobSchedulers()) {
        if (existing.key && !wanted.some((s) => s.id === existing.key)) await q.removeJobScheduler(existing.key);
      }
    }
  }
  log(`started ${workers.length} queues, ${SCHEDULES.filter((s) => names.includes(s.queue)).length} schedules (tz ${o.tz})`);

  return {
    async close() {
      await Promise.all(workers.map((w) => w.close()));
      await Promise.all(queues.map((q) => q.close()));
      await connection.quit().catch(() => undefined);
    },
  };
}

export { QueueEvents };
