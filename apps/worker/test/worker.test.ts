import { NotificationLog, withTx } from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { createBullProducer, type JobProducer } from "@edge/jobs";
import { allHandlers, configureRuntime, flushOutbox, queueEmail } from "@edge/services";
import type { EmailSender, OutgoingEmail } from "@edge/integrations/email/index";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startWorker } from "../src/run";

const REDIS = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379/15";
const prefix = `edge-wtest-${process.pid}`;
const sent: OutgoingEmail[] = [];
const email: EmailSender = { provider: "capture", send: async (e) => (sent.push(e), { providerMessageId: "x" }) };
let producer: JobProducer;

beforeAll(async () => {
  await connectTestDb();
  producer = createBullProducer(REDIS, prefix);
  configureRuntime({ producer, email });
});
afterAll(async () => {
  await producer.close?.();
  await closeTestDb();
});
beforeEach(resetDb);

async function waitFor(fn: () => Promise<boolean>, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("timed out");
}

describe("worker", () => {
  it("delivers an email queued inside a transaction", async () => {
    const worker = await startWorker({ redisUrl: REDIS, prefix, handlers: allHandlers(), tz: "Asia/Dubai", schedules: false, log: () => undefined });
    await withTx(() => queueEmail({ to: "a@example.com", template: "enrollment.unlocked", data: { name: "A", batchName: "B1", dashboardUrl: "http://x" }, dedupeKey: "w-test-1" }));
    await flushOutbox();
    await waitFor(async () => (await NotificationLog.findOne({ dedupeKey: "w-test-1" }).lean())?.status === "SENT");
    expect(sent.at(-1)?.subject).toMatch(/restored/);
    await worker.close();
  });

  it("upserts schedulers idempotently in Asia/Dubai and removes stale ones", async () => {
    const conn = new Redis(REDIS, { maxRetriesPerRequest: null });
    const stale = new Queue("enrollment.autolock", { connection: conn, prefix });
    await stale.upsertJobScheduler("old-schedule", { pattern: "0 0 * * *" }, { name: "enrollment.autolock", data: {} });
    for (let i = 0; i < 2; i++) {
      const w = await startWorker({ redisUrl: REDIS, prefix, handlers: allHandlers(), tz: "Asia/Dubai", log: () => undefined });
      await w.close();
    }
    const schedulers = await stale.getJobSchedulers();
    expect(schedulers.map((s) => s.key)).toEqual(["enrollment-autolock-hourly"]);
    expect(schedulers[0]?.tz).toBe("Asia/Dubai");
    for (const name of ["enrollment.autolock", "enrollment.reminders", "email.send", "outbox.sweep"]) {
      const q = new Queue(name, { connection: conn, prefix });
      await q.obliterate({ force: true });
      await q.close();
    }
    await stale.close();
    await conn.quit();
  });
});
