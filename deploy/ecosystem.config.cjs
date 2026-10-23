// PM2 processes, (re)started by deploy/deploy.sh.
// Settings come from <repo>/.env through Node's --env-file, which is read again on every restart.
// Values in `env` below take precedence over the file.
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const envFile = `--env-file=${path.join(root, ".env")}`;
const common = { interpreter: "node", exp_backoff_restart_delay: 1000, time: true };

// API and worker run their TypeScript through tsx, as `pnpm dev` and the e2e stack do.
// `interpreter` must be "node" (PM2 would otherwise pick one from the .ts extension), and `cwd` is
// where `--import tsx` is resolved. The video cache defaults to <repo>/.media-cache, shared by both.
const fromSource = (name, app, env, killTimeout) => ({
  ...common,
  name,
  cwd: path.join(root, "apps", app),
  script: path.join(root, "apps", app, "src/index.ts"),
  node_args: [envFile, "--import", "tsx"],
  env: { NODE_ENV: "production", ...env },
  kill_timeout: killTimeout,
});

// Next.js standalone servers, staged in .live/ by deploy.sh. Loopback only: nginx is the way in.
const nextApp = (name, app, port) => ({
  ...common,
  name,
  cwd: path.join(root, ".live", app, "apps", app),
  script: path.join(root, ".live", app, "apps", app, "server.js"),
  node_args: [envFile],
  env: { NODE_ENV: "production", PORT: String(port), HOSTNAME: "127.0.0.1" },
  kill_timeout: 10_000,
});

module.exports = {
  apps: [
    fromSource("edge-api", "api", { PORT: "4000" }, 10_000),
    fromSource("edge-worker", "worker", {}, 30_000), // time for running jobs to finish
    nextApp("edge-student", "student", 3000),
    nextApp("edge-console", "console", 3001),
    nextApp("edge-crm", "crm", 3002),
  ],
};
