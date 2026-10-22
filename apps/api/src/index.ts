import { connectDb, ensureIndexes } from "@edge/db";
import { env } from "@edge/services";
import { createApp } from "./app";
import { createAuth } from "./auth";

await connectDb(env.MONGODB_URI);
if (env.NODE_ENV !== "production") await ensureIndexes(); // production runs the migrate script instead
const auth = createAuth();
const app = createApp({ auth });
const server = app.listen(env.PORT, () => console.log(`[api] listening on :${env.PORT} (${env.NODE_ENV})`));

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
