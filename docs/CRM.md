# CRM

The CRM is its own app for the sales team: `https://crm.edgeverse.ae` in production, `http://crm.localhost:3002`
in development (`apps/crm`). It tracks prospects ("leads") from first enquiry to a student account and ties every
lead to the enrollment and payment records that follow, so conversion and revenue per source are measured, not
estimated. It shares the API, the database and the staff accounts with the admin console; only the front door differs.

## Who can use it

Access is decided by permission keys on roles, exactly as in the admin console. Every CRM key starts with `crm.`:

| Permission | Lets a staff member |
|---|---|
| `crm.access` | sign in to the CRM app |
| `crm.read` | see leads, tasks and projects in scope |
| `crm.write` | create and edit leads, log activities, create and complete tasks, claim unassigned leads in scope |
| `crm.assign` | assign leads and tasks to other people inside the projects they manage |
| `crm.convert` | create the student account for a lead, link a lead to an existing student, resend the set-password email |
| `crm.all` | see every project and every lead |
| `crm.projects.manage` | create, edit and archive projects; choose project managers and members |
| `crm.manage` | CRM settings, CSV import, merging duplicates |
| `crm.staff.manage` | create and disable CRM staff, reset their passwords, give them CRM roles |
| `crm.roles.manage` | create and edit CRM roles |

System roles, re-applied by `migrate` on every deploy (clone a role under Team → Roles for a variant):

| Role | Permissions | Typical person |
|---|---|---|
| **CRM admin** (`crm_admin`) | every `crm.*` key | runs the sales organisation |
| **CRM manager** (`crm_manager`) | access, read, write, assign, convert, all, projects.manage, manage | creates projects and hands them to project managers |
| **Project manager** (`project_manager`) | access, read, write, assign, convert | runs the projects assigned to them |
| **Sales executive** (`sales_executive`) | access, read, write, convert | works their own leads and the project pool |

**Admin** and **Super admin** hold every key, so console admins can open the CRM at any time. The old **Sales** role
is retired: `migrate` moves its members to **Sales executive** and deletes it.

Two-factor authentication is mandatory in production for anyone with `admin.access` or `crm.staff.manage`
(they create accounts); it is optional for everyone else in the CRM.

### Creating sales staff

- **From the admin console** (Staff & roles): any roles, including a mix of academy and CRM roles. The welcome
  email points at the CRM login when the account holds only CRM roles, otherwise at the console.
- **From the CRM** (Team, needs `crm.staff.manage`): accounts that hold only CRM roles. A CRM admin can add them to
  projects at creation, reset passwords, disable accounts and edit CRM roles. Accounts that also hold academy roles
  are not listed there and must be managed from the console.

## Projects

A project is a sales campaign or pipeline with its own team: a name and code, an optional target course and batch,
dates, and numeric targets (leads, conversions). **Every lead belongs to exactly one project.**

- The seeded **General** project is the default: website enquiries land there, and every CRM user may work its
  unassigned leads. Managers move leads from it into projects.
- A project has **managers** (project managers; they see and run everything inside) and **members** (sales
  executives). Membership is set on the project page or when creating a CRM account.

What a person sees:

| Who | Leads | Tasks |
|---|---|---|
| `crm.all` (admin, CRM manager) | everything | everything |
| Project manager | every lead in their projects, plus their own leads elsewhere | every task in their projects, plus their own |
| Sales executive | their own leads, plus the unassigned pool of their projects and of General | tasks assigned to or created by them |

Executives **claim** an unassigned lead from the pool to make it theirs. Assigning to someone else needs
`crm.assign` and the target must be on the project's team (`crm.all` holders may assign anyone). Moving a lead to
another project (project managers of both projects, or `crm.projects.manage`) carries its open tasks along and keeps
the owner only if they are on the new team.

## Pipeline

`NEW → CONTACTED → QUALIFIED → CONSULTATION → NEGOTIATION → CONVERTED | LOST`

- Open stages can move forwards or backwards; `LOST` needs a reason (list editable in Settings) and can be reopened.
- `CONVERTED` is never set by hand: it is reached by **Convert to student**, **Link to student**, or automatically when a
  matching person signs up or pays on the student portal.
- Logging a call, WhatsApp, email or meeting on a `NEW` lead moves it to `CONTACTED` and stamps the first-response time.
- Temperature (Hot / Warm / Cold) is set by staff; the daily stale sweep turns leads Cold after `staleAfterDays` without activity.

## Everyday flow

1. **Capture**: Quick add (name + mobile/email), the full form (`/leads/new`), CSV import (`/import`), or the website
   form endpoint below. Each lead is created in a project; the owner defaults to the person creating it. Duplicates
   (same mobile or email on a live lead) are refused unless "Create anyway" is ticked; a contact that already has a
   student account is created already linked.
2. **Work**: the lead page has WhatsApp (`wa.me` with a greeting), call and email buttons; log what happened in the
   composer and schedule the next follow-up in the same step. Follow-ups are tasks on the board (below).
