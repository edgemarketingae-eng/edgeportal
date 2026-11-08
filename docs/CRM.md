# CRM

The CRM is its own app for the sales team: `https://crm.edgeacademy.ae` in production, `http://crm.localhost:3002`
in development (`apps/crm`). It tracks prospects ("leads") from first enquiry to a student account and ties every
lead to the enrollment and payment records that follow, so conversion and revenue per source are measured, not
estimated. It shares the API, the database and the staff accounts with the admin console; only the front door differs.

## Who can use it

Access is decided by permission keys on roles, exactly as in the admin console. Every CRM key starts with `crm.`:

| Permission              | Lets a staff member                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `crm.access`            | sign in to the CRM app                                                                                   |
| `crm.read`              | see leads, tasks and projects in scope                                                                   |
| `crm.write`             | create and edit leads, log activities, create and complete tasks, claim unassigned leads in scope        |
| `crm.assign`            | assign leads and tasks to other people inside the projects they manage                                   |
| `crm.convert`           | create the student account for a lead, link a lead to an existing student, resend the set-password email |
| `crm.all`               | see every project and every lead                                                                         |
| `crm.projects.manage`   | create, edit and archive projects; choose project managers and members                                   |
| `crm.manage`            | CRM settings, CSV import, merging duplicates                                                             |
| `crm.staff.manage`      | create and disable CRM staff, reset their passwords, give them CRM roles                                 |
| `crm.roles.manage`      | create and edit CRM roles                                                                                |
| `crm.commission.manage` | set commission rates, verify or reject broker deposits, see everyone's commission                        |
| `crm.calls.read`        | see the Calls report for the team                                                                        |
| `crm.devices.manage`    | see the team's phones and remove a lost one                                                              |

System roles, re-applied by `migrate` on every deploy (clone a role under Team → Roles for a variant):

| Role                                    | Permissions                                                                                    | Typical person                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **CRM admin** (`crm_admin`)             | every `crm.*` key                                                                              | runs the sales organisation                         |
| **CRM manager** (`crm_manager`)         | access, read, write, assign, convert, all, projects.manage, manage, calls.read, devices.manage | creates projects and hands them to project managers |
| **Project manager** (`project_manager`) | access, read, write, assign, convert, calls.read                                               | runs the projects assigned to them                  |
| **Sales executive** (`sales_executive`) | access, read, write, convert                                                                   | works their own leads and the project pool          |

`crm.write` also covers marking product conversions and logging broker deposits; removing a conversion and managing
products need `crm.manage`. `crm.commission.manage` is held by CRM admins (every `crm.*` key), Admin and Super admin,
not by CRM managers.

**Admin** and **Super admin** hold every key, so console admins can open the CRM at any time. The old **Sales** role
is retired: `migrate` moves its members to **Sales executive** and deletes it.

Two-factor authentication is mandatory in production for anyone with `admin.access` or `crm.staff.manage`
(they create accounts); it is optional for everyone else in the CRM.

### Creating sales staff

- **From the admin console** (Staff & roles): any roles, including a mix of academy and CRM roles. The welcome
  email points at the CRM login when the account holds only CRM roles, otherwise at the console.
- **From the CRM** (Team, needs `crm.staff.manage`): accounts that hold only CRM roles. A CRM admin can add them to
  projects at creation, reset passwords, change the sign-in email, disable and delete accounts and edit CRM roles.
  Accounts that also hold academy roles are not listed there and must be managed from the console.
- **Changing the sign-in email** (`changeStaffEmail`, both apps): password, sessions and 2FA stay; unused password
  reset links die. Someone still on their invitation gets it again at the new address; everyone else gets a notice at
  the new address and one at the old address with the new one masked. Only a super admin may change a super admin's
  email or the email of someone whose roles open HR. Audited as `staff.email.change`.
- **Deleting an account** (`DELETE` typed, both apps): only a disabled account that nothing names. Leads it owns,
  converted or created, deposits, conversions, calls, tasks and comments, an HR record or HR entries made for others,
  batches it mentors, classes, enrollment approvals, payments recorded, files and work updates all block. Sessions,
  phones, notifications and project team places go with it; audit and timeline entries stay and show "Deleted user".
  Nobody deletes themselves, only a super admin deletes a super admin, and the last super admin stays.

## Projects

A project is a sales campaign or pipeline with its own team: a name and code, an optional target course and batch,
dates, and numeric targets (leads, conversions). **Every lead belongs to exactly one project.**

- The seeded **General** project is the default: server-to-server website webhook enquiries and leads added without a
  project land there, and every CRM user may work its unassigned leads. Managers move leads from it into projects.
- **None of the public pages use General.** The portal landing page sends new leads to `FREE-COURSE-MAL`; the
  contact page and Forex Growth Hub to `FREE-COURSE-SUPPORT` (codes in `packages/services/src/crm/landing.ts`). A
  paused project still receives them. Only if the project is missing or archived does a lead fall back to General,
  and everyone with `crm.projects.manage` gets an in-app alert ("Project … is missing", at most once an hour).
