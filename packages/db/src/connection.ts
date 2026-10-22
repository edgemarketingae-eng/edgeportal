import mongoose from "mongoose";

// Every query inside a transaction callback automatically uses the transaction's session,
// so forgetting `{ session }` can never write outside the transaction.
mongoose.set("transactionAsyncLocalStorage", true);
mongoose.set("strictQuery", true);

export { mongoose };

export async function connectDb(uri: string, opts: { autoIndex?: boolean; dbName?: string } = {}) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  await mongoose.connect(uri, {
    autoIndex: opts.autoIndex ?? false, // indexes are created explicitly by ensureIndexes()
    dbName: opts.dbName,
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
  });
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

/** Native driver handles for Better Auth's MongoDB adapter (same client => same BSON classes). */
export function nativeDb() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("connectDb() must be called first");
  return { db, client: mongoose.connection.getClient() };
}

export async function pingDb() {
  await mongoose.connection.db?.admin().command({ ping: 1 });
  return true;
}
