#!/usr/bin/env bash
# One-time server setup for Ubuntu 24.04. Safe to re-run. From the repo root, as the deploy user:
#   ./deploy/setup.sh you@edgeverse.ae        (email for certificate expiry notices)
# Installs Node 24, pnpm, PM2, Redis, nginx, certbot and ffmpeg; turns on the firewall; gets the
# HTTPS certificate; enables deploy/nginx.conf. Then: fill in .env and run ./deploy/deploy.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
EMAIL="${1:?usage: ./deploy/setup.sh <email for certificate expiry notices>}"
# The same hostnames are in deploy/nginx.conf and in .env (*_APP_URL, API_PUBLIC_URL).
DOMAINS=(portal.edgeverse.ae console.edgeverse.ae api.edgeverse.ae)
step() { echo; echo "▸ $*"; }

step "Packages"
node -v 2>/dev/null | grep -q '^v24\.' || curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get update -q
sudo apt-get install -y nodejs redis-server nginx certbot python3-certbot-nginx ffmpeg ufw curl
# pnpm then switches itself to the version in package.json "packageManager".
command -v pnpm >/dev/null || sudo npm install -g pnpm@10.26.0
command -v pm2 >/dev/null || sudo npm install -g pm2

step "Redis: keep queues on disk (eviction stays at the default noeviction, which BullMQ needs)"
if ! sudo grep -q '^appendonly yes' /etc/redis/redis.conf; then
  redis-cli CONFIG SET appendonly yes >/dev/null
  sudo sed -i 's/^appendonly no/appendonly yes/' /etc/redis/redis.conf
fi
sudo systemctl enable --now redis-server >/dev/null

step "Swap and memory overcommit"
if [ -z "$(swapon --show)" ]; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
echo 'vm.overcommit_memory = 1' | sudo tee /etc/sysctl.d/99-edge.conf >/dev/null
sudo sysctl -q --system

step "Firewall: SSH, HTTP and HTTPS only (keeps ports 3000, 3001 and 4000 private)"
sudo ufw allow OpenSSH >/dev/null
sudo ufw allow 'Nginx Full' >/dev/null
sudo ufw --force enable

step "PM2: start on boot, rotate logs"
sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null
[ -d "$HOME/.pm2/modules/pm2-logrotate" ] || pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M >/dev/null
pm2 set pm2-logrotate:retain 14 >/dev/null
pm2 set pm2-logrotate:compress true >/dev/null

step "DNS: the three hostnames must point at this server"
ip=$(curl -4fsS https://ifconfig.me)
for d in "${DOMAINS[@]}"; do
  got=$(getent ahostsv4 "$d" | awk 'NR==1{print $1}' || true)
  if [ "$got" != "$ip" ]; then
    echo "✗ $d resolves to '${got:-nothing}', expected $ip. Add the A record, wait a few minutes, re-run."
    exit 1
  fi
done
echo "  ✓ all point at $ip"

step "HTTPS certificate"
# certonly: certbot gets and renews the certificate but never edits deploy/nginx.conf.
if ! sudo test -d /etc/letsencrypt/live/edge-academy; then
  domain_args=()
  for d in "${DOMAINS[@]}"; do domain_args+=(-d "$d"); done
  sudo certbot certonly --nginx --non-interactive --agree-tos -m "$EMAIL" \
    --cert-name edge-academy "${domain_args[@]}" --deploy-hook "systemctl reload nginx"
fi

step "nginx site"
sudo ln -sfn "$ROOT/deploy/nginx.conf" /etc/nginx/sites-enabled/edge-academy
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

if [ ! -f .env ]; then
  install -m 600 deploy/env.production.example .env
  echo
  echo "Created .env from deploy/env.production.example."
fi
echo
echo "✓ Server ready. Next: fill in .env (nano .env), then run ./deploy/deploy.sh"
