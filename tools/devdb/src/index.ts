import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { connect } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { MongoBinary } from "mongodb-memory-server";

/**
 * Local MongoDB for development: a persistent single-node replica set (transactions need one).
 * The mongod binary is downloaded once into the mongodb-memory-server cache; nothing is
 * installed system-wide. Data lives in <repo>/.data/mongo. Staging/production use Atlas.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const port = Number(process.env.DEVDB_PORT ?? 27017);
const dbPath = path.join(root, ".data", "mongo");
mkdirSync(dbPath, { recursive: true });

function isListening() {
  return new Promise<boolean>((resolve) => {
    const s = connect(port, "127.0.0.1", () => {
      s.end();
      resolve(true);
    });
    s.on("error", () => resolve(false));
  });
}

if (await isListening()) {
  console.error(`[devdb] Port ${port} is already in use, most likely by a mongod left over from an earlier \`turbo dev\`.`);
  console.error(`[devdb] Find it with \`lsof -nP -iTCP:${port} -sTCP:LISTEN\` and stop it, or set DEVDB_PORT.`);
  process.exit(1);
}

const bin = await MongoBinary.getPath();
const log = createWriteStream(path.join(root, ".data", "mongod.log"), { flags: "a" });
const child = spawn(bin, ["--replSet", "rs0", "--dbpath", dbPath, "--port", String(port), "--bind_ip", "127.0.0.1"], { stdio: ["ignore", "pipe", "pipe"] });
child.stdout.pipe(log);
child.stderr.pipe(log);
child.on("exit", (code) => {
  console.log(`[devdb] mongod exited (${code}). See .data/mongod.log`);
  process.exit(code ?? 1);
});

async function waitForPort() {
  for (let i = 0; i < 100; i++) {
    if (await isListening()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("mongod did not start");
}

await waitForPort();
const client = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`);
await client.connect();
const admin = client.db("admin");
try {
  await admin.command({ replSetGetStatus: 1 });
} catch (e) {
  if ((e as { code?: number }).code !== 94) throw e; // NotYetInitialized
  await admin.command({ replSetInitiate: { _id: "rs0", members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
}
for (let i = 0; i < 100; i++) {
  const status = await admin.command({ replSetGetStatus: 1 }).catch(() => null);
  if (status?.members?.[0]?.stateStr === "PRIMARY") break;
  await new Promise((r) => setTimeout(r, 200));
}
await client.close();
console.log(`[devdb] MongoDB replica set ready (${await MongoBinary.getPath()})`);
console.log(`[devdb] MONGODB_URI=mongodb://127.0.0.1:${port}/edge_dev?replicaSet=rs0`);

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => child.kill("SIGTERM"));
