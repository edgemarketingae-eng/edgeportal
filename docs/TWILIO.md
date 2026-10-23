# Edge Academy: Twilio setup

Students prove they own their mobile number with a 6-digit code. Twilio Verify creates the code, sends it by SMS or
WhatsApp and checks it. The app never sees the code. Steps 1–5 are required. WhatsApp (step 6) and a branded sender
ID (step 7) are optional, but step 7 takes weeks, so start it early.

The code is in `packages/integrations/src/twilio/verify.ts`. It is wired up in `apps/api/src/auth.ts`.

## Where codes are used

| Screen | What happens |
|---|---|
| Sign-up (`/signup`) | Sends a code to the new number. The student picks SMS or WhatsApp |
| Verify phone (`/verify-phone`) | Checks the code. The student can resend it, or change the number and resend |
| Sign in > One-time code (`/login`) | Signs a student in with a code instead of a password. "Resend code" always uses SMS |

Only students can sign in with a code. Accounts with 2FA turned on and disabled accounts cannot. Password reset works
by email only; reset by phone is turned off.

## Modes

| `OTP_MODE` | What it does | Use it for |
|---|---|---|
| `mock` (default) | No Twilio. The code is always `000000`, and the API log prints `[otp:mock] sms code for +971… is 000000` | Local development and tests |
| `sandbox` | Real Twilio | Testing delivery with a separate test Verify service |
| `live` | Real Twilio | Production |

`sandbox` and `live` run the same code. Only the credentials you give them differ. Admin > Settings shows the
current mode as "Mobile OTP (Twilio)". Production will not start with `mock` unless `ALLOW_MOCK_IN_PRODUCTION=true`.

Twilio's *test* credentials do not work with Verify. Use the real Account SID and Auth Token, even for `sandbox`.

## 1. Twilio account

1. Sign up at twilio.com, or use the academy's existing account. A trial account can only send to up to 5 verified
   numbers in its sign-up country. That is enough to try Verify, but not enough for students.
2. Upgrade the account, add funds and turn on auto-recharge. If the balance reaches zero, no student can verify.
3. Turn on two-factor login for the Twilio account itself.

## 2. Create the Verify service

Console > Verify > Services > Create new, then open the service's settings:

- **Friendly name:** `Edge Trading Academy`. Students see it in the message: "Your Edge Trading Academy verification
  code is: 123456".
- **Code length:** 6 (the default). The portal's code box and the auth layer expect exactly 6 digits.
- **Channels:** turn SMS on. Leave Voice and Email off, because the app never requests them. For WhatsApp, see step 6.
- **Fraud Guard:** leave it on (the default).

Copy the **Service SID**. It starts with `VA`.

## 3. Restrict countries