- Moving the existing General leads (one-off, run on the server; a dry run unless `--apply`):
  `pnpm --filter @edge/api move-general-leads` then `pnpm --filter @edge/api move-general-leads -- --apply`
  (`--to CODE` for another project; default `FREE-COURSE-MAL`). Every lead in General moves with its owner and open
  tasks, gets a PROJECT_CHANGED timeline entry, and one audit entry records the batch. Running it again moves only
  what has landed in General since.
- A project has **managers** (project managers; they see and run everything inside) and **members** (sales
  executives). Membership is set on the project page or when creating a CRM account.
- A project **sells** a set of products (see Products and conversions); its leads can only be marked converted to
  those. General sells every product and keeps no list.

What a person sees:

| Who                            | Leads                                                                      | Tasks                                        |
| ------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------- |
| `crm.all` (admin, CRM manager) | everything                                                                 | everything                                   |
| Project manager                | every lead in their projects, plus their own leads elsewhere               | every task in their projects, plus their own |
| Sales executive                | their own leads, plus the unassigned pool of their projects and of General | tasks assigned to or created by them         |

Executives **claim** an unassigned lead from the pool to make it theirs. Assigning to someone else needs
`crm.assign` and the target must be on the project's team (`crm.all` holders may assign anyone). Moving a lead to
another project (project managers of both projects, or `crm.projects.manage`) carries its open tasks along and keeps
the owner only if they are on the new team.

## Pipeline

`NEW → CONTACTED → QUALIFIED → CONSULTATION → NEGOTIATION → CONVERTED | LOST`

- Open stages can move forwards or backwards; `LOST` needs a reason (list editable in Settings) and can be reopened.
- `CONVERTED` is never set with the stage buttons: it is reached by **Mark conversion** (any product, see below),
  **Convert to student**, **Link to student**, or automatically when a matching person signs up or pays on the student
  portal. `convertedAt` is the first conversion; later ones keep it. A lead already converted to a product can still be
  converted to (or linked to) a student.
- Logging a call, WhatsApp, email or meeting on a `NEW` lead moves it to `CONTACTED` and stamps the first-response time.
- Temperature (Hot / Warm / Cold) is set by staff; the daily stale sweep turns leads Cold after `staleAfterDays` without activity.

## Everyday flow

1. **Capture**: Quick add (name + mobile/email), the full form (`/leads/new`), CSV import (`/import`), or the website
   form endpoint below. Each lead is created in a project; the owner defaults to the person creating it. Duplicates
   (same mobile or email on a live lead) are refused unless "Create even if a lead with this contact already exists" is ticked; a contact that already has a
   student account is created already linked.
2. **Work**: the lead page has WhatsApp (`wa.me` with a greeting), call and email buttons; log what happened in the
   composer and schedule the next follow-up in the same step. Follow-ups are tasks on the board (below). The
   **Qualification** card holds the free-text answers to the three sales questions (trading experience and capital;
   job and salary or business, plus debts; purpose of learning trading). Language is a dropdown (Malayalam, Tamil,
   English, Hindi, Other) and every lead has a **JetaFX client ID** (the affiliate broker), searchable from the list.
3. **Convert**: creates the portal account with the lead's name, email and mobile, optionally enrolls them in a batch,
   and emails a 7-day set-password link. The mobile stays "pending" until the student verifies it at first sign-in
   (press _Resend code_ on the verification page). Without a batch the student joins the current batch after verification.
4. **Measure**: the dashboard (filterable by project) shows the funnel, untouched leads past the SLA, overdue tasks,
   win rate, median first response, per-project progress against targets, per-person workload, and leads / contacted /
   converted / **paid** per source. The project page shows the same for one project and its team. Students show
   their lead origin on the student page in the admin console, with a link into the CRM.

## Products and conversions

A **product** is something a lead can convert to: Inner Circle (opened a JetaFX account and deposited the minimum),
the premium course (became a student) and the premium online clubs (Wealth Circle, F1 Club…). `migrate` inserts these
four once; CRM managers and admins add, rename and archive them under **Products** (`/products`, `crm.manage`).
Products are never deleted.

- **Products belong to projects** (many to many; sales teams are split by language, and not every team sells
  everything). A lead can only be marked converted to the products its project sells; **General sells every product**
  and has no list. `crm.manage` holders (CRM managers and admins) set the link from either side: **Projects that sell
  it** in the product dialog, or **Products** on the project form. Project managers see their project's products but
  can't change them; the phone app only shows them. New projects start with no products (the project page says so).
  Projects that existed before this (2026-11-05) were given every product once by `migrate`, to be trimmed by hand.
- The list is checked on the server (`markConversions`) and the lead page's `options.products` is already the
  project's list, so phones get it without an app update. Archived products and projects keep their links.
- Conversions stay where they were made: moving a lead keeps its conversions (and the leaderboard counts them for the
  old project); from then on the new project's products apply. The student course (below) is recorded wherever the
  lead is, because it isn't a salesperson's choice.
