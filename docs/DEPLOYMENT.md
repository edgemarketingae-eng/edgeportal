# Edge Academy: deployment

One Ubuntu 24.04 VPS runs everything; the database is MongoDB Atlas. After the one-time setup below, every
deploy is:

```bash
cd /var/www/edge-academy && git pull && ./deploy/deploy.sh
```

Operations (jobs, backups, provider details, everyday admin tasks) are in [RUNBOOK.md](RUNBOOK.md).

## What runs where

| Hostname | Serves | On the server |
|---|---|---|
| `portal.edgeacademy.ae` | Student portal | PM2 `edge-student` on 127.0.0.1:3000 |
| `console.edgeacademy.ae` | Staff portal and admin panel | PM2 `edge-console` on 127.0.0.1:3001 |
| `crm.edgeacademy.ae` | Sales CRM ([CRM.md](CRM.md)) | PM2 `edge-crm` on 127.0.0.1:3002 |
| `api.edgeacademy.ae` | Only `/api/health`, `/api/webhooks/*` and `/api/media/*` (signed video links); everything else is 404 | PM2 `edge-api` on :4000 |
| (none) | Background jobs, schedules, recordings | PM2 `edge-worker` |

nginx terminates HTTPS (certbot certificate) and proxies the four hosts. Redis holds the job queues. Everything
is configured from one file, `.env` at the repo root. The files behind this live in [`deploy/`](../deploy):

| File | What it is |
|---|---|
| `deploy/setup.sh` | One-time server setup: packages, firewall, Redis, PM2 on boot, HTTPS certificate, nginx site |
| `deploy/deploy.sh` | Every deploy: install, build, migrate, restart, health check |
| `deploy/ecosystem.config.cjs` | The five PM2 processes |
| `deploy/nginx.conf` | The nginx site (linked into `/etc/nginx/sites-enabled` by `setup.sh`) |
| `deploy/env.production.example` | Template for the server's `.env` |

## First-time setup

### 1. DNS

At the DNS host for `edgeacademy.ae`, add four `A` records pointing to the VPS public IPv4 address:
`portal`, `console`, `crm` and `api` (TTL 300). Don't add `AAAA` records. If the zone is on Cloudflare, set the records
to **DNS only** (grey cloud). If the zone has `CAA` records, add `0 issue "letsencrypt.org"`.

### 2. MongoDB Atlas

1. Cluster: **M10 or larger**, in the region closest to the VPS.
2. Security → Database Access: user `edge_app`, password from `openssl rand -hex 24`, role `readWrite` on database `edge`.
3. Security → Network Access: add the VPS IP as `x.x.x.x/32`. Never `0.0.0.0/0`.
4. Connection string, **with `/edge` after the host** (without it the app silently uses a database called `test`):
   `mongodb+srv://edge_app:<PASSWORD>@<cluster>.mongodb.net/edge?retryWrites=true&w=majority&appName=edge-academy`
5. Backup: turn on Continuous Cloud Backup. Turn on Termination Protection.

### 3. Server login

Log in as root once, create the `edge` user with your SSH key, then use only that user:

```bash
adduser edge && usermod -aG sudo edge
mkdir -p /home/edge/.ssh && cp ~/.ssh/authorized_keys /home/edge/.ssh/
chown -R edge:edge /home/edge/.ssh && chmod 700 /home/edge/.ssh && chmod 600 /home/edge/.ssh/authorized_keys
```

After confirming `ssh edge@<VPS_IP>` works, turn off password and root logins:

```bash
printf 'PasswordAuthentication no\nPermitRootLogin no\n' | sudo tee /etc/ssh/sshd_config.d/99-hardening.conf
sudo systemctl restart ssh
```

### 4. Get the code

The repository must be on GitHub (private). On the server, as `edge`, create a read-only deploy key:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/edge_deploy -N "" && cat ~/.ssh/edge_deploy.pub
```

Add it in GitHub: repository → Settings → Deploy keys (leave "Allow write access" off). Then:

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/edge_deploy\n' >> ~/.ssh/config
sudo mkdir -p /var/www/edge-academy && sudo chown $USER:$USER /var/www/edge-academy
git clone git@github.com:<ORG>/<REPO>.git /var/www/edge-academy
```

