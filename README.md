# Edge Academy

Student portal, staff portal and admin panel for Edge Trading Academy (Phase 1).

- **Students** sign up with email + password and a verified mobile (Twilio Verify OTP). They are placed in the
  current batch and pay in full or an advance (Stripe, Nomod, Tabby, Tamara). Access starts after admin approval.
  Part-paid access locks automatically after the balance due date and unlocks when the balance is paid.
  Fully-paid students keep lifetime access to their batch recordings and to live classes of later batches.
- **Mentors** schedule Google Meet classes for their batches and manage recordings, which are streamed from Google Drive.
- **Admins** approve students and manage batches and fees. They also record bank or cash payments, watch the Odoo
  invoice sync, and manage staff, roles and settings. Every sensitive change is in the audit log.
- **Sales** work in a separate CRM app: leads grouped into projects with their own teams, a drag-and-drop task
  board, and one-click conversion of a lead into a student account. See [docs/CRM.md](docs/CRM.md).

## Architecture

A pnpm + Turborepo monorepo:

```
apps/api        Express 5 API: Better Auth, /api/v1 routes, webhooks, media streaming, Meet join, checkout return
apps/worker     BullMQ workers and cron schedules (Asia/Dubai)
apps/student    Next.js 16 student portal       (student.localhost:3000 in dev)
apps/console    Next.js 16 staff portal + admin (console.localhost:3001 in dev)
apps/crm        Next.js 16 sales CRM               (crm.localhost:3002 in dev)
packages/domain        pure business rules: fees, enrollment state machine, entitlements, dates, money, permissions
packages/contracts     Zod request/response schemas and route definitions shared by API and apps
packages/db            Mongoose models, indexes, transactions (withTx / lockForUpdate), seed, test harness
packages/integrations  Stripe, Nomod, Tabby, Tamara, mock gateway; Odoo, Google, Twilio, email, MailerLite
packages/services      DB-backed use cases shared by the API and the worker
packages/jobs          queue names, payloads, producer, transactional outbox
packages/ui            shadcn/ui components, Edge brand theme, app shell, form helpers
packages/web           Next.js glue: server API client, form-action helpers, browser auth client
packages/config        tsconfig and ESLint presets (including import boundaries)
tools/devdb            local MongoDB replica set for development
e2e                    Playwright journeys against an isolated stack
deploy                 server setup + deploy scripts, PM2 processes, nginx site, production env template
```

How the pieces talk:

- **Browser to app.** Each Next app is the only origin its browser talks to (sessions are per host, so a person signs in to the console and to the CRM separately). `/api/auth/*`, `/api/v1/auth/*`,
  `/api/join/*` and `/api/checkout/return/*` are rewritten to the API, so session cookies stay on the app's own host.
- **App to API.** Server Components and Server Actions call the internal `/api/v1/*` routes with
  `INTERNAL_API_TOKEN` and the forwarded session cookie (`@edge/web/server`). `/api/v1` is not exposed publicly.
- **Public API host.** It serves only health, payment webhooks and signed video URLs (`/api/media/*`).
- **Side effects.** Emails, jobs and notifications are written to an outbox inside the database transaction.
  They are published to BullMQ after commit; a sweeper republishes anything missed.
- **Import boundaries.** The Next apps may import only `domain`, `contracts`, `ui` and `web`. ESLint enforces this.

The key rules live in `packages/domain/src/enrollment/{machine,entitlements}.ts` and `packages/domain/src/payments/fees.ts`.

## Local development

Requirements: Node 24, pnpm 10, Redis on `127.0.0.1:6379` (`brew install redis && brew services start redis`).
MongoDB runs from the repo; nothing is installed system-wide.

```bash
pnpm install
cp .env.example .env                 # optional: the defaults already work (everything mocked)
pnpm dev:db                          # terminal 1: MongoDB replica set rs0 on :27017 (data in .data/mongo)
pnpm --filter @edge/api migrate      # once: indexes + seed (roles, fee rates, demo course/batch, demo staff)
pnpm dev                             # terminal 2: api :4000, worker, student :3000, console :3001, crm :3002
```