- Staff mark one or more conversions on the lead page (**Conversions → Conversion**). The CRM records no rules about
  the product (minimum deposit etc.); marking it is the sales team's call. Each product converts once per lead.
- The first conversion moves the lead to `CONVERTED`. Each conversion is credited to the **lead owner at that moment**
  (the person marking it when the lead is unassigned) and the owner is notified if someone else marked it.
- One product can be the **student course**: every path that makes a lead a student (convert, link, auto-link on
  sign-up or payment, a lead created for an existing student) records a conversion to it. Flagging a product as the
  student course backfills leads that are already students.
- Removing a conversion needs `crm.manage`. Removing the lead's last one (when it isn't a student) reopens the lead at
  the stage it had before.
- Converted leads drop out of the default Open view; the **Converted to** filter on Leads lists one product's leads
  (every product, whatever the project).
- With one project chosen, the dashboard's and leaderboard's product columns are that project's products, plus any
  product converted there in the period.

## Deposits and commission

Sales log each deposit a lead makes at JetaFX on the lead page (**Deposits → Deposit**): 1st, 2nd or later deposit,
amount in **USD**, date (not in the future), optional broker reference. The JetaFX client ID is required; when the lead
has none, the dialog asks for it and saves it on the lead. A lead has at most one 1st and one 2nd deposit that isn't
rejected.

- A new deposit is **Pending** and earns nothing. Commission managers are notified and verify it against the JetaFX
  report on **Deposits** (`/deposits`), or reject it with a reason (a verified deposit the broker reversed can be
  rejected too, which removes its commission). Pending deposits can be deleted by whoever logged them, the person
  credited, or a commission manager.
- Commission = the rate for the deposit's sequence (Settings, **Commission on JetaFX deposits**: 1st / 2nd / later, in
  percent) × the amount, rounded half up to a cent. The rate is copied onto the deposit when it is verified, so later
  rate changes only affect deposits verified afterwards.
- The commission goes to the **lead owner when the deposit was logged** (the logger when unassigned); reassigning the
  lead later doesn't move it.
- Commission is private: the API returns it only to commission managers and to the person credited. Executives see
  their own on Deposits and the Leaderboard; CRM admins see everyone's on the Leaderboard and each person's total on
  their Team page.
- Leads with deposits can't be deleted (commission history). Merging moves deposits and conversions to the survivor.

## Leaderboard

`/leaderboard` (everyone with `crm.read`) ranks every active sales executive, plus anyone else credited with a
conversion, for a period (this month by default, last month, this quarter, this year, all time; Dubai calendar) and
optionally one project. Rank = product conversions credited in the period, ties broken by verified deposit volume
(deposit date in the period). It also shows conversions per product, new leads owned (created in the period), how many
of those converted, and, for commission managers only, commission. The cards on top show the viewer's own figures.

## Tasks and the board

Tasks (`/tasks`) are the CRM's to-do list: follow-ups on a lead, or standalone work inside a project. A task has a
type (call, WhatsApp, email, meeting, other), a priority (low / medium / high / urgent), an optional due date and
time (Dubai), an assignee, a description and comments.

- **Board** (default): columns **To do → In progress → Waiting → Done**. Drag a card between columns to change its
  status, or inside a column to reorder. Dragging into Done marks the task done without an outcome; cancelled tasks
  leave the board. Done shows the last 7 days.
- **List** (`/tasks?view=list`): open tasks grouped by Overdue / Today / This week / Later / No date, and a Closed tab.
- The **Done** dialog on a lead follow-up records the call outcome and a note on the lead's timeline and can schedule
  the next follow-up in one step. A lead's "next follow-up" is the earliest open task with a due date.
- The Tasks badge in the navigation counts the viewer's tasks due today or earlier.
- Filters: project, assignee, priority. Project managers see their whole project; executives their own tasks.

## Phone app

