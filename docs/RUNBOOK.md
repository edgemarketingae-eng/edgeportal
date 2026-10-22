# Edge Academy: operations runbook

## 1. Hosting

| Piece | Where |
|---|---|
| MongoDB | MongoDB Atlas (replica set; transactions are required) |
| api, worker, student, console | One VPS, run by PM2 ([`deploy/ecosystem.config.cjs`](../deploy/ecosystem.config.cjs)) |
| redis, nginx | The same VPS, as system services ([`deploy/nginx.conf`](../deploy/nginx.conf); certificates from certbot) |

Suggested VPS: 4 vCPU, 16 GB RAM and 200 GB NVMe. The video cache can use up to `MEDIA_CACHE_MAX_GB`.
Setting up a server and deploying are described in [DEPLOYMENT.md](DEPLOYMENT.md).

### Hosts

| Host | Serves |
|---|---|
| `portal.edgeverse.ae` | student app |
| `console.edgeverse.ae` | staff portal and admin panel |
| `api.edgeverse.ae` | only `/api/health`, `/api/webhooks/*` (payment providers) and `/api/media/*` (signed video URLs) |

Everything else in the API is reached through the apps. Auth, OTP, Meet join and checkout return go through
each app's same-origin rewrite. The `/api/v1` data routes are called by the Next servers on 127.0.0.1 with
`INTERNAL_API_TOKEN`; nginx never exposes them.

### Deploying, updating and rollback

```bash
cd /var/www/edge-academy
git pull && ./deploy/deploy.sh                 # update
git checkout v1.2.0 && ./deploy/deploy.sh      # roll back to a tag (git checkout main to return)
```

`deploy.sh` installs, builds the two Next apps, runs `migrate`, restarts PM2 and checks health. `migrate` creates
collections and indexes, then applies the idempotent seed: roles, fee rates and the first super admin from
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. That admin must change the password and turn on two-factor at first
sign-in. Index changes are additive (`migrate` never drops indexes), so an older release runs against a newer
database.

### Services

| Service | Role |
|---|---|
| nginx | HTTPS for the three hosts; streams video unbuffered |
| edge-student, edge-console | Next.js standalone servers (ports 3000 and 3001, loopback only), served from `.live/` |
| edge-api | Express API on port 4000 (firewalled); serves cached recordings from `.media-cache` |
| edge-worker | BullMQ jobs: emails, Odoo, MailerLite, payment reconcile, auto-lock, reminders, recordings (uses ffmpeg) |
| redis | job queues (AOF persistence; `noeviction`) |

The video cache (`.media-cache` at the repo root) is shared by api (reads) and worker (fills).

### Scheduled jobs (Asia/Dubai)

| Job | When | What |
|---|---|---|
| enrollment.autolock | hourly at :05 | locks part-paid students after the due day ends |
| enrollment.reminders | 09:00 daily | balance reminders before the due date (offsets in Settings) |
| payments.reconcile | every 5 min | asks gateways about pending payments (missed webhooks) |
| payments.inboxSweep | every 5 min | reprocesses webhook events that failed or stalled |
| payments.expire | hourly at :20 | expires abandoned checkouts |
| odoo.sweep | every 15 min | re-queues payments still waiting for Odoo |
| google.discoverRecordings | every 15 min | finds Meet recordings of classes that ended in the last 48 h |
| recordings.cacheEvict | hourly at :40 | keeps the video cache under `MEDIA_CACHE_MAX_GB` |
| mailerlite.fullSync | 02:30 daily | full resync of consenting students |
| outbox.sweep | every minute | publishes any outbox rows not yet sent to Redis |

Jobs are at-least-once and every handler is idempotent. Emails, Odoo invoices and payment application are
deduplicated in the database, so a retry never double-sends or double-books.

## 2. Backups and restore

- **MongoDB:** Atlas continuous backup. Restore drill (before go-live, then quarterly): restore a snapshot to a
  new cluster, point a staging copy of the stack at it, and sign in.
- **Redis:** holds only queues. A lost Redis is rebuilt: the outbox sweeper republishes unsent jobs, and the
  reconcile and sweep schedules catch everything else.
- **Video cache:** disposable. The worker refills it from Drive on demand.
- Keep the server's `.env` in a password manager. Losing `BETTER_AUTH_SECRET` signs everyone out, and losing
  `MEDIA_SIGNING_SECRET` invalidates open video links.

## 3. Provider setup

Webhook URLs (replace the domain):

| Provider | Webhook URL | Notes |
|---|---|---|
| Stripe | `https://api.edgeverse.ae/api/webhooks/stripe` | events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`; signing secret → `STRIPE_WEBHOOK_SECRET` |
| Nomod | `https://api.edgeverse.ae/api/webhooks/nomod` | `charge.*` events; `whsec_` secret → `NOMOD_WEBHOOK_SECRET` |
| Tabby | `https://api.edgeverse.ae/api/webhooks/tabby` | register via Tabby's webhook API with header `x-edge-webhook-secret: <TABBY_WEBHOOK_HEADER_VALUE>` |
| Tamara | set automatically per checkout | notification token → `TAMARA_NOTIFICATION_TOKEN` |

