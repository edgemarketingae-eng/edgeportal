import { connectDb, disconnectDb } from "@edge/db";
import { allHandlers, env, flushOutbox } from "@edge/services";
import { startWorker } from "./run";

await connectDb(env.MONGODB_URI);
const worker = await startWorker({ redisUrl: env.REDIS_URL, prefix: env.BULLMQ_PREFIX, handlers: allHandlers(), tz: env.TZ_DEFAULT });
await flushOutbox(); // publish anything written while the worker was down

const shutdown = async (signal: string) => {
  console.log(`[worker] ${signal}: stopping`);
  await worker.close();
  await disconnectDb();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