`pnpm dev` and `npx turbo dev` are the same thing. Open <http://student.localhost:3000>,
<http://console.localhost:3001> and <http://crm.localhost:3002>. Use the `.localhost` names: the apps keep
separate session cookies per host.

Demo accounts (development seed only, password `ChangeMe!2026`): `admin@edgeacademy.local` (super admin),
`admissions@edgeacademy.local`, `finance@edgeacademy.local`, `mentor@edgeacademy.local`; for the CRM
`crm-admin@edgeacademy.local`, `pm@edgeacademy.local` (project manager) and `sales@edgeacademy.local` (sales executive).

## Environment variables

Each environment has exactly one place for its settings:

| You run | Settings come from | Template |
|---|---|---|
| `pnpm dev` / `npx turbo dev` | `.env` at the repo root (optional) | [`.env.example`](.env.example) |
| `pnpm --filter @edge/api migrate` | the same root `.env` | |
| `pnpm check` / `pnpm test` | nothing to set; each test suite sets its own values (`*/test/setup.ts`) | |
| `pnpm test:e2e` | nothing to set; [`e2e/stack.ts`](e2e/stack.ts) configures its isolated stack | |
| Production (PM2 on the VPS) | `.env` at the repo root on the server, read by every process | [`deploy/env.production.example`](deploy/env.production.example) |

**Development (`.env` at the repo root).** All five apps read the one file:
- the API and worker through `--env-file-if-exists=../../.env` in their `package.json` scripts;
- the student, console and CRM apps through `next.config.ts`.

Turborepo itself never loads `.env` files; it only hashes this one so builds are rebuilt when it changes.
Variables already exported in your shell win over the file, and anything unset falls back to a built-in default.
Restart `pnpm dev` after editing `.env`.

**The defaults mock every integration:**
- the OTP code is always `000000`;
- emails are printed by the worker;
- every gateway opens a test checkout page;
- Meet links are fake, and every Drive file is served from `fixtures/sample.mp4`.

To try a real provider locally, set its `*_MODE` to `sandbox` and fill in its keys in `.env`.
Every variable and its default is defined in [`packages/services/src/env.ts`](packages/services/src/env.ts).

**Tests ignore `.env` on purpose.** Your local keys can never leak into a test run, and the tests behave the same
on every machine.

**Production.** Copy `deploy/env.production.example` to `.env` at the repo root on the server and fill in every value.
In production the API refuses to start if any integration is still in mock mode or a secret still has its development
default. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

**Rules that apply everywhere:**
- `INTERNAL_API_TOKEN` must be identical for the API and the three Next apps.
- `API_INTERNAL_URL` is compiled into the Next apps' rewrites at build time, so set it before `next build`
  (`deploy/deploy.sh` builds with the server's `.env`; the default `http://127.0.0.1:4000` is right there).

## Tests

```bash
pnpm check        # typecheck + lint + unit/integration tests (MongoMemoryReplSet; Redis db 15 for job tests)
pnpm test:e2e     # Playwright: builds and starts an isolated stack (ports 3100/3101/3102/4100, in-memory MongoDB, Redis db 14)
```

To iterate on e2e tests, keep the stack running in one terminal with `pnpm --filter @edge/e2e stack`
(`E2E_SKIP_BUILD=1` reuses the last build) and run `E2E_REUSE_STACK=1 pnpm test:e2e` in another.

## Deployment

One VPS (PM2 + nginx + Redis) and MongoDB Atlas. After the one-time setup, every deploy is:

```bash
git pull && ./deploy/deploy.sh
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the setup, and [docs/RUNBOOK.md](docs/RUNBOOK.md) for operations,
provider setup and the go-live checklist.