### 5. Set up the server (once)

```bash
cd /var/www/edge-academy
./deploy/setup.sh you@edgeacademy.ae      # email for certificate expiry notices
```

It installs Node 24, pnpm, PM2, Redis, nginx, certbot and ffmpeg, enables the firewall (SSH, HTTP, HTTPS only),
adds swap, makes PM2 start on boot, gets the HTTPS certificate (or expands it when a hostname was added later),
enables the nginx site and creates `.env` from
the template. It stops with a message if DNS doesn't point at the server yet; fix that and run it again (it's
safe to re-run).

If your provider has its own firewall (Hostinger: hPanel → VPS → Firewall), allow ports 22, 80 and 443 there
too, or leave it off.

### 6. Fill in `.env`

```bash
nano .env
```

Fill in every empty value. The comments in the file explain each one. Generate the secrets with:

```bash
for k in INTERNAL_API_TOKEN BETTER_AUTH_SECRET MEDIA_SIGNING_SECRET; do echo "$k=$(openssl rand -base64 48)"; done
echo "TABBY_WEBHOOK_HEADER_VALUE=$(openssl rand -hex 32)"
echo "LEAD_WEBHOOK_SECRET=$(openssl rand -hex 32)"
```

- `MONGODB_URI`: the connection string from step 2 (with `/edge`).
- `GOOGLE_SERVICE_ACCOUNT_JSON`: the key file as one line, from `base64 -w0 service-account.json`.
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`: the first super admin (password 12+ characters).
- Keep `PAYMENTS_MODE=sandbox` with test keys until the test pass is done (see [Going live](#going-live)).

Save a copy of `.env` in the password manager.

### 7. Deploy

```bash
./deploy/deploy.sh
```

The first run takes several minutes. It ends with `pm2 status` and `✓ Deployed <commit>`. If a step fails, it
stops there and says why; the site keeps running on the previous version.

### 8. Check it works

```bash
curl -s https://api.edgeacademy.ae/api/health                                      # {"ok":true,"db":"up",...}
curl -s -o /dev/null -w '%{http_code}\n' https://api.edgeacademy.ae/api/v1/me     # 404 (must not be public)
sudo certbot renew --dry-run                                                     # renewal works
```

Open `https://portal.edgeacademy.ae`, `https://console.edgeacademy.ae` and `https://crm.edgeacademy.ae` in a browser.
Optionally `sudo reboot` and check that `pm2 status` shows all five processes online afterwards.

### 9. First sign-in

1. Sign in at `https://console.edgeacademy.ae/login` with the seed admin. Change the password and set up two-factor
   (admin pages stay locked until you do). Store the backup codes.