Verify has its own geo permissions, separate from Messaging and Voice: Console > Verify > Settings > Geo permissions.
Turn every country off. Then turn on only the countries students come from: United Arab Emirates, Saudi Arabia and any
others you enrol from. This is the main defence against SMS-pumping fraud
([Twilio guide](https://www.twilio.com/docs/verify/preventing-toll-fraud)).

The sign-up form accepts any valid number in any country. A student whose country is turned off still gets an account,
but no code is sent, and Twilio logs error 60605. After you turn the country on, the student can use "Resend code" on
the verify-phone page.

## 4. Collect the credentials

| Value | Where to find it | `.env` key |
|---|---|---|
| Account SID (`AC…`) | Console home > Account Info | `TWILIO_ACCOUNT_SID` |
| Auth Token | Console home > Account Info | `TWILIO_AUTH_TOKEN` |
| Service SID (`VA…`) | Step 2 | `TWILIO_VERIFY_SERVICE_SID` |

The app signs in with the Auth Token. An API key (`SK…`) will not work without a code change. Save all three values
in the password manager.

## 5. Configure the app

**Server:** edit `/var/www/edge-academy/.env` (the template is `deploy/env.production.example`):

```bash
OTP_MODE=live
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_VERIFY_SERVICE_SID=VA...
```

Then restart the API. It reads `.env` again on every restart:

```bash
pm2 restart edge-api
```

**Local:** keep `OTP_MODE=mock`. To test real delivery, uncomment the three `TWILIO_*` lines in `.env`, set
`OTP_MODE=sandbox` and restart `pnpm dev`. Use a separate Verify service for testing, so test traffic stays out of the
production logs.

## 6. WhatsApp (optional)

Students can pick WhatsApp on the sign-up, verify-phone and sign-in screens. Since March 2024, Verify only sends
WhatsApp codes from your own WhatsApp sender. Twilio no longer offers a shared one
([Twilio guide](https://www.twilio.com/docs/verify/whatsapp/byo)).

1. Console > Messaging > Senders > WhatsApp senders: register a sender through self sign-up. You need a Meta Business
   account and a phone number that is not already on WhatsApp or the WhatsApp Business app. Use a number only for
   codes, not the one used for marketing, because people who block marketing messages would also stop getting codes.
2. Console > Messaging > Services: create a Messaging Service (for example `Edge OTP WhatsApp`) and add the sender to
   it. Copy its SID, which starts with `MG`.
3. In the Verify service, open the WhatsApp tab, paste the Messaging Service SID and turn WhatsApp on.

**Until this step is done, picking WhatsApp does not work.** Twilio rejects the request. At sign-up the student
silently gets no code, and "Resend code" shows an error. Either finish this step before go-live, or ask a developer to
hide the WhatsApp option (`apps/student/src/components/channel-picker.tsx`).

## 7. Branded sender ID (recommended for UAE and KSA)

By default, Verify sends SMS from Twilio's generic senders. You can register an alphanumeric sender ID, such as `EDGE`.
Messages then show the academy's name, and more of them get through in countries where carriers filter unregistered
senders. The UAE and Saudi Arabia are both such countries.

- Register with Twilio ([how to register](https://help.twilio.com/articles/20153208099611-How-to-Register-an-Alphanumeric-Sender-ID)).
  Say the sender is for one-time codes (transactional traffic) sent through Verify.
- Registration takes about 2 weeks per country. The UAE and KSA each charge a setup fee and a monthly fee. Check the
  current amounts in the registration flow.
- Once it is approved, ask Twilio support to confirm that the sender ID is applied to the Verify service.

Go-live does not depend on this step.

## 8. Test

With `OTP_MODE=live` on the server:

1. Check that Admin > Settings shows "Mobile OTP (Twilio): live".
2. Sign up at `https://portal.edgeverse.ae/signup` with a UAE number. The SMS should arrive and the code should be
   accepted.
3. Do the same with a KSA number. This is an item on the go-live checklist ([RUNBOOK §5](RUNBOOK.md#5-go-live-checklist)).
4. If WhatsApp is on, sign up once more with WhatsApp selected.
5. Sign out, then sign in again on the "One-time code" tab.
6. In the Twilio Console, the Verify service's logs should show each verification as approved.

## Limits in the app

| Limit | Value | Set in |
|---|---|---|
| Code length and lifetime | 6 digits, valid for 10 minutes | Twilio Verify |
| Wrong guesses | 5 per code; after that, request a new code | Twilio Verify |
| Codes sent per number | 3 per 10 minutes, 10 per day | `packages/services/src/auth/otp-throttle.ts` |
| Codes sent per IP | 10 per 10 minutes, 40 per day | `packages/services/src/auth/otp-throttle.ts` |
| Auth requests per IP | 30 per minute | `apps/api/src/routes/auth.ts` |

Students who reach a sending limit see "Too many verification codes requested. Please wait and try again."

## Costs

Twilio charges for each successful verification, plus a fee for each SMS or WhatsApp message that varies by country
([pricing](https://www.twilio.com/en-us/verify/pricing)). Set up a usage trigger in the Twilio Console that emails you
when Verify spend goes over a daily amount. A sudden jump usually means SMS pumping. If that happens, check geo
permissions (step 3).

## Rotating the Auth Token

Rotate the token on a schedule, and right away if it leaks:

1. Console > Account > API keys & tokens: create a secondary Auth Token.
2. Put the new token in `.env` as `TWILIO_AUTH_TOKEN`, then run `pm2 restart edge-api`.
3. Sign in with a code to check that it works.
4. Promote the secondary token to primary. This retires the old token.

## Troubleshooting

Start with `pm2 logs edge-api --lines 200`, then check the Verify service's logs in the Twilio Console.

| Symptom | Fix |
|---|---|
| `Twilio Verify credentials are required when OTP_MODE is not mock` | One of the three `TWILIO_*` values is empty. Fill it in, then `pm2 restart edge-api` |
| `OTP_MODE=mock is not allowed in production` | Set `OTP_MODE=live` |
| `signup OTP send failed` in the API log | The account was created but no code was sent. The `err` in the same log line says why. Once that is fixed, the student uses "Resend code" |
| Twilio error 20003 | Wrong Account SID or Auth Token, or the token was rotated |
| Twilio error 20404 when sending | Wrong `TWILIO_VERIFY_SERVICE_SID`, or the service belongs to another account or subaccount |
| Twilio error 60605 | The number's country is turned off in Verify geo permissions (step 3) |
| Codes reach only some numbers | The account is still a trial, which only sends to verified numbers. Upgrade it (step 1) |
| No codes at all; Twilio balance is zero | Add funds and turn on auto-recharge |
| Student picked WhatsApp and got nothing | WhatsApp is not turned on in the Verify service (step 6) |
| Twilio shows the SMS as sent, but it never arrives in the UAE or KSA | Carrier filtering. Register a sender ID (step 7). Until then, students can pick WhatsApp |
| "Too many verification codes requested" | An app limit (see the table above). Wait 10 minutes; the daily limit resets after 24 hours |
| The right code is rejected | It expired after 10 minutes, or it was guessed wrong 5 times. Request a new code |
