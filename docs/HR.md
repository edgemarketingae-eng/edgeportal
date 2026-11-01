# HR

HR lives inside the Staff portal in the console (`/staff`). Every staff account can open it, whatever its roles, and the side menu shows each person what their role allows.

## Who can do what

| Role              | Access                                                        |
| ----------------- | ------------------------------------------------------------- |
| Any staff account | Their own attendance, leave, salary, advances and HR requests |
| `hr_manager`      | Everything in HR, including salaries                          |
| `super_admin`     | Everything, and also what HR can't do for themselves          |
| `admin`           | No HR access                                                  |

Permissions are `hr.manage` (records, attendance, leave, requests), `hr.payroll` (salaries, salary months, advances) and `hr.settings` (leave rules, holidays). Only a super admin can grant a role that holds them. Never put them on a CRM role: `isCrmRole` would stop treating it as a CRM role and its members would drop out of CRM Team.

The `employee` role has no permissions, for people who only need the Staff portal. Logins are created in Staff & roles or CRM Team and then appear in HR to set up.

## Rules worth knowing

- **No conversion.** Pay is in AED, USD or INR per person, and commission is USD. Totals list each currency side by side.
- **Nothing cuts pay automatically.** Late, absent and unpaid leave only appear as numbers on the payslip. Joiners and leavers aren't prorated.
- **Closed months are final.** One draft at a time, in order. Close rebuilds the month and stops if any figure changed since HR last looked.
- **Commission adjustments.** For every closed month, actual commission now minus what closed payslips recorded becomes a line on the next payslip. A negative one is capped at that payslip's net USD, and the rest recurs.
- **Leave.** Balances are the sum of an append-only ledger per leave year (calendar year), in hundredths of a day. `hr.leaveDaily` runs at 00:30 Dubai, rolls the year over and then posts accruals. It is safe to rerun. Accrual starts the month after set-up, so earlier leave is the opening balance HR enters.
- **Off switch.** Leave doesn't touch `StaffProfile.available`. Managers keep using it by hand.
- **Privacy.** No salary figures in audit payloads or email data: audit `after` is shown to `audit.read` holders and `notificationLogs.payload` never expires. Pay has its own collection and routes because `register()` doesn't filter responses.

## Files

Files are stored on Cloudinary as `private` assets under `<CLOUDINARY_ROOT_FOLDER>/<module>/<area>`, for example `edge-academy/hr/leave`. The areas are in `packages/domain/src/files.ts`. JPG, PNG and PDF only, up to 5 MB, checked by file signature.

Reads go through the API, which checks access and streams the bytes, so browsers never see a Cloudinary link. Only the file's owner, its uploader and `hr.manage` holders can read it. Unclaimed uploads are deleted weekly by `files.orphanSweep`.

## Rollout

1. Set `STORAGE_MODE=live` and the `CLOUDINARY_*` keys. Production won't start in mock mode.
2. Deploy as usual. The migrate step creates the collections, indexes and new roles.
3. A super admin gives the HR person the `hr_manager` role. They'll need two-factor authentication.
4. HR sets the real leave rules, weekly off and holidays in HR settings. The defaults are placeholders.
5. HR sets up each person's record, pay and opening balances.
6. Sales staff sign in once on the console to reach the Staff portal, because sessions are per host.

## Not built yet

WPS bank file, gratuity, visa and ID expiry alerts, staff self check-in, automatic per-class mentor pay, HR creating logins, reopening a closed month.