2. In `.env`, set `SEED_ADMIN_PASSWORD=` (empty). It's only needed while no staff account exists.
3. Admin → Settings: organisation details (the seeded defaults mention `edgeacademy.ae`), fee rates, Odoo IDs.
   Then create staff, the course and the current batch. See [RUNBOOK §3](RUNBOOK.md#3-provider-setup).
4. Sales staff (CRM roles) sign in at `https://crm.edgeacademy.ae/login`. Roles, projects and the board are
   described in [CRM.md](CRM.md).

## Going live

Webhook URLs to register with the payment providers:

| Provider | Webhook URL |
|---|---|
| Stripe | `https://api.edgeacademy.ae/api/webhooks/stripe` |
| Nomod | `https://api.edgeacademy.ae/api/webhooks/nomod` |
| Tabby | `https://api.edgeacademy.ae/api/webhooks/tabby` |
| Tamara | none to register: sent with every checkout |
| Website lead form | `https://api.edgeacademy.ae/api/webhooks/leads/website` (signed with `LEAD_WEBHOOK_SECRET`, see [CRM](CRM.md)) |

Events, secrets and the other providers (Twilio, MailerSend, Google, Odoo, MailerLite) are in
[RUNBOOK §3](RUNBOOK.md#3-provider-setup). With test keys, run one payment per method end to end. Test payments
still create real Odoo invoices, so agree on that with the accountant first.

To switch to real payments, edit `.env`:

- `PAYMENTS_MODE=live` and every provider's **live** keys.
- `STRIPE_WEBHOOK_SECRET` from the **live-mode** Stripe endpoint (it differs from the test one); re-register the
  Tabby webhook with the live key.
- `TAMARA_API_URL=https://api.tamara.co`. The template pins it to the sandbox, so Tamara would stay in test mode.

Then `pm2 restart all`, and make one real low-value payment per method (refund it afterwards).

## Updating and rollback

```bash
cd /var/www/edge-academy
git pull && ./deploy/deploy.sh                 # update to the latest main
git checkout v1.2.0 && ./deploy/deploy.sh      # roll back to a tag (git checkout main to return)
```

The live site keeps running while it installs, builds and migrates. Only the final restart interrupts it, for a
few seconds. Deploy outside class times.

| You changed | Run |
|---|---|
| Code (a new release) | `git pull && ./deploy/deploy.sh` |
| A value in `.env` | `pm2 restart all` (a redeploy also works) |
| `deploy/nginx.conf` | `sudo nginx -t && sudo systemctl reload nginx` |
| `deploy/ecosystem.config.cjs` | `pm2 delete all && ./deploy/deploy.sh` |

## Everyday commands

```bash
pm2 status                         # are all five online?
pm2 logs edge-api --lines 200      # logs (also edge-worker, edge-student, edge-console, edge-crm)
pm2 restart edge-worker            # restart one process
pm2 monit                          # live CPU / memory
sudo systemctl status nginx redis-server
df -h /                            # disk (the video cache uses up to MEDIA_CACHE_MAX_GB)
pnpm store prune                   # free disk from old package versions
```

## Troubleshooting

Start with `pm2 status` and `pm2 logs <name> --lines 100`.

| Symptom | Fix |
|---|---|
| `deploy.sh` stops at Preflight | Do what the message says (missing `.env`, `NODE_ENV=production` line, or a tool that `setup.sh` installs) |
| `Invalid environment configuration:` during migrate | The message lists each bad key (a `mock` mode, an empty or `dev-…` secret, a malformed URL). Fix `.env`, run `deploy.sh` again |
| `Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD…` | First deploy: set both (password 12+ characters) |
| `MongoServerSelectionError … SSL alert number 80` | The VPS IP isn't in Atlas Network Access (or the entry is still Pending, or in another project). Get it with `curl -4 ifconfig.me` and add it as `/32` |
| `bad auth : authentication failed` | Wrong Atlas user or password; use a hex password so nothing needs URL-encoding |
| `querySrv ENOTFOUND` / `ETIMEOUT` | The server's resolver can't look up SRV records. Set `DNS=1.1.1.1 8.8.8.8` in `/etc/systemd/resolved.conf`, then `sudo systemctl restart systemd-resolved` |
| Data shows up in a database called `test` | `/edge` is missing from `MONGODB_URI` |
| `setup.sh`: "resolves to … expected …" | DNS isn't pointing at the server yet. Wait for the A records, re-run |
| Certificate request fails | DNS wrong, port 80 blocked by a provider firewall, Cloudflare proxy on, or a CAA record. Fix, re-run `setup.sh` |
| `502 Bad Gateway` | The app behind that host is down: `pm2 status`, then `pm2 logs` for it |
| Sign-in loops back to login, or `403 Invalid origin` | `STUDENT_APP_URL` / `CONSOLE_APP_URL` / `CRM_APP_URL` must be exactly `https://portal.edgeacademy.ae` / `https://console.edgeacademy.ae` / `https://crm.edgeacademy.ae`; then `pm2 restart all` |
| CRM password-reset email links to the student portal | `CRM_APP_URL` is missing or wrong in `.env` (the API only trusts the hosts it knows); fix it, `pm2 restart all` |
| Payment stays pending | Check the provider's webhook delivery log and `pm2 logs edge-api`; use Admin → Payments → "Re-check with gateway" |
| Tamara stays in test mode after go-live | `TAMARA_API_URL` still points at the sandbox |
| Build killed (`exit code 137`) | Out of memory. `setup.sh` adds 4 GB swap; check `free -h` |
