#!/usr/bin/env bash
# Build and (re)start Edge Academy. On the server, from the repo root:
#   git pull && ./deploy/deploy.sh
# First time on a new server: ./deploy/setup.sh, then fill in .env (see docs/DEPLOYMENT.md).
set -euo pipefail
cd "$(dirname "$0")/.."

APPS=(student console crm)
fail() { echo "✗ $*" >&2; exit 1; }
step() { echo; echo "▸ $*"; }

step "Preflight"
[ -f .env ] || fail ".env not found. Run: cp deploy/env.production.example .env && chmod 600 .env, then fill it in"
grep -qx 'NODE_ENV=production' .env || fail ".env must contain the line NODE_ENV=production"
for c in node pnpm pm2 ffmpeg redis-cli curl; do
  command -v "$c" >/dev/null || fail "$c not found. Run ./deploy/setup.sh first"
done
[ "$(node -p 'Number(process.versions.node.split(".")[0]) >= 24')" = true ] || fail "Node 24+ required (found $(node -v))"
[ "$(redis-cli ping 2>/dev/null)" = PONG ] || fail "Redis is not answering on 127.0.0.1:6379 (sudo systemctl status redis-server)"

step "Installing dependencies"
# Dev dependencies too: next build and tsx need them. CI=true avoids pnpm's interactive prompts;
# the MONGOMS flag skips the test-only MongoDB binary download.
env -u NODE_ENV CI=true MONGOMS_DISABLE_POSTINSTALL=1 pnpm install --frozen-lockfile

# Everything from here runs as production. Never `source .env`: every process reads it with
# Node's --env-file, and PM2 would freeze shell values.
export NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
unset NEXT_DIST_DIR DEV_ROUTES

step "Building the student, console and CRM apps (the live site keeps running)"
pnpm --filter @edge/student --filter @edge/console --filter @edge/crm --workspace-concurrency=1 build

step "Staging the new builds"
# next build empties .next when it starts, so the servers run from a copy in .live/.
mkdir -p .live
for app in "${APPS[@]}"; do
  rm -rf ".live/$app.new"
  cp -a "apps/$app/.next/standalone" ".live/$app.new"
  cp -a "apps/$app/.next/static" ".live/$app.new/apps/$app/.next/static"
  cp -a "apps/$app/public" ".live/$app.new/apps/$app/public"
done

step "Migrating the database (indexes + seed; also checks .env)"
# Fails on a bad .env or an unreachable database, before anything running is touched.
pnpm --filter @edge/api migrate

step "Restarting"
for app in "${APPS[@]}"; do
  rm -rf ".live/$app"
  mv ".live/$app.new" ".live/$app"
done
pm2 startOrRestart deploy/ecosystem.config.cjs
pm2 save >/dev/null

step "Health checks"
wait_for() {
  for _ in $(seq 60); do
    if curl -fs -o /dev/null --max-time 5 "$1"; then echo "  ✓ $1"; return; fi
    sleep 2
  done
  fail "$1 is not answering. See: pm2 logs --lines 100"
}
wait_for http://127.0.0.1:4000/api/health
wait_for http://127.0.0.1:3000/login
wait_for http://127.0.0.1:3001/login
wait_for http://127.0.0.1:3002/login

pm2 status
echo
echo "✓ Deployed $(git rev-parse --short HEAD 2>/dev/null || echo 'working tree')"