Sales staff and managers also have an Android app (`apps/mobile`, installed as an APK, see [installing it](CRM-APP.md)). It's
built around the day: **Today** (follow-ups due, new leads oldest first, the pool to claim), **Leads**, **Tasks**, and **Me**
(this month's commission and figures, then **Work**: Dashboard, Projects, Deposits and Leaderboard). Tapping **Call** dials
straight away; when the call ends a sheet asks how it went, with a suggested outcome, and saves the note, stage and next
follow-up in a couple of taps, even with no signal.

The app covers the day-to-day CRM, with the same permissions as the web: the whole lead page including editing, assigning,
moving, converting and deleting; tasks with comments; projects and their teams; deposit review; and the dashboard. Staff
accounts, roles, CSV import and export, CRM settings, product setup, commission rates, bulk actions, merging leads, deleting
projects and the Calls report are web-only.

Notes and finished tasks save with no signal and send later. Other changes need a connection, so nobody overwrites a colleague's
newer change.

### Call tracking

Tracking is a quiet extra, not the app's purpose. It's one optional switch at first sign-in, on by default, and after that it
lives under **Me > Settings**. The app reads the phone's call log: number, direction, start time and length. It records no
audio.

- **Only calls with leads are stored.** Numbers are matched exactly on `Lead.phone` and `Lead.altPhones`, across all leads.
  Anything else is dropped by the API and never saved or logged, because company phones also carry personal calls.
- **WhatsApp and Telegram calls aren't tracked.** Coming back from WhatsApp offers the same sheet, so they can be logged by hand.
- Calls from before someone signed in are never read.
- When several leads share a number, the call goes to the lead dialled from the app, otherwise the caller's own lead, then one
  they can see, then an open one, then the most recently active. It's kept even on a lead the caller can't see (a lead may
  have been reassigned before the upload arrived), but the phone is only told about leads they can see.

### One call, one timeline entry

The phone uploads in the background and may repeat itself, and the sheet can be saved before or after the upload. Both go
through `saveCall` (`packages/services/src/crm/calls.ts`). A call is one `LeadCall`, unique on person, number and start time,
with one `LeadActivity` pointing at it. The timeline entry is never edited: the outcome, note and length live on the
`LeadCall` and are filled in when the timeline is read.

A sheet saved before the call log has a row (still on the call, or tracking off) is marked `estimated`, and the real row
replaces its time and length when it arrives.

Logging the same call by hand on the web gives a second entry. Talk time only counts tracked calls, so reports aren't inflated.

### What a call does to the lead

Tracked calls use the call's own time and never move a date backwards, because uploads can be late.

- An outgoing call counts as contact even if unanswered, the same as logging "No answer" by hand: it stamps the first
  response and moves `NEW` to `CONTACTED`.
- An answered incoming call counts too. A missed or declined one only updates the last activity.
- A call from before the lead existed appears on the timeline and changes nothing.
- **Connected** means the executive chose Answered or Asked to call back, otherwise 5 seconds or longer. A voicemail pickup can
  count as connected.

Merging moves the calls to the survivor and keeps the merged lead's number in its `altPhones`, so later calls still match.

### Calls report

`/calls` (needs `crm.calls.read`) shows calls, connected calls, talk time and leads called per person, today, for the last 7
days, this month or last month (Dubai calendar). Sales executives are listed even at zero, so someone not calling stands out.
Project managers see their own projects' calls.

People with `crm.devices.manage` also see each phone: **Tracking**, **Tracking off** (the permission was turned off),
**Not syncing** (nothing for 24 hours) or **No phone**, and **Remove** for a lost phone. Turning tracking off doesn't lock the
app or warn the executive: the app shows **Off** under **Me > Settings**, and the manager sees it here.

### Phone access

The app calls `api.edgeacademy.ae` directly with a device token, not a Better Auth session.

- A token is random, stored only as a hash in `crmDevices`, and doesn't expire: a tracker that quietly stops after 30 days is
  worse than a long-lived token that can be revoked. It's revoked by signing out, signing in on another phone (one live phone
  per person), a password change or reset, disabling the account, or **Remove** on `/calls`.
- `/api/v1` stays closed. A device token only reaches paths under `/crm`, `/mobile`, `/me` and `/notifications`, and within
  those only the routes in `deviceRoutes` (`packages/contracts/src/mobile.ts`); everything else is 404, whatever the person's
  role. Staff, role, import, bulk, delete, merge and commission routes aren't on the list. Add to it deliberately.
- Sign-in is `POST /api/v1/mobile/auth/sign-in`, email and password, limited to 20 per minute per address and 5 failures per
  15 minutes per account. An authenticator code goes in the same request. Staff accounts have no `phoneNumber`, so mobile sign-in isn't offered.

### Alerts

Sent through Firebase Cloud Messaging: a lead assigned to you, a follow-up due now, a known lead enquiring again, a deposit
verified or rejected. Bulk assign and CSV import send one summary per person. A missed call from a lead and the prompt to add
an outcome come from the phone itself. Until Firebase is set up (`PUSH_MODE=live`), alerts only go to the worker log.

## Claude connector (MCP)

Staff and admins can connect Claude (claude.ai, the Claude desktop and phone apps, Claude Code) to the CRM and work in it by
chatting. Claude acts **as the person, with exactly their CRM permissions and projects**. The in-app guide is the docs
module **Connect Claude** (`/docs/claude`); each person's page is **Connect Claude** (`/claude`) in the sidebar.

- **Address:** `https://api.edgeacademy.ae/mcp` (Streamable HTTP, stateless, JSON responses). Everyone uses the same address.
- **Switch:** CRM Settings → **Claude** → _Let CRM users connect Claude_ (setting `crm.claude`, off by default, `crm.manage`).
  Off stops every connection at once without deleting it. `MCP_ENABLED=false` (then `pm2 restart edge-api`) takes `/mcp` and its
  OAuth endpoints away entirely.
