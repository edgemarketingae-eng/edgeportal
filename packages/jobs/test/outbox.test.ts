import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { JobOutbox, withTx } from "@edge/db";
import { closeTestDb, connectTestDb, resetDb } from "@edge/db/testing";
import { createBullProducer, CaptureProducer, dispatchOutbox, enqueueInTx, type JobProducer } from "../src";

beforeAll(connectTestDb);
afterAll(closeTestDb);
beforeEach(resetDb);

describe("outbox", () => {
  it("only committed transactions publish jobs, exactly once", async () => {
    await expect(
      withTx(async () => {
        await enqueueInTx("odoo.sync", { paymentId: "p-rolled-back" });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    await withTx(async () => {
      await enqueueInTx("odoo.sync", { paymentId: "p1" }, { dedupeId: "odoo-p1" });
      await enqueueInTx("mailerlite.sync", { userId: "u1" }, { delayMs: 30_000 });
    });
    const cap = new CaptureProducer();
    expect((await dispatchOutbox(cap)).published).toBe(2);
    expect((await dispatchOutbox(cap)).published).toBe(0);
    expect(cap.jobs.map((j) => j.queue).sort()).toEqual(["mailerlite.sync", "odoo.sync"]);
    expect(cap.jobs.find((j) => j.queue === "odoo.sync")?.opts?.dedupeId).toBe("odoo-p1");
  });

  it("keeps rows pending when the broker is down", async () => {
    await withTx(() => enqueueInTx("odoo.sync", { paymentId: "p2" }));
    const down: JobProducer = { send: async () => Promise.reject(new Error("ECONNREFUSED")) };
    expect((await dispatchOutbox(down)).published).toBe(0);
    expect(await JobOutbox.countDocuments({ status: "PENDING" })).toBe(1);
    expect((await dispatchOutbox(new CaptureProducer())).published).toBe(1);
  });

  it("publishes to Redis with BullMQ deduplication", async () => {
    const producer = createBullProducer(process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379/15", `edge-test-${process.pid}`);
    await producer.send("odoo.sync", { paymentId: "x" }, { dedupeId: "odoo-x" });
    await producer.send("odoo.sync", { paymentId: "x" }, { dedupeId: "odoo-x" });
    const { Queue } = await import("bullmq");
    const { Redis } = await import("ioredis");
    const conn = new Redis(process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379/15", { maxRetriesPerRequest: null });
    const q = new Queue("odoo.sync", { connection: conn, prefix: `edge-test-${process.pid}` });
    expect(await q.getJobCountByTypes("waiting", "delayed")).toBe(1);
    await q.obliterate({ force: true });
    await q.close();
    await conn.quit();
    await producer.close?.();
    await expect(producer.send("odoo.sync", { paymentId: "y" }, { dedupeId: "bad:id" })).rejects.toThrow(/must not contain/);
  });
});