Before go-live, run one low-value payment per method in each provider's sandbox and check that:

1. the student sees "Payment successful";
2. the enrollment moves to "Needs approval";
3. the payment appears in Admin > Payments;
4. the Odoo invoice is posted and paid.

Fee rates (Admin > Settings) must match each provider's contract. The seeded values are public list prices.

### Odoo (edge-verse.odoo.com)

1. The external API requires the Odoo Online **Custom** plan.
2. Create an API key for an accounting user (Preferences > Account Security > New API Key) and set
   `ODOO_URL`, `ODOO_DB` and `ODOO_API_KEY`.
3. With the accountant, create or pick:
   - a course product;
   - a "payment processing fee" product;
   - the 5% sales tax and the zero-rated export tax;
   - one clearing journal per payment provider, plus one for bank/cash.

   Enter their IDs in Admin > Settings > Odoo invoicing.
4. Each payment creates one customer invoice (ref = payment ID) with a course line and a processing-fee line.
   The invoice is posted and the payment registered. Failures show in Admin > Payments with a retry button.
   Payments made while Odoo is down sync later.

### Google Workspace (Meet + Drive)

1. In a Google Cloud project, enable the Google Calendar API, Google Meet REST API and Google Drive API.
2. Create a service account and a JSON key, then set `GOOGLE_SERVICE_ACCOUNT_JSON` (raw or base64).
3. In Workspace Admin > Security > API controls > Domain-wide delegation, add the service account's client ID
   with these scopes:
   `https://www.googleapis.com/auth/calendar.events, https://www.googleapis.com/auth/meetings.space.settings, https://www.googleapis.com/auth/meetings.space.readonly, https://www.googleapis.com/auth/drive.readonly`.
4. Meet settings:
   - allow external participants, because students have no Workspace accounts;
   - the edition must support recording (Business Standard or higher);
   - the participant limit must fit a batch.
5. Each mentor needs their Workspace email on their staff profile (Admin > Staff).
   - `GOOGLE_DEFAULT_ORGANIZER` hosts classes for staff without one.
   - It also reads pasted Drive links, so share recording files with it.
6. Classes are created with OPEN access and auto-recording. The Meet link is reachable only through the portal's
   join button, which opens before class (Settings), checks access and logs every join.

### Twilio Verify (mobile OTP)

Create a Verify service and enable SMS (and WhatsApp if wanted). Restrict geo permissions to the countries you
serve (AE, SA, ...). Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID`.
The API also throttles OTP sends per number and per IP.

### Email

- **Transactional email** goes through MailerSend. Verify the sending domain (SPF, DKIM, DMARC and return-path
  DNS records) and set `MAILERSEND_API_KEY` and `EMAIL_FROM`.
- **Broadcasts** use MailerLite: set `MAILERLITE_API_KEY`. The system maintains `Portal · ...` groups (all students,
  per batch, per status, per payment state) for students who gave marketing consent.

## 4. Everyday operations

- **Approvals:** Admin > Approvals lists paid students, oldest first.
- **Bank transfer / cash:** open the student and choose "Record payment". No processing fee is added; the payment syncs to Odoo.
- **Extend a due date / unlock:** open the student and use "Change due date" or "Unlock".
- **Payment stuck as pending:** open it in Admin > Payments and use "Re-check with gateway".
- **Recording not playing:** Admin > Recordings shows the cache state. Errors usually mean the Drive file is not
  shared with the host account.
- **Logs:** `pm2 logs edge-api --lines 200` (or `edge-worker`, `edge-student`, `edge-console`; files in
  `~/.pm2/logs`, rotated daily). API logs are JSON with a `requestId`, which matches the `x-request-id` response header.
- **Uptime monitoring:** point a checker at `https://api.edgeverse.ae/api/health`.

## 5. Go-live checklist

- [ ] Server `.env` complete, all modes live, secrets generated with `openssl rand -base64 48`
- [ ] Atlas: M10+, IP allow-list = VPS, continuous backup on, restore drill done
- [ ] DNS + HTTPS working for all three hosts; `/api/health` OK; `https://api.../api/v1/me` returns 404
- [ ] Super admin signed in, changed password, two-factor on; staff accounts created with roles
- [ ] Course and batch (fee, advance amounts, due rule, WhatsApp link) created and marked current
- [ ] Fee rates confirmed against contracts; VAT settings confirmed by the accountant
- [ ] One sandbox payment per method end to end, including the Odoo invoice
- [ ] Twilio OTP received on a UAE and a KSA number
- [ ] Test class scheduled; signed-out external join works on desktop and mobile; recording discovered and plays
- [ ] MailerSend domain verified; test emails received (not in spam)