- **Sign-in:** OAuth 2.1 with PKCE and dynamic client registration, served by the API with the MCP SDK's `mcpAuthRouter` and our
  provider (`apps/api/src/mcp/provider.ts`, services in `packages/services/src/mcp/`). Better Auth is not involved.
  `/authorize` sends the browser to the CRM's consent page `crm.edgeacademy.ae/connect?request=…`, where the person signs in as
  usual (two-factor and password-change rules apply), sees what Claude may and may not do, can tick _Read only_, and chooses
  **Allow** or **Deny**. Clients are public (no secret). Redirects must be in `MCP_ALLOWED_REDIRECTS` (Claude's own callbacks,
  plus `loopback` for apps on the person's computer). A request lasts 10 minutes, a code 5 minutes and works once (a replayed
  code revokes the connection it made), access tokens last `MCP_ACCESS_TOKEN_MINUTES` (60), refresh tokens
  `MCP_REFRESH_TOKEN_DAYS` (30) and rotate (an old one reused after a minute revokes the connection). Only hashes are stored.
- **Tools:** about 50 tools (`apps/api/src/mcp/tools/`, the `TOOLS` list), each a thin front for one or two CRM routes. A tool runs by
  calling the real API route over loopback with the person's Claude token plus the internal token, so validation, permissions,
  project scope and the audit trail are the web's. The API gate admits a Claude token only together with the internal token (so it's
  useless straight against the public `/api/v1/crm`), only under `/crm`, and `register()` only to the routes in `mcpRoutes`
  (`packages/contracts/src/claude.ts`); a read-only connection only to GETs. People see only the tools their permissions allow.
  Never reachable: staff accounts and roles (their rows carry temporary passwords), password resets and email changes, CSV
  import/export, the website-forms allowlist, and the Claude switch and connections themselves. A test keeps `TOOLS` and `mcpRoutes`
  in step. Deletes, merges, bulk changes and commission rates are marked destructive, so Claude asks first; bulk delete takes ids
  only (at most 100). Times are Dubai local time both ways and amounts USD.
- **Attribution:** changes through Claude are the person's, with `via: "CLAUDE"` on `auditLogs` and `leadActivities` (shown as
  "via Claude" on the lead timeline, the phone app and the console audit log). Approving and connecting are audited
  (`claude.approve` with IP and browser, `claude.connect`, `claude.disconnect`, `crm.claude.update`).
