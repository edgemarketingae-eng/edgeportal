/**
 * Isolated end-to-end stack: an in-memory MongoDB replica set, local Redis (db 14, flushed on
 * start), the API and worker from source, and production builds of the three Next apps on their own
 * ports and dist dir. It never touches the dev database or a running `pnpm dev`.
 *
 *   pnpm --filter @edge/e2e stack                       # start it and keep it running
 *   E2E_REUSE_STACK=1 pnpm test:e2e                     # run the tests against that running stack
 *   E2E_SKIP_BUILD=1 pnpm --filter @edge/e2e stack      # reuse the last .next-e2e builds
 *
 * The Next apps run from their standalone output (`server.js`), the same artifact the Docker images ship.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, mkdtempSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { E2E } from "./config";

const root = fileURLToPath(new URL("..", import.meta.url));
const app = (name: string) => path.join(root, "apps", name);
const bin = (appName: string, tool: string) => path.join(app(appName), "node_modules", ".bin", tool);

/** FLUSHDB on the e2e Redis database so jobs and schedulers from earlier runs don't leak in. */
function flushRedis(db: number) {
  return new Promise<void>((resolve, reject) => {
    const s = connect(6379, "127.0.0.1", () => s.write(`SELECT ${db}\r\nFLUSHDB\r\nQUIT\r\n`));
    s.resume(); // consume the +OK replies so the socket can reach "end" and "close"
    s.on("error", (e) => reject(new Error(`Redis is not reachable on 127.0.0.1:6379 (${e.message})`)));
    s.on("close", () => resolve());
  });
}

const children: ChildProcess[] = [];
let stopping = false;

function prefix(name: string, stream: NodeJS.ReadableStream | null) {
  let buf = "";
  stream?.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) console.log(`[${name}] ${line}`);
  });
}

function start(name: string, cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  // Same process group as this script: if Playwright kills the group, nothing is left behind.
  const p = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  prefix(name, p.stdout);
  prefix(name, p.stderr);
  children.push(p);
  p.on("exit", (code) => {
    if (!stopping) {
      console.error(`[stack] ${name} exited with ${code}`);
      void stop(1);
    }
  });
  return p;
}

function run(name: string, cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    prefix(name, p.stdout);
    prefix(name, p.stderr);
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${name} failed with exit code ${code}`))));
  });
}

/** Refuse to start over a stack that is still running (it would be silently mixed with this one). */
function assertPortFree(port: number) {
  return new Promise<void>((resolve, reject) => {
    const s = connect(port, "127.0.0.1");
    s.on("connect", () => {
      s.destroy();
      reject(new Error(`Port ${port} is already in use. Stop the old e2e stack first.`));
    });
    s.on("error", () => resolve());
  });
}

async function waitFor(url: string, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      await fetch(url, { redirect: "manual" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

let replSet: MongoMemoryReplSet | undefined;
async function stop(code = 0) {
  stopping = true;
  // Let the API and worker exit before the database disappears under them (up to 5 s).
  await Promise.all(
    children.map(
      (c) =>
        new Promise<void>((resolve) => {
          if (c.exitCode !== null || c.signalCode !== null) return resolve();
          c.once("exit", () => resolve());
          c.kill("SIGTERM");
          setTimeout(resolve, 5_000).unref();
        }),
    ),
  );
  await replSet?.stop().catch(() => undefined);
  process.exit(code);
}
process.on("SIGINT", () => void stop(0));
process.on("SIGTERM", () => void stop(0));

try {
  for (const port of [E2E.apiPort, E2E.studentPort, E2E.consolePort, E2E.crmPort]) await assertPortFree(port);
  await flushRedis(E2E.redisDb);
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });

  const serverEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(E2E.apiPort),
    MONGODB_URI: replSet.getUri("edge_e2e"),
    REDIS_URL: `redis://127.0.0.1:6379/${E2E.redisDb}`,
    BULLMQ_PREFIX: "edge-e2e",
    INTERNAL_API_TOKEN: E2E.internalToken,
    STUDENT_APP_URL: E2E.student,
    CONSOLE_APP_URL: E2E.console,
    CRM_APP_URL: E2E.crm,
    API_PUBLIC_URL: E2E.api,
    DEV_ROUTES: "true",
    REQUIRE_ADMIN_2FA: "false",
    OTP_MODE: "mock",
    EMAIL_MODE: "console",
    PAYMENTS_MODE: "mock",
    ODOO_MODE: "mock",
    GOOGLE_MODE: "mock",
    MAILERLITE_MODE: "mock",
    MOCK_DRIVE_FILE: path.join(root, "fixtures", "sample.mp4"),
    MEDIA_CACHE_DIR: mkdtempSync(path.join(tmpdir(), "edge-e2e-media-")),
  };
  const webEnv = (port: number): NodeJS.ProcessEnv => ({
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    NEXT_DIST_DIR: ".next-e2e",
    API_INTERNAL_URL: E2E.api,
    INTERNAL_API_TOKEN: E2E.internalToken,
    DEV_ROUTES: "true",
    NEXT_TELEMETRY_DISABLED: "1",
  });

  await run("migrate", bin("api", "tsx"), ["src/scripts/migrate.ts"], app("api"), serverEnv);
  start("api", bin("api", "tsx"), ["src/index.ts"], app("api"), serverEnv);
  start("worker", bin("worker", "tsx"), ["src/index.ts"], app("worker"), serverEnv);

  const webApps = [
    ["student", E2E.studentPort],
    ["console", E2E.consolePort],
    ["crm", E2E.crmPort],
  ] as const;
  if (!process.env.E2E_SKIP_BUILD) {
    // One build at a time: three parallel `next build`s need more memory than a laptop or CI runner has to spare.
    for (const [name, port] of webApps) await run(`build:${name}`, bin(name, "next"), ["build"], app(name), webEnv(port));
  }
  // Playwright starts testing as soon as the console answers, so the API must be up before the apps.
  await waitFor(`${E2E.api}/api/health`);
  // Run the standalone server exactly as the Docker image does (static + public copied next to it).
  for (const [name, port] of webApps) {
    const dist = path.join(app(name), ".next-e2e");
    const server = path.join(dist, "standalone", "apps", name);
    cpSync(path.join(dist, "static"), path.join(server, ".next-e2e", "static"), { recursive: true });
    cpSync(path.join(app(name), "public"), path.join(server, "public"), { recursive: true });
    start(name, process.execPath, ["server.js"], server, webEnv(port));
  }

  await waitFor(`http://127.0.0.1:${E2E.studentPort}/login`);
  await waitFor(`http://127.0.0.1:${E2E.consolePort}/login`);
  await waitFor(`http://127.0.0.1:${E2E.crmPort}/login`);
  console.log("[stack] ready");
} catch (e) {
  console.error("[stack]", (e as Error).message);
  await stop(1);
}
