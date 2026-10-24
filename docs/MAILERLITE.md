# Edge Academy: MailerLite setup

MailerLite holds the academy's marketing list. Staff write and send campaigns (news, webinar invites) in MailerLite.
The portal only keeps the list up to date: it adds students who agreed to marketing emails and sorts them into
`Portal · ` groups by batch, enrollment status and payment state. Steps 1–3 are required.

Transactional email (receipts, password resets, reminders) does not use MailerLite. It goes through MailerSend
([RUNBOOK §3](RUNBOOK.md#3-provider-setup)).

The API client is in `packages/integrations/src/mailerlite/client.ts`. The rules for who goes into which group are in
`packages/services/src/mailerlite/sync.ts`. Syncs run in the worker (`edge-worker`).

## Who is synced

Only students are synced, and only when both of these are true:

- their mobile number is verified;
- they ticked "Send me academy news and webinar invites by email and WhatsApp". The box is on the sign-up form
  (ticked by default) and on the Profile page.

Admin > Students > (student) shows whether a student consented and when.

When a student unticks the box, the portal marks them **Unsubscribed** in MailerLite. They stay in MailerLite's list,
which stops MailerLite from emailing them again.

Staff and CRM leads are not synced. The CRM lead form has an "Agreed to marketing emails (MailerLite)" box, but it
only records consent; sending leads to MailerLite is on the [CRM roadmap](CRM.md#roadmap-not-built-yet).

## Groups the portal manages

| Group | Who is in it |
|---|---|
| `Portal · All students` | Every synced student |
| `Portal · Batch <code>` | Students whose current enrollment is in that batch |
| `Portal · No batch` | Students with no current enrollment |
| `Portal · Status: <status>` | One of: Awaiting payment, Awaiting approval, Active, Locked, Rejected, Cancelled |
| `Portal · Payment: <state>` | One of: Unpaid, Advance paid, Fully paid |

The portal creates each group the first time a student needs it. Do not create them by hand. To email a group, pick
it (or several) as the campaign's recipients.

Rules for the groups:

- **The portal owns every group whose name starts with `Portal · `** (with the middle dot). Each sync adds and
  removes the student to match the portal. Any change you make to these groups by hand is undone at the next sync.
- **Do not rename or delete a `Portal · ` group.** The portal finds groups by name. After a rename it creates a new
  group with the original name. After a delete, syncs fail until the worker restarts (see Troubleshooting).
- **Groups without the prefix are never touched.** Create your own groups (for example "Webinar leads") freely, even
  with portal students in them.

## When syncs happen

| Trigger | When the sync runs |
|---|---|
| Any enrollment change: created (right after phone verification, if a batch is open), paid, approved, locked, and so on | About 30 seconds later |
| Student saves the Profile page | About 30 seconds later |
| Nightly full sync (`mailerlite.fullSync`) | 02:30 Dubai time, for every student who consented or was synced before |

Changes to the same student within those 30 seconds are combined into one sync. A failed sync retries by itself up to
6 times, waiting longer each time (starting at 30 seconds). The nightly run catches anything missed. There is no
"resync" button in the console.

A student who verifies their number while no batch is open has no enrollment yet. They reach MailerLite at the next
nightly sync, in `Portal · No batch`.

## Modes

| `MAILERLITE_MODE` | What it does | Use it for |
|---|---|---|
| `mock` (default) | No MailerLite. Subscribers and groups are kept in memory and lost on restart | Local development and tests |
| `sandbox` | Real MailerLite | Testing against a separate MailerLite account |
| `live` | Real MailerLite | Production |

`sandbox` and `live` run the same code. Only the API token differs. MailerLite has no test environment, so `sandbox`
writes to whichever account the token belongs to. Admin > Settings shows the current mode as "MailerLite".
Production will not start with `mock` unless `ALLOW_MOCK_IN_PRODUCTION=true`.

## 1. MailerLite account

1. Use the academy's account at [mailerlite.com](https://www.mailerlite.com). It must be the current MailerLite
   (dashboard at `dashboard.mailerlite.com`). The app calls `connect.mailerlite.com`, so tokens from MailerLite
   Classic do not work.
2. Turn on two-factor login for the MailerLite account itself.
3. Authenticate the domain you send campaigns from (MailerLite > Sites/Domains), and fill in the company details
   MailerLite asks for before the first campaign.
4. In the account's subscribe settings, turn off double opt-in for subscribers added through the API or integrations.
   The portal already collects consent. With it on, MailerLite may hold new students as unconfirmed until they click a
   confirmation email.

## 2. Create the API token

MailerLite > Integrations > MailerLite API > Generate new token. Name it `Edge portal (production)`. Copy the token
right away and save it in the password manager.

## 3. Configure the app

**Server:** edit `/var/www/edge-academy/.env` (the template is `deploy/env.production.example`):

```bash
MAILERLITE_MODE=live
MAILERLITE_API_KEY=...
```

Then restart, so the worker and the API read `.env` again:

```bash
pm2 restart all
```

**Local:** keep `MAILERLITE_MODE=mock`. To test against MailerLite, create a second, free MailerLite account and a
token for it, uncomment `MAILERLITE_API_KEY` in `.env`, set `MAILERLITE_MODE=sandbox` and restart `pnpm dev` (it
starts the worker too). Keep test subscribers out of the production account.

## 4. Test

With `MAILERLITE_MODE=live` on the server:

1. Check that Admin > Settings shows "MailerLite: live".
2. Sign up at `https://portal.edgeverse.ae/signup` with your own email, leave the marketing box ticked and verify the
   phone number.
3. Within a minute, MailerLite > Subscribers should show the email as Active, with name, phone and country. It should
   be in `Portal · All students`, `Portal · Batch <code>`, `Portal · Status: Awaiting payment` and
   `Portal · Payment: Unpaid`. If no batch was open, it appears the next morning in `Portal · No batch`.
4. On the portal's Profile page, untick the marketing box and save. Within a minute the subscriber should be
   Unsubscribed.
5. Tick the box again and save. Check that MailerLite shows the subscriber as Active again.
6. Delete the test subscriber in MailerLite, and the test student in the portal.
7. After the first real approval, check that the student moved to `Portal · Status: Active`.

Do not record a payment for the test student: test payments create real Odoo invoices.

## Limits

| Limit | Value |
|---|---|
| MailerLite API | 120 requests per minute per account. A sync makes a few requests per student; rate-limited syncs retry by themselves |
| Syncs at once | 3 per worker (`apps/worker/src/run.ts`) |
| Fields sent | `name`, `phone`, `country` (MailerLite's built-in fields; no custom fields to create). Country is a two-letter code such as `AE` |

## Rotating the token

Rotate the token on a schedule, and right away if it leaks:

1. MailerLite > Integrations > MailerLite API: generate a new token.
2. Put it in `.env` as `MAILERLITE_API_KEY`, then run `pm2 restart all`.
3. Save the Profile page as a test student. Check that `pm2 logs edge-worker` shows no `mailerlite.sync` failure.
4. Delete the old token in MailerLite.

## Troubleshooting

Start with `pm2 logs edge-worker --lines 200`. Failures look like
`mailerlite.sync #… failed (attempt 2) MailerLite POST /subscribers failed (401): …`. The text after the status code is
MailerLite's own reason.

| Symptom | Fix |
|---|---|
| `MAILERLITE_API_KEY is required` | The token is empty and the mode is not `mock`. Fill it in, then `pm2 restart all` |
| `MAILERLITE_MODE=mock is not allowed in production` | Set `MAILERLITE_MODE=live` |
| `failed (401)` | Wrong or deleted token, or a MailerLite Classic token. Create a new one (step 2) |
| `failed (429)` | MailerLite's rate limit. Syncs retry by themselves. If the nightly sync hits it every night, ask a developer to slow it down |
| Syncs fail on `/subscribers/…/groups/…` | A `Portal · ` group was deleted in MailerLite. Run `pm2 restart edge-worker`; the next sync creates the group again |
| A student is missing from MailerLite | In Admin > Students, check that the phone is verified and marketing consent is Yes. If both are, wait for the 02:30 sync or ask the student to save their Profile page, then check the worker log |
| A student is in the wrong `Portal · ` group | Someone changed the group by hand, or the sync has not run yet. It is fixed at the student's next change or at 02:30 |
| New subscribers stay Unconfirmed | Double opt-in for the API is on. Turn it off (step 1) |