- **Ending a connection:** **Disconnect** on `/claude` (your own) or in Settings (anyone's, `crm.manage`); a password change or reset,
  disabling the account or deleting it ends them all (`revokeUserAccess`, which also signs out phones).
- **Limits:** 120 MCP requests a minute per connection, 240 API calls a minute per connection; OAuth endpoints per IP (Anthropic's
  servers send everyone's sign-ins, so they're above the SDK defaults).
- **Collections:** `mcpClients` (registered apps; unapproved ones expire after a day), `mcpAuthRequests` (consent requests and codes),
  `mcpGrants` (connections), `mcpTokens` (token hashes, TTL).
- **Testing locally:** `claude mcp add --transport http edge-crm http://localhost:4100/mcp` against the e2e stack (not `pnpm dev`,
  whose `.env` points at production), then `/mcp` → Authenticate; or the MCP Inspector (`npx @modelcontextprotocol/inspector`,
  Streamable HTTP, Quick OAuth Flow; its `localhost:6274` callback counts as loopback). To try claude.ai before production, tunnel
  the API to an https address and set `API_PUBLIC_URL` to it.

## Website forms (public intake)

Two ways in, both with the same field names. The in-app guide for web teams (URL, fields, HTML/fetch/curl/Node samples)
is the CRM docs module **Website forms & API** (`/docs/website-forms`, CRM admins and managers).

### Browser forms: `POST https://api.edgeacademy.ae/api/public/leads`

For any HTML or JavaScript form on an allowed website. No secret (the page is public), so:

- Only allowed websites: `PUBLIC_FORM_ORIGINS` (server env) plus the list CRM admins keep under **Settings → Website
  forms** (setting `crm.formOrigins`, origins only, HTTPS; `http://localhost` only outside production). The list is
  cached for a minute per API process. Any other browser origin gets `403` (so does `Origin: null`, e.g. a file opened
  from disk); requests without an Origin (servers) pass. The same list governs CORS for all of `/api/public`.
- Rate limited to 10 per 10 minutes per visitor IP; a hidden honeypot field `website` gets a fake success and saves
  nothing.
- Body: JSON, or `application/x-www-form-urlencoded` (a plain `<form method="post">`, or `fetch` with
  `new URLSearchParams(new FormData(form))`). Multipart is refused (`415`). Fields as the webhook below (minus `id`),
  plus `redirect`. In a form, `tags` may be comma separated and `consent`/`whatsappConsent` are checkboxes (`on`).
  `country` that isn't a two-letter code is ignored.
- Answers: `fetch` and servers get `200 { ok: true }` (never the lead id, never whether the person was already a lead),
  or the usual `{ error: { code, message, fieldErrors } }` with `400` (fields), `422` (no readable phone and no email),
  `429`. A browser form post (urlencoded and preferring HTML) is redirected `303` to `redirect` when that is a page on
  an allowed website (on an error with `?error=invalid` or `?error=rate_limited` added), otherwise it sees a small
  thank-you or error page. `redirect` is never followed off the allowed websites.
- Each submission is stored in the lead inbox (`leadInboundEvents`, source `website`, `signatureOk: false`, payload with
  `_via: "form"`, `_ip`, `_origin`) under the id `form:<Dubai day>:<sha256 of the fields>`, so the same form sent twice
  on one day counts once and the sweeper retries a failed one. A refused one stays refused.

### Server to server: `POST https://api.edgeacademy.ae/api/webhooks/leads/website`

For the website backend, a form service or an automation tool. Nothing is exposed until `LEAD_WEBHOOK_SECRET` is set
(16+ characters).

Authentication, either header:

- `x-edge-signature: <hex HMAC-SHA256 of the raw request body using LEAD_WEBHOOK_SECRET>` (preferred)
- `x-edge-lead-token: <LEAD_WEBHOOK_SECRET>` (for tools that cannot sign)

Body (JSON):

```json
{
  "id": "form-submission-123",
  "name": "Amy Khan",
  "phone": "+971 50 123 4567",
  "email": "amy@example.com",
  "country": "AE",
  "message": "Interested in the November batch",
  "course": "FX-PRO",
  "page": "https://edgeacademy.ae/forex-pro",
  "language": "English",
  "tags": ["webinar-oct"],
  "consent": true,
  "whatsappConsent": true,
  "utm": { "source": "instagram", "medium": "paid", "campaign": "oct-launch", "content": "reel-3", "term": "" },
  "project": "FREE-COURSE-MAL"
}
```

`name` plus `phone` and/or `email` are required. `language` is free text, matched to Malayalam, Tamil, English or
Hindi (anything else is stored as Other). `id` is the sender's own id for the submission; repeats with the same
`id` (or identical body) are ignored. A second enquiry from a known mobile/email is added to the existing lead's timeline
(and reopens it if it was lost) instead of creating a duplicate. `utm_source`/`utm_medium`/... flat keys are also accepted.

Responses: `200 {received, leadId, existing}`, `200 {received, duplicate: true}`, `401` bad signature, `400` malformed,
`422` no usable contact, `404` when the secret is not configured. Rate limit: 20 requests per minute per IP.

Example with curl:

```bash
BODY='{"id":"t1","name":"Test Lead","phone":"+971501234567","email":"t@example.com"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$LEAD_WEBHOOK_SECRET" | awk '{print $NF}')
curl -X POST https://api.edgeacademy.ae/api/webhooks/leads/website -H "content-type: application/json" -H "x-edge-signature: $SIG" --data "$BODY"
```

### Where new leads go (both ways)

New website leads go to the **General** project, unassigned; the project's managers (or, when it has none, everyone
with `crm.all`) are notified. With **round-robin** on in Settings, each new lead is handed to a sales executive
instead (same rule as below; the owner is notified). If there are no sales executives it stays unassigned as above.

`project` (optional, any case) puts a **new** lead in the project with that code instead, with that project's team in
the round-robin; a known lead stays where it is. An unknown code goes to General **quietly** (outside input, so a typo
or a bot can't flood the admins); an archived project's code goes to General and alerts the project admins once an
hour, like the landing pages' projects.

## Chat channel (WhatsApp or Telegram)

Landing pages send each visitor straight to a sales executive's chat. Each staff member has a **chat channel**
(CRM → Team → the person → "Chat with leads on"): **WhatsApp** (uses their phone) or **Telegram** (uses their
Telegram username, e.g. `@edge_sara`). Move someone to Telegram when their WhatsApp number is at risk of a ban
from too many new chats; their leads and every later visitor follow at once.

- Telegram needs a username (5–32 letters, numbers or `_`; `@name` and `t.me/name` are accepted). The console's
  staff form doesn't show these fields and leaves them as they are.
- A sales executive can receive landing page leads only if they can be reached on their channel: a phone for
  WhatsApp, a username for Telegram ("reachable"). Otherwise round-robin skips them, and a visitor whose lead they own
  is handed to someone reachable (as for an owner who is Off).
- Links: WhatsApp `https://wa.me/<digits>?text=…`, Telegram `https://t.me/<username>?text=…`, with the visitor's
  first message typed in. The fallback (no reachable owner) is always the academy's Support WhatsApp.
- The SYSTEM timeline entry says where the visitor was sent (`data.channel`, plus `data.whatsapp` or `data.telegram`).

## Free class landing page

The student app's home page (`/`, public) has "Contact support" buttons. The visitor enters name and WhatsApp number;
the student app's server action calls `POST /api/v1/public/free-class/leads` (internal token only, so nothing is exposed
on the public API host; rate limited to 10 per 10 minutes per visitor IP; a hidden honeypot field drops bots).

- The lead goes through the same intake as the website form (`ingestInboundLead`): source WEBSITE, detail "Free live
  class landing page", tag `free-live-class`, the ad's UTM tags, WhatsApp consent.
