import { connectDb, disconnectDb, ensureIndexes } from "@edge/db";
import { closeRuntime, env, seed } from "@edge/services";

/** Deploy step: create collections + indexes, then the idempotent seed. */
await connectDb(env.MONGODB_URI);
await ensureIndexes();
await seed({ production: env.NODE_ENV === "production", adminEmail: process.env.SEED_ADMIN_EMAIL, adminPassword: process.env.SEED_ADMIN_PASSWORD });
console.log("[migrate] indexes ensured and seed applied");
await closeRuntime();
await disconnectDb();
