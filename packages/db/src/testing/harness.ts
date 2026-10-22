import { MongoMemoryReplSet } from "mongodb-memory-server";
import { connectDb, disconnectDb, mongoose } from "../connection";
import { ALL_MODELS, ensureIndexes } from "../indexes";
import { seedBaseData } from "../seed-data";

/**
 * Vitest globalSetup: one in-memory replica set (transactions need a replica set and wiredTiger).
 * Usage in vitest.config.ts:  test: { globalSetup: ["@edge/db/testing/global-setup"] }  (see globalSetup below)
 */
export async function startReplSet() {
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  return { uri: rs.getUri(), stop: () => rs.stop() };
}

/** Connect this test file to its own database (parallel-safe) and create collections + indexes. */
export async function connectTestDb() {
  const uri = process.env.TEST_MONGODB_URI;
  if (!uri) throw new Error("TEST_MONGODB_URI is not set: add the db globalSetup to vitest.config");
  await connectDb(uri, { dbName: `edge_test_${process.env.VITEST_POOL_ID ?? "0"}_${process.pid}` });
  await ensureIndexes();
}

export async function resetDb() {
  for (const m of ALL_MODELS) await m.deleteMany({});
  await seedBaseData();
}

export async function closeTestDb() {
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await disconnectDb();
}