3. **Convert**: creates the portal account with the lead's name, email and mobile, optionally enrolls them in a batch,
   and emails a 7-day set-password link. The mobile stays "pending" until the student verifies it at first sign-in
   (press *Resend code* on the verification page). Without a batch the student joins the current batch after verification.
4. **Measure**: the dashboard (filterable by project) shows the funnel, untouched leads past the SLA, overdue tasks,
   win rate, median first response, per-project progress against targets, per-person workload, and leads / contacted /
   converted / **paid** per source. The project page shows the same for one project and its team. Students show
   their lead origin on the student page in the admin console, with a link into the CRM.

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

## Website lead form (public intake)

`POST https://api.edgeverse.ae/api/webhooks/leads/website` — server to server (the website backend, a form
service or an automation tool). Nothing is exposed until `LEAD_WEBHOOK_SECRET` is set (16+ characters).

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
  "utm": { "source": "instagram", "medium": "paid", "campaign": "oct-launch", "content": "reel-3", "term": "" }
}
```

`name` plus `phone` and/or `email` are required. `id` is the sender's own id for the submission; repeats with the same
`id` (or identical body) are ignored. A second enquiry from a known mobile/email is added to the existing lead's timeline
(and reopens it if it was lost) instead of creating a duplicate. `utm_source`/`utm_medium`/... flat keys are also accepted.

Responses: `200 {received, leadId, existing}`, `200 {received, duplicate: true}`, `401` bad signature, `400` malformed,
`422` no usable contact, `404` when the secret is not configured. Rate limit: 20 requests per minute per IP.

Example with curl:

```bash
BODY='{"id":"t1","name":"Test Lead","phone":"+971501234567","email":"t@example.com"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$LEAD_WEBHOOK_SECRET" | awk '{print $NF}')
curl -X POST https://api.edgeverse.ae/api/webhooks/leads/website -H "content-type: application/json" -H "x-edge-signature: $SIG" --data "$BODY"
```

New website leads go to the **General** project, unassigned; the project's managers (or, when it has none, everyone
with `crm.all`) are notified. With **round-robin** on in Settings, each new lead is handed to the team member with
the fewest open leads instead.

## CSV import

`/import` (needs `crm.manage`). First row = column names (case-insensitive). Recognised columns: `name`,
`phone` / `mobile` / `whatsapp`, `email`, `country`, `notes` / `message`, `tags`, `source detail` / `campaign`,
`language`. Up to 2,000 rows per file. Choose the project (and optionally an owner from its team) for the whole
file. Rows whose mobile or email already belongs to a lead or a portal account are skipped; nothing is overwritten.

## Scheduled jobs (Asia/Dubai)

| Job | When | What |
|---|---|---|
| crm.followUpDigest | 09:00 daily | one in-app note + email per assignee with tasks due today or overdue (once per day) |
| crm.batchUrgency | 09:15 daily | auto task when a lead's batch of interest starts within `batchUrgencyDays`; rolls interest from closed batches to the current one |
| crm.staleSweep | 09:30 daily | open leads with no activity for `staleAfterDays` become Cold |
| crm.inboxSweep | every 5 min | reprocesses website submissions that failed or stalled |
| crm.autoLink | on sign-up and on every successful payment | links the matching lead and marks it converted; adds "payment received" to its timeline |

Run any of them by hand in development: `curl -X POST localhost:4000/api/dev/jobs/crm.followUpDigest`.

## Settings (`/settings`)

First-response SLA (hours), stale-after days, batch urgency days (0 = off), round-robin assignment, lost reasons.
The webhook URL, whether the secret is configured and the default project are shown there too.

## Data

`crmProjects`, `leads` (one `projectId` each), `leadActivities` (append-only timeline), `crmTasks`,
`crmTaskComments`, `leadInboundEvents` (intake inbox). Every mutation is in the audit log (`lead.*`, `task.*`,
`project.*`, `crm.settings.update`, `staff.*`, `role.*`). Leads keep no unique index on phone or email on purpose:
duplicates are a real state, flagged on entry and resolved with **Merge duplicate**.

## Rolling out the CRM host (production)

1. Add the `A` record `crm` → the server's IP (no `AAAA`).
2. Set `CRM_APP_URL=https://crm.edgeverse.ae` in `.env` on the server.
3. `./deploy/setup.sh you@edgeverse.ae` (re-runnable): checks DNS, expands the HTTPS certificate to the new
   hostname, reloads nginx with the new server block.
4. `git pull && ./deploy/deploy.sh`: builds the CRM app, migrates (creates the CRM roles and the General project,
   retires the Sales role) and starts `edge-crm` on 127.0.0.1:3002.

## Roadmap (not built yet)

Custom board columns per project, campaign spend and cost per paid student, Meta Lead Ads ingestion, Twilio WhatsApp
Business messaging with inbound replies on the timeline, lead scoring, MailerLite nurture groups for lost/cold leads,
consultation booking on Google Meet, referral codes, payment links from the lead page.