- A new lead goes to the **Free Course Malayalam** project (code `FREE-COURSE-MAL`) and is always round-robined
  among the **reachable** sales executives on its team (see Chat channel), whatever the Settings checkbox. A known lead keeps its owner; an unowned one is assigned the same way.
- An existing owner who is Off, disabled or not reachable hands the lead to a reachable sales executive (ASSIGNED
  activity); with nobody available the owner is kept and the visitor goes to Support WhatsApp.
- Response: `{ ok, contactUrl, channel, contactName }`. The visitor is sent to the owner's WhatsApp or Telegram with a
  message ready to send, so they write first. A SYSTEM entry on the timeline tells the owner to expect it. With no
  eligible owner the academy's Support WhatsApp from console Settings is used; with neither, the visitor just sees a
  thank-you.
- The class title, Dubai date/time and platform come from console Settings → Free live class.

## Forex Growth Hub forms

The Forex Growth Hub (`growthhub.edgeverse.ae`, a static site with the recorded free classes) posts straight from the
browser to `POST https://api.edgeacademy.ae/api/public/growth-hub/leads` from its Inner Circle form (`enroll.html`,
after the enrollment is saved to the Google Sheet). The endpoint also takes a general enquiry (`intent: "enquiry"`);
the site had a hero contact form for it, removed on 2026-10-29. There is no secret, because the page is public.
Instead:

- Only allowed site origins: `PUBLIC_FORM_ORIGINS` (comma-separated) plus the websites allowed in CRM Settings (see
  Website forms above). Any other browser origin gets `403`, and the CORS preflight is answered for the listed ones only.
- It is rate limited to 10 per 10 minutes per visitor IP, and a hidden honeypot field (`website`) drops bots.

Body (JSON): `intent` (`enquiry`, the default, or `inner-circle`), `name`, `whatsapp` (required), `phone` (the call
number, optional), `email`, `jetaFxClientId`, `page`, `utm{}`. Response: `{ ok, contactUrl, channel, contactName }`.

- The lead takes the same path as the free class landing page above, with one difference: a **new** lead goes to the
  **Free Course support** project (code `FREE-COURSE-SUPPORT`).
  - Source WEBSITE, detail "Forex Growth Hub" (or "Forex Growth Hub · Inner Circle"), tag `growth-hub` (plus
    `inner-circle`), WhatsApp consent.
  - It is round-robined among the **reachable** sales executives on that project's team.
  - A paused project still receives leads. If it is missing or archived, the lead goes to General instead, the API
    logs an error and the project admins get an in-app alert.
  - A known lead stays in its own project and keeps its owner; an owner who is Off or not reachable hands it to
    someone else on that project.
  - With no eligible owner (for example nobody on the team is reachable), the lead is left unassigned and the
    visitor goes to Support WhatsApp.
- The lead's phone is the **WhatsApp number**. A different call number is written to the notes (or, for a known
  lead, the INBOUND entry), and either number finds a known lead.
- Inner Circle requests also save the email and the JetaFX client id on the lead (if it has none yet) and note the
  request.
- The visitor is sent to the owner's chat with a message ready to send: "I watched the free trading classes on Forex
  Growth Hub…" (enquiry) or "I have created my JetaFX account (Client ID: …). Please add me to the Inner Circle."
  The SYSTEM timeline entry has `data.landing: "growth-hub"` or `"growth-hub-inner-circle"`.

## Round-robin

One rule everywhere (`packages/services/src/crm/round-robin.ts`): sales executives get **one lead each, in turn**,
however many leads they already hold. Each project saves whose turn was last (`Project.roundRobinLastId`, in user id
order), so the rotation carries on across single leads, batches and restarts, and every path below shares it. Each turn
is one atomic update, so leads arriving at the same time go to different people. Eligible people are active users (not
disabled) with the **Sales executive** role who are on the project's team (managers or members). In the General project
(open to everyone) that is every active sales executive. Project managers, CRM managers and admins don't receive
round-robin leads unless they also hold the Sales executive role. People marked **Off** (`StaffProfile.available = false`,
the Team page switch in the CRM or the staff page in the console) are skipped everywhere round-robin runs and rejoin at
their usual place when they're back, with no catch-up leads. They stay in owner filters and manual assign pickers
(labelled "(Off)").

Used by: bulk assign on the leads list (_Round-robin to sales executives_; each lead within its own project; leads in
projects with no sales executives are skipped and counted), CSV import (_Round-robin to the project's sales
executives_; refused when the project has none; a skipped row doesn't use up a turn), website leads when the Settings
checkbox is on, and free class landing leads (always, limited to sales executives with a phone).

## CSV import

`/import` (needs `crm.manage`). First row = column names (case-insensitive). Recognised columns: `name`,
`phone` / `mobile` / `whatsapp`, `email`, `country`, `notes` / `message`, `tags`, `source detail` / `campaign`,
`language` (Malayalam, Tamil, English or Hindi; anything else becomes Other), `jetafx` / `jetafx id` / `client id`. Up to 2,000 rows per file. Choose the project and the owner for the whole file: unassigned, one person
from its team, or round-robin to its sales executives. Numbers without a +code are read with the row's own `country`
(must be a valid 2-letter code) or else the chosen _Country for numbers without a +code_ (default United Arab
Emirates; "None" marks such numbers invalid). Local numbers are never silently assumed to be UAE. Rows whose mobile
or email already belongs to a lead or a portal account are skipped; nothing is overwritten.

## Scheduled jobs (Asia/Dubai)

| Job                | When                                       | What                                                                                                                              |
| ------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| crm.followUpDigest | 09:00 daily                                | one in-app note + email per assignee with tasks due today or overdue (once per day)                                               |
| crm.batchUrgency   | 09:15 daily                                | auto task when a lead's batch of interest starts within `batchUrgencyDays`; rolls interest from closed batches to the current one |
| crm.staleSweep     | 09:30 daily                                | open leads with no activity for `staleAfterDays` become Cold                                                                      |
| crm.inboxSweep     | every 5 min                                | reprocesses website submissions that failed or stalled                                                                            |
| crm.dueReminders   | every minute                               | phone alert when a follow-up comes due; once per due time, so rescheduling re-arms it; automatic tasks are skipped                |
| crm.autoLink       | on sign-up and on every successful payment | links the matching lead and marks it converted; adds "payment received" to its timeline                                           |

Run any of them by hand in development: `curl -X POST localhost:4000/api/dev/jobs/crm.followUpDigest`.

## Settings (`/settings`)

First-response SLA (hours), stale-after days, batch urgency days (0 = off), round-robin assignment, lost reasons.
The browser form URL with the allowed websites (`crm.formOrigins`, editable; `PUBLIC_FORM_ORIGINS` shown read-only),
the webhook URL, whether the secret is configured and the default project are shown there too. Commission managers also
see the commission rates per deposit (setting `crm.commission`, stored as fractions).

## Super-admin deletes

`records.delete` is held by the super admin role only: `admin` and `crm_admin` don't get it, `saveRole` strips it
from custom roles and the role editors don't offer it. Every delete goes through `GET/POST /api/v1/records/:type/:id/
delete-check|delete` (body `{ confirm: "DELETE" }`), one `Deleter` per type in `packages/services/src/records/`. The
check lists blockers, what goes with the record and warnings; the delete re-checks inside its transaction, writes the
whole record to the audit `before` (pay figures redacted), then runs storage and notification steps after commit.
Phones can't reach these routes. In the CRM: tasks with their comments, comments, note/contact timeline entries (not
pipeline history or tracker entries), tracked calls older than a day (phones re-send recent ones), products nobody
converted to and not one of the seeded defaults, roles nobody holds, deposits of any status (a verified later deposit
re-rates its month with `rerateLaterMonth`; commission already paid on a closed payslip comes back through the next
month's adjustment) and projects with a team still on them. Lead delete keeps its own rules: delete the deposits first,
and a lead linked to a student stays until the student is deleted. See the console docs ("Deleting records") for the
academy and HR side.

## Data

`crmProjects` (`productIds`: what it sells, ignored on General), `leads` (one `projectId` each; `productIds` mirrors the lead's conversions; `altPhones` holds other numbers),
`leadActivities` (append-only timeline), `leadCalls` (tracked calls with leads), `crmDevices` (signed-in phones),
`crmTasks`, `crmTaskComments`, `leadInboundEvents` (intake inbox), `crmProducts`,
`leadConversions` (one per lead and product, with the credited person), `leadDeposits` (amounts in cents, status,
commission rate and amount fixed at verification). Lead language used to be free text; `migrate` maps old values onto
the dropdown codes. Every mutation is in the audit log (`lead.*` including
`lead.conversion.*` and `lead.deposit.*`, `task.*`, `project.*`, `product.*`, `crm.settings.update`,
`crm.commission.update`, `staff.*`, `role.*`, `device.*`, `claude.*`). Leads keep no unique index on phone or email on purpose:
duplicates are a real state, flagged on entry and resolved with **Merge duplicate**.

## Rolling out the CRM host (production)

1. Add the `A` record `crm` → the server's IP (no `AAAA`).
2. Set `CRM_APP_URL=https://crm.edgeacademy.ae` in `.env` on the server.
3. `./deploy/setup.sh you@edgeacademy.ae` (re-runnable): checks DNS, expands the HTTPS certificate to the new
   hostname, reloads nginx with the new server block.
4. `git pull && ./deploy/deploy.sh`: builds the CRM app, migrates (creates the CRM roles and the General project,
   retires the Sales role) and starts `edge-crm` on 127.0.0.1:3002.

## Roadmap (not built yet)

Custom board columns per project, campaign spend and cost per paid student, Meta Lead Ads ingestion, Twilio WhatsApp
Business messaging with inbound replies on the timeline, lead scoring, MailerLite nurture groups for lost/cold leads,
consultation booking on Google Meet, referral codes, payment links from the lead page.
