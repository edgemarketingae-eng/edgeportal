import {
  BadgeCheck,
  Bell,
  BookOpen,
  CalendarDays,
  CreditCard,
  FileClock,
  KeyRound,
  LayoutDashboard,
  PlayCircle,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { Flow, List, Note, P, Steps, Terms, To, Ui } from "../kit";
import type { DocModule, DocSection } from "../types";

/** Getting started is the same in both console areas; only the links differ. */
function gettingStarted(home: string, security: string): DocModule {
  return {
    slug: "getting-started",
    title: "Getting started",
    summary: "Signing in for the first time, your password, two-factor sign-in and notifications.",
    icon: KeyRound,
    group: "Basics",
    sections: [
      {
        id: "first-sign-in",
        title: "Your first sign-in",
        body: (
          <>
            <P>An admin creates your account. You receive an email with a temporary password and the link to sign in.</P>
            <Steps>
              <>Open the link in the email and sign in with your work email and the temporary password.</>
              <>Choose your own password (at least 8 characters). You can&apos;t use the panel until you do.</>
              <>
                If you can open the admin panel (admins, admissions and finance staff) or you are a CRM admin, you must also set up
                two-factor sign-in on <To href={security}>Two-factor authentication</To>. Use an authenticator app such as Google
                Authenticator. Mentors can skip this step.
              </>
            </Steps>
            <Note kind="tip">
              Lost the email? Ask an admin. They can see your temporary password on the staff list until you sign in, or reset it.
            </Note>
          </>
        ),
      },
      {
        id: "find-your-way",
        title: "Finding your way around",
        body: (
          <List>
            <>The menu on the left only shows the pages your role can open.</>
            <>
              If you work in more than one area (admin panel, staff portal, CRM), switch between them from your name in the top-right
              corner. Go back to <To href={home}>your home page</To> at any time.
            </>
            <>
              The bell shows your notifications. The notifications page lists 25 at a time; only the ones on the page you open are marked as
              read. The <Ui>?</Ui> button next to it opens these guides.
            </>
          </List>
        ),
      },
    ],
  };
}

/* ------------------------------------------------------------------------------------------------
 * Admin panel
 * ---------------------------------------------------------------------------------------------- */

const overview: DocModule = {
  slug: "overview",
  title: "Overview dashboard",
  summary: "The numbers on the admin home page, what each one counts and where it takes you.",
  icon: LayoutDashboard,
  group: "Basics",
  audience: ["admin.access"],
  href: "/admin",
  sections: [
    {
      id: "what-for",
      title: "What this page is for",
      body: (
        <>
          <P>
            <To href="/admin">Overview</To> is the first page you see in the admin panel. It shows, at a glance, what needs your attention
            today. Every card is a link: click it to open the list behind the number.
          </P>
          <Note kind="tip">Start your day here. A yellow card means something is waiting; a red card means something needs fixing.</Note>
        </>
      ),
    },
    {
      id: "cards",
      title: "The cards",
      body: (
        <Terms
          head={["Card", "What it counts"]}
          rows={[
            [
              <Ui key="c">Needs approval</Ui>,
              <>
                Students who have paid and are waiting for staff to verify them. Opens <To href="/admin/approvals">Approvals</To>.
              </>,
            ],
            [<Ui key="c">Active students</Ui>, "Enrollments that are approved and have access. Opens the student list filtered to Active."],
            [
              <Ui key="c">Balance due in 7 days</Ui>,
              <>
                Active students who paid an advance and whose access will lock within the next 7 days (this includes anyone already past
                their due date who has not been locked yet). Opens <To href="/admin/balances">Advance &amp; balances</To>.
              </>,
            ],
            [
              <Ui key="c">Locked</Ui>,
              "Students whose access is paused, either because the balance is overdue or because staff locked them. Opens the student list filtered to Locked.",
            ],
            [
              <Ui key="c">Collected today</Ui>,
              "Total of successful payments since midnight Dubai time, with the number of payments. The total is what students were charged, so it includes VAT and processing fees.",
            ],
            [<Ui key="c">Collected this month</Ui>, "The same total since the 1st of the month (Dubai time)."],
            [
              <Ui key="c">Awaiting payment</Ui>,
              "Students placed in a batch who have not paid yet. Opens the student list filtered to Awaiting payment.",
            ],
            [
              <Ui key="c">Odoo sync failures</Ui>,
              <>
                Paid payments whose invoice could not be created in Odoo. Opens <To href="/admin/payments?odoo=FAILED">Payments</To>{" "}
                filtered to failed syncs.
              </>,
            ],
          ]}
        />
      ),
    },
    {
      id: "upcoming",
      title: "Upcoming live classes",
      body: (
        <P>
          Below the cards you see the next five scheduled classes across all batches, with the batch and start time. Use{" "}
          <Ui>Manage classes</Ui> to open <To href="/admin/classes">Live classes</To>.
        </P>
      ),
    },
  ],
};

const approvals: DocModule = {
  slug: "approvals",
  title: "Approvals",
  summary: "Verify students who have paid, then approve them so their access starts, or reject them with a reason.",
  icon: BadgeCheck,
  group: "Students & payments",
  audience: ["enrollment.approve"],
  href: "/admin/approvals",
  sections: [
    {
      id: "what-for",
      title: "What this page is for",
      body: (
        <>
          <P>
            When a student makes their first payment (in full or an advance), their status changes to <Ui>Needs approval</Ui>. They
            can&apos;t join classes or watch recordings until someone approves them. <To href="/admin/approvals">Approvals</To> lists these
            students, oldest first, 50 per page (use the page numbers at the bottom, or <Ui>Rows</Ui> for 25, 50 or 100). The number next to{" "}
            <Ui>Approvals</Ui> in the menu shows how many are waiting.
          </P>
          <P>Everyone who can approve also gets a notification (&quot;New student awaiting approval&quot;) when a new student pays.</P>
        </>
      ),
    },
    {
      id: "approve",
      title: "Approve a student",
      body: (
        <>
          <Steps>
            <>
              Open <To href="/admin/approvals">Approvals</To>. Each card shows the student&apos;s email, mobile, country, Jeta FX client ID
              (if given), batch, payment state and every payment with its date, method, amount and reference.
            </>
            <>
              Check the details. If you need more, click <Ui>Review</Ui> (or the student&apos;s name) to open their full student page.
            </>
            <>
              Click <Ui>Approve</Ui>.
            </>
          </Steps>
          <P>
            The status changes to <Ui>Active</Ui> straight away. The student gets an email (&quot;You&apos;re in!&quot;) with a link to the
            student portal and, if the batch has one, the WhatsApp group link.
          </P>
          <Note kind="info">
            You can only approve a student who has paid something. Students who paid an advance can be approved; they pay the balance later.
          </Note>
        </>
      ),
    },
    {
      id: "reject",
      title: "Reject a student",
      body: (
        <>
          <Steps>
            <>
              Open the student&apos;s page (click <Ui>Review</Ui> on the approval card).
            </>
            <>
              Click <Ui>Reject</Ui> at the top of the page.
            </>
            <>Type the reason. The student is emailed this exact text, so write it for them.</>
            <>
              Click <Ui>Reject</Ui> to confirm.
            </>
          </Steps>
          <Note kind="warning" title="Fees are non-refundable">
            Rejecting does not refund anything. If a refund is agreed, handle it outside the portal with finance. A rejected student sees
            &quot;We could not approve your registration&quot; with your reason and the support email.
          </Note>
        </>
      ),
    },
  ],
};

const students: DocModule = {
  slug: "students",
  title: "Students",
  summary:
    "Find a student, read their enrollment and payments, correct their country, and take action: approve, lock, change due date, move batch or record a payment.",
  icon: Users,
  group: "Students & payments",
  audience: ["student.read"],
  href: "/admin/students",
  sections: [
    {
      id: "find",
      title: "Find a student",
      body: (
        <>
          <P>
            <To href="/admin/students">Students</To> lists every student, newest first. The number under the title is how many match your
            filters.
          </P>
          <List>
            <>
              <b>Search</b> by name, email, mobile number or Jeta FX client ID.
            </>
            <>
              <b>Status</b>: <Ui>Awaiting payment</Ui>, <Ui>Needs approval</Ui>, <Ui>Active</Ui>, <Ui>Locked</Ui>, <Ui>Rejected</Ui> or{" "}
              <Ui>No batch</Ui> (students who are not in any batch yet).
            </>
            <>
              <b>Payment</b>: <Ui>Unpaid</Ui>, <Ui>Advance paid</Ui> or <Ui>Fully paid</Ui>.
            </>
            <>
              <b>Batch</b>: one batch.
            </>
          </List>
          <P>
            <Ui>Export CSV</Ui> downloads the students that match your current search and filters, with name, email, mobile, country, Jeta
            FX ID, batch, status, payment, fee, amount paid, balance due date and join date.
          </P>
          <P>
            The list shows 50 students per page. Use the page numbers at the bottom to see the rest, or change <Ui>Rows</Ui> to 25, 50 or
            100. Your search and filters stay when you change page.
          </P>
          <Note kind="tip">A mobile marked &quot;unverified&quot; means the student has not confirmed their number yet.</Note>
        </>
      ),
    },
    {
      id: "student-page",
      title: "The student page",
      body: (
        <>
          <P>
            Click a student&apos;s name to open their page. The buttons at the top depend on the student&apos;s status and on what your role
            can do.
          </P>
          <List>
            <>
              <b>Enrollment</b>: batch, status, payment state, course fee (excluding VAT), paid / remaining, balance due date with days
              left, VAT treatment (5% VAT or zero-rated, fixed at the first payment), and any lock note or rejection reason.
            </>
            <>
              <b>Profile</b>: country of residence, Jeta FX client ID (with its change history), marketing consent and registration date. If
              the student came from the CRM and you have CRM access, you also see where the lead came from, with a link to open it in the
              CRM.
            </>
            <>
              <b>Payments</b> (if your role can see payments): every payment with type, method, amounts, status and Odoo sync. Click a date
              to open the payment.
            </>
            <>
              <b>History</b>: every change to the enrollment (enrolled, payment received, approved, locked, unlocked, due date changed,
              batch changed), with who did it and when.
            </>
          </List>
        </>
      ),
    },
    {
      id: "country",
      title: "Correcting a student's country of residence",
      body: (
        <>
          <P>
            Students choose their <b>country of residence</b> when they sign up. It decides whether they pay VAT and which payment methods
            they see at checkout. If a student picked the wrong country, staff who can edit student profiles (admins and admissions staff)
            can correct it:
          </P>
          <Steps>
            <>Open the student&apos;s page.</>
            <>
              In the <b>Profile</b> card, choose the right country under <Ui>Country of residence</Ui>.
            </>
            <>
              Click <Ui>Save</Ui>.
            </>
          </Steps>
          <List>
            <>The new country is used for the student&apos;s future checkouts.</>
            <>
              An enrollment that has already been paid keeps the VAT it started with (shown as <b>VAT treatment</b> in the Enrollment card).
            </>
            <>Every change is recorded in the audit log.</>
          </List>
          <Note kind="tip">Correct the country before the student makes their first payment, so their VAT is right from the start.</Note>
        </>
      ),
    },
    {
      id: "lifecycle",
      title: "Enrollment statuses",
      body: (
        <>
          <P>Every student moves through the same steps:</P>
          <Flow steps={["Awaiting payment", "Needs approval", "Active", "Locked"]} />
          <P>A Locked student goes back to Active when they are unlocked. A student can also end up Rejected (or, rarely, Cancelled).</P>
          <Terms
            head={["Status", "What it means and what the student can use"]}
            rows={[
              [
                <Ui key="s">Awaiting payment</Ui>,
                "The student is in a batch but has not paid. Their portal asks them to choose a payment plan (pay in full, or an advance if the batch allows it). No classes or recordings.",
              ],
              [
                <Ui key="s">Needs approval</Ui>,
                "They have paid (in full or an advance) and are waiting for staff to verify them. Their portal says the payment was received. They can pay the remaining balance, but have no classes or recordings yet.",
              ],
              [
                <Ui key="s">Active</Ui>,
                "Approved. They can join their batch's live classes, watch its recordings, and see the batch WhatsApp group link. Fully-paid students can also join classes of later batches that are open to them.",
              ],
              [
                <Ui key="s">Locked (overdue)</Ui>,
                'Locked automatically because the balance was not paid in time. The student sees "Your access is paused" with a button to pay. Paying the balance restores access immediately.',
              ],
              [
                <Ui key="s">Locked (manual)</Ui>,
                'Locked by staff. The student sees "Your access is paused by the academy", your note, and the support email. Paying does not unlock them; staff must unlock.',
              ],
              [<Ui key="s">Rejected</Ui>, "Staff rejected the registration. The student sees the reason and the support email. No access."],
              [<Ui key="s">Cancelled</Ui>, "The enrollment is closed. The student has no access."],
              [
                <Ui key="s">No batch</Ui>,
                "The student has an account but no enrollment, for example they signed up while no batch was open for new sign-ups, or have not verified their mobile yet.",
              ],
            ]}
          />
          <Note kind="info">
            Payment state is shown next to the status: <Ui>Unpaid</Ui>, <Ui>Advance paid</Ui> or <Ui>Fully paid</Ui>. If someone pays while
            Rejected or Cancelled, staff who can see payments get a notification to review it.
          </Note>
        </>
      ),
    },
    {
      id: "actions",
      title: "What you can do, and who can do it",
      body: (
        <Terms
          head={["Button", "When it shows and what it does"]}
          rows={[
            [<Ui key="a">Approve</Ui>, "Needs approval only. Makes the student Active and emails them. Admins and admissions staff."],
            [
              <Ui key="a">Reject</Ui>,
              "Needs approval only. Asks for a reason, which is emailed to the student. Fees are non-refundable. Admins and admissions staff.",
            ],
            [
              <Ui key="a">Lock access</Ui>,
              "Active only. Asks for an optional note shown to the student. The student loses classes and recordings until unlocked, and is emailed. Admins and admissions staff.",
            ],
            [
              <Ui key="a">Unlock</Ui>,
              "Locked only. Restores access immediately and emails the student. If they paid an advance, you can set a new balance due date; it is required when the balance is already overdue. Admins and admissions staff.",
            ],
            [
              <Ui key="a">Change due date</Ui>,
              "Advance paid only. Sets a new balance due date (it must be in the future). If the student was locked for an overdue balance, this also unlocks them and emails them. Admins and admissions staff.",
            ],
            [
              <Ui key="a">Assign to batch</Ui>,
              "Students with no batch. Places them in a batch as Awaiting payment so they can pay. Admins and admissions staff.",
            ],
            [
              <Ui key="a">Change batch</Ui>,
              "Any status except Rejected and Cancelled. Moves the student to another batch. If they have not paid yet, their fee changes to the new batch's fee; after the first payment the agreed fee stays. Admins and admissions staff.",
            ],
            [
              <Ui key="a">Record payment</Ui>,
              "Until the student is fully paid. Records a bank transfer, cash or other payment. Admins, admissions staff and finance.",
            ],
          ]}
        />
      ),
    },
    {
      id: "record-payment",
      title: "Record a bank transfer or cash payment",
      body: (
        <>
          <Steps>
            <>
              Open the student&apos;s page and click <Ui>Record payment</Ui>.
            </>
            <>
              Choose the <Ui>Type</Ui>. A student who has paid nothing can pay <Ui>Full payment</Ui> or an <Ui>Advance</Ui>; for an advance,
              type the amount in AED, excluding VAT. A student who paid an advance can only pay the <Ui>Remaining balance</Ui>.
            </>
            <>
              Choose the <Ui>Method</Ui>: <Ui>Bank transfer</Ui>, <Ui>Cash</Ui> or <Ui>Other</Ui>.
            </>
            <>
              Enter the <Ui>Reference</Ui> (required), for example the bank transfer reference or receipt number, and any <Ui>Notes</Ui>.
            </>
            <>
              Click <Ui>Record payment</Ui>.
            </>
          </Steps>
          <List>
            <>No processing fee is added. VAT is added on the same rules as online payments (5% for students billed in the UAE).</>
            <>The payment is marked paid, the student gets a &quot;Payment received&quot; email, and the invoice is sent to Odoo.</>
            <>
              A first payment moves the student to <Ui>Needs approval</Ui>; you still need to approve them.
            </>
            <>
              An advance must follow the batch&apos;s advance rules (one of its amounts, or at least the smallest one if custom amounts are
              allowed).
            </>
          </List>
        </>
      ),
    },
    {
      id: "auto-lock",
      title: "Automatic lock and unlock",
      body: (
        <>
          <P>
            Students who paid an advance must pay the balance by their due date. The due date comes from the batch: a fixed date, or a
            number of days after the advance.
          </P>
          <List>
            <>
              Access stops at the end of the due day, Dubai time, plus the batch&apos;s grace days. Within the hour the status changes to{" "}
              <Ui>Locked</Ui> (overdue) and the student is emailed with a link to pay.
            </>
            <>
              As soon as the balance is paid (online or recorded by staff), the student is unlocked automatically and emailed that access is
              restored.
            </>
            <>
              To give more time instead, use <Ui>Change due date</Ui>. A manual lock is never lifted by a payment.
            </>
          </List>
          <Note kind="tip">
            Keep an eye on upcoming due dates on <To href="/admin/balances">Advance &amp; balances</To>. Reminder emails go out
            automatically before the due date.
          </Note>
        </>
      ),
    },
  ],
};

const balances: DocModule = {
  slug: "balances",
  title: "Advance & balances",
  summary: "Students who paid an advance, when their balance is due, and the reminders the system sends.",
  icon: Wallet,
  group: "Students & payments",
  audience: ["enrollment.read"],
  href: "/admin/balances",
  sections: [
    {
      id: "what-for",
      title: "What this page is for",
      body: (
        <>
          <P>
            <To href="/admin/balances">Advance &amp; balances</To> lists every student who has paid an advance and still owes the balance,
            soonest due date first, 50 per page. Rejected and cancelled students are left out.
          </P>
          <List>
            <>
              <b>Paid</b> and <b>Balance</b> are course amounts, excluding VAT.
            </>
            <>
              <b>Due</b> shows the date and how far away it is: &quot;in 5 days&quot;, &quot;due today&quot; or &quot;2 days overdue&quot;.
              It turns amber 3 days before and red once overdue.
            </>
            <>
              <b>Status</b> shows whether the student is Active, Needs approval or Locked (with &quot;overdue&quot; or &quot;manual&quot;).
            </>
          </List>
          <P>
            <Ui>Export CSV</Ui> downloads all advance-paid students.
          </P>
        </>
      ),
    },
    {
      id: "due-dates",
      title: "How the due date is set",
      body: (
        <>
          <P>The due date is set when the student makes their first payment, from the batch settings:</P>
          <List>
            <>
              <b>A number of days after the advance</b> (for example 30 days after the day they paid), or
            </>
            <>
              <b>On a fixed date</b> for the whole batch.
            </>
          </List>
          <P>
            Access locks at the end of the due day (Dubai time) plus the batch&apos;s grace days. To give a student more time, open them and
            use <Ui>Change due date</Ui>. See <To href="/admin/docs/students">Students</To> for the full rules.
          </P>
        </>
      ),
    },
    {
      id: "reminders",
      title: "Reminder emails",
      body: (
        <>
          <P>
            Every morning at 9:00 (Dubai), the system emails students whose balance is due soon. By default it sends a reminder 7, 3 and 1
            days before the due date and on the due day itself. Each email shows the amount, the due date and a <Ui>Pay balance</Ui> button.
          </P>
          <List>
            <>Reminders go to students who are Active or Needs approval. Locked students get the &quot;access paused&quot; email instead.</>
            <>A student never gets the same reminder twice.</>
            <>
              The reminder days are set in <To href="/admin/settings">Settings</To> (<Ui>Balance reminder days before due</Ui>).
            </>
          </List>
        </>
      ),
    },
  ],
};

const payments: DocModule = {
  slug: "payments",
  title: "Payments",
  summary: "Every payment with its status, VAT and processing fee, and its Odoo invoice. Fix stuck payments and failed syncs.",
  icon: CreditCard,
  group: "Students & payments",
  audience: ["payment.read"],
  href: "/admin/payments",
  sections: [
    {
      id: "list",
      title: "The payments list",
      body: (
        <>
          <P>
            <To href="/admin/payments">Payments</To> shows payments newest first, 50 per page. The line under the title adds up the
            successful payments across <b>all</b> payments that match your search and filters, not just the page you are on: the total
            charged, the VAT on courses and the processing fees.
          </P>
          <List>
            <>
              <b>Search</b> by student name or email, or by a payment reference (gateway reference or the reference typed for a bank/cash
              payment).
            </>
            <>
              <b>Status</b>, <b>Method</b> (Card (Stripe), Card (Nomod), Tabby, Tamara, Bank / cash) and <b>Odoo</b> filters narrow the
              list.
            </>
            <>Click the date to open a payment, or the student&apos;s name to open the student.</>
            <>
              Use the page numbers at the bottom to see older payments, or change <Ui>Rows</Ui> to 25, 50 or 100.
            </>
          </List>
          <Terms
            head={["Payment status", "Meaning"]}
            rows={[
              [<Ui key="p">Paid</Ui>, "The money was received. The enrollment has been updated."],
              [<Ui key="p">Pending</Ui>, "The student started paying and the gateway has not confirmed yet."],
              [<Ui key="p">Authorised</Ui>, "The gateway approved the payment and it is being captured."],
              [<Ui key="p">Failed</Ui>, "The gateway declined or the payment failed."],
              [<Ui key="p">Cancelled</Ui>, "The student cancelled at the gateway."],
              [<Ui key="p">Expired</Ui>, "The student never finished paying and the checkout link ran out."],
            ]}
          />
          <P>The type column shows Full payment, Advance or Balance.</P>
        </>
      ),
    },
    {
      id: "breakdown",
      title: "VAT and processing fees",
      body: (
        <>
          <P>
            Open a payment to see its breakdown: course amount, VAT on the course, processing fee, VAT on the processing fee and the total
            charged.
          </P>
          <List>
            <>
              Students billed in the UAE pay 5% VAT on the course and on the processing fee. Students billed elsewhere are zero-rated. The
              billing country is the student&apos;s country of residence, and it is fixed at their first payment. To correct a country
              before then, see Students → Correcting a student&apos;s country of residence.
            </>
            <>
              The processing fee covers what the payment provider charges. It is calculated so that the academy receives the full course
              amount and VAT. Each provider has its own rate (see Settings).
            </>
            <>Bank transfers and cash have no processing fee.</>
          </List>
        </>
      ),
    },
    {
      id: "recheck",
      title: "A payment is stuck as Pending",
      body: (
        <>
          <P>
            The system asks the gateways about pending payments every 5 minutes, so most fix themselves. If a student says they paid and it
            still shows Pending:
          </P>
          <Steps>
            <>Open the payment.</>
            <>
              Click <Ui>Re-check with gateway</Ui>. The message tells you what the gateway says.
            </>
            <>
              If the gateway confirms the payment, it becomes Paid and the student&apos;s enrollment moves on (for a first payment, to Needs
              approval).
            </>
          </Steps>
          <Note kind="info">
            <Ui>Re-check with gateway</Ui> only shows on online payments that are not Paid yet. The <b>Gateway events</b> box on the payment
            shows each message received from the gateway.
          </Note>
        </>
      ),
    },
    {
      id: "odoo",
      title: "Odoo invoices",
      body: (
        <>
          <P>
            Every paid payment creates an invoice in Odoo with a course line and a processing fee line, and registers the payment against
            it. The Odoo badge shows how far it got:
          </P>
          <Terms
            head={["Odoo badge", "Meaning"]}
            rows={[
              [
                <Ui key="o">Odoo: pending</Ui>,
                "Waiting to be sent, or waiting to try again after a temporary error. The system retries by itself.",
              ],
              [<Ui key="o">Odoo: in progress</Ui>, "Being sent right now."],
              [<Ui key="o">Odoo: synced</Ui>, "The invoice exists in Odoo. Its number is shown on the payment."],
              [
                <Ui key="o">Odoo: failed</Ui>,
                "It could not be created and the system has stopped trying. The error is shown on the payment.",
              ],
            ]}
          />
          <Steps>
            <>
              Filter the list by <Ui>Odoo</Ui> = <Ui>Failed</Ui>, or click <Ui>Odoo sync failures</Ui> on the Overview.
            </>
            <>
              Open the payment and read the error in the Odoo box. Failures are often a missing product, tax or journal in the Odoo
              settings; ask whoever manages Odoo settings to fix it.
            </>
            <>
              Click <Ui>Retry Odoo sync</Ui>. You see &quot;Odoo sync queued.&quot; and the badge goes back to pending.
            </>
          </Steps>
          <Note kind="info">
            <Ui>Retry Odoo sync</Ui> is available to admins and finance. Payments made while Odoo is down are sent later automatically.
          </Note>
        </>
      ),
    },
  ],
};

const batches: DocModule = {
  slug: "batches",
  title: "Courses & batches",
  summary: "Create courses and batches, set fees and advance payments, balance due rules, mentors and the current batch for new sign-ups.",
  icon: BookOpen,
  group: "Teaching",
  audience: ["catalog.manage"],
  href: "/admin/batches",
  sections: [
    {
      id: "what-for",
      title: "What this page is for",
      body: (
        <>
          <P>
            <To href="/admin/batches">Courses &amp; batches</To> shows each course with its batches: start date, status, fee and number of
            students (Active, Needs approval and Locked). The batch new students join automatically has a <Ui>Current</Ui> badge.
          </P>
          <List>
            <>
              To add a course, fill in <Ui>Add a course</Ui> at the bottom (code, title, description, <Ui>Active</Ui>) and click{" "}
              <Ui>Add course</Ui>.
            </>
            <>
              To change a course, open <Ui>Edit course</Ui> under its table and click <Ui>Save course</Ui>.
            </>
          </List>
        </>
      ),
    },
    {
      id: "create",
      title: "Create a batch",
      body: (
        <>
          <Steps>
            <>
              Click <Ui>New batch</Ui> (it appears once a course exists).
            </>
            <>Fill in the batch details, fees and mentors. Each field is explained below.</>
            <>
              Click <Ui>Create batch</Ui>. To change a batch later, click its name, edit and click <Ui>Save batch</Ui>.
            </>
          </Steps>
          <Note kind="warning" title="Opening a batch for sign-ups">
            New students only join a batch automatically when it is ticked as <Ui>Current batch for new sign-ups</Ui>, its status is{" "}
            <Ui>Open for enrollment</Ui> or <Ui>Running</Ui>, and its course is <Ui>Active</Ui>. Otherwise new students sign up with no
            batch and see &quot;No batch is open for enrollment right now&quot;. You can place them later with <Ui>Assign to batch</Ui>.
          </Note>
        </>
      ),
    },
    {
      id: "fields",
      title: "Batch fields explained",
      body: (
        <Terms
          head={["Field", "What it does"]}
          rows={[
            [<Ui key="f">Course</Ui>, "The course this batch belongs to."],
            [<Ui key="f">Code</Ui>, "A short unique code, for example FX-PRO-B2."],
            [<Ui key="f">Status</Ui>, "Where the batch is in its life (see the next section)."],
            [<Ui key="f">Name</Ui>, 'The name students and staff see, for example "Batch 2 - January 2027".'],
            [
              <>
                <Ui>Start date</Ui> / <Ui>End date</Ui>
              </>,
              'When the batch runs. The start date also decides which batches count as "later" for fully-paid students joining other classes.',
            ],
            [<Ui key="f">Schedule</Ui>, 'Free text shown to students, for example "Mon / Wed / Fri, 8:00 - 9:30 PM (Dubai)".'],
            [<Ui key="f">Capacity (optional)</Ui>, "For your reference. The portal does not stop sign-ups when it is reached."],
            [<Ui key="f">Description shown to students</Ui>, "Text students see about their batch."],
            [<Ui key="f">WhatsApp group link</Ui>, "Shown to Active students and included in the approval email."],
            [
              <Ui key="f">Current batch for new sign-ups</Ui>,
              "New students join this batch automatically. Ticking it switches off any other current batch of the same course.",
            ],
            [
              <Ui key="f">Course fee (AED, excluding VAT)</Ui>,
              "The course price before VAT. A student's fee is fixed at their first payment, so later changes only affect students who have not paid yet.",
            ],
            [<Ui key="f">Allow advance payment</Ui>, "Lets students reserve their seat with a part payment and pay the balance later."],
            [
              <Ui key="f">Advance amounts (AED)</Ui>,
              "Comma separated, for example 200, 300, 500. The smallest is the minimum. Each must be lower than the fee.",
            ],
            [
              <Ui key="f">Students may type a custom advance</Ui>,
              "Lets students enter their own advance amount, as long as it is at least the minimum.",
            ],
            [
              <Ui key="f">Balance due</Ui>,
              '"A number of days after the advance" (then fill in Days after advance) or "On a fixed date" (then fill in Balance due date).',
            ],
            [
              <Ui key="f">Grace days before access locks</Ui>,
              "Extra days after the due date before access locks. 0 means access locks at the end of the due day, Dubai time.",
            ],
            [
              <Ui key="f">Mentors</Ui>,
              "Tick the staff who teach this batch. Mentors can schedule classes and manage recordings for the batches they are ticked on.",
            ],
          ]}
        />
      ),
    },
    {
      id: "statuses",
      title: "Batch statuses",
      body: (
        <Terms
          head={["Status", "Use it when"]}
          rows={[
            [<Ui key="b">Draft</Ui>, "You are still setting the batch up. It can't be the current batch for new sign-ups."],
            [<Ui key="b">Open for enrollment</Ui>, "Students can join. Can be the current batch."],
            [
              <Ui key="b">Running</Ui>,
              "Classes have started. Can still be the current batch. Open and Running batches show on mentors' dashboards.",
            ],
            [<Ui key="b">Completed</Ui>, "The batch has finished."],
            [
              <Ui key="b">Archived</Ui>,
              "Old batches. They are hidden from batch lists (filters, assigning students, scheduling classes and adding recordings).",
            ],
          ]}
        />
      ),
    },
  ],
};

/** Class scheduling is the same in both areas; mentors only see the batches they teach. */
function classSections(admin: boolean): DocSection[] {
  return [
    {
      id: "schedule",
      title: "Schedule a live class",
      body: (
        <>
          <Steps>
            <>
              Open <To href={admin ? "/admin/classes" : "/staff/classes"}>Live classes</To> and use the <Ui>Schedule a live class</Ui> form.
            </>
            <>
              Choose the <Ui>Batch</Ui> and the <Ui>Host (Meet organizer)</Ui>. The host needs a Google Workspace email on their staff
              profile.
            </>
            <>
              Enter a <Ui>Title</Ui>, the <Ui>Date</Ui>, the <Ui>Start (Dubai time)</Ui> and the <Ui>Duration (minutes)</Ui> (90 by
              default). Add a description if you like.
            </>
            <>
              Leave <Ui>Meet link (optional)</Ui> empty to create a Google Meet automatically, or paste your own link.
            </>
            <>
              Keep or untick <Ui>Fully-paid students of earlier batches may join</Ui> and <Ui>Email the batch</Ui>.
            </>
            <>
              Click <Ui>Schedule class</Ui>. The message tells you how many students were emailed, and shows a note if something about the
              Meet link needs attention.
            </>
          </Steps>
          <List>
            <>All times are Dubai time.</>
            <>
              The automatic Meet is created in the host&apos;s Google calendar with open access (students don&apos;t need a Google account)
              and recording switched on.
            </>
            <>
              <Ui>Email the batch</Ui> emails the batch&apos;s Active students with the class title and time.
            </>
            <>
              <Ui>Fully-paid students of earlier batches may join</Ui> lets fully-paid Active students from batches that started earlier see
              and join this class too.
            </>
          </List>
          <Note kind="warning" title="No Meet link?">
            If the host has no Google Workspace email (and the academy has no default host account), or Google could not create the Meet,
            the class is still saved but shows <Ui>No link</Ui>. Fix it with <Ui>Edit</Ui> and paste a link in <Ui>Meet link override</Ui>.
            A class with a pasted link is not recorded automatically, so add its recording by Drive link afterwards.
          </Note>
        </>
      ),
    },
    {
      id: "edit-cancel",
      title: "Edit, reschedule or cancel",
      body: (
        <>
          <P>Upcoming classes are listed with their time, host and Meet status. Each row has three buttons:</P>
          <Terms
            rows={[
              [<Ui key="b">Open Meet</Ui>, "Opens the class in Google Meet. Staff can open it at any time."],
              [
                <Ui key="b">Edit</Ui>,
                'Change the title, date, start time, minutes, description or the Meet link override. Tick "Email students if the time changes" to tell the batch about a new time. The Google Calendar event is updated too.',
              ],
              [
                <Ui key="b">Cancel</Ui>,
                'Asks for a reason (shown to students). With "Email the batch" ticked, students get a cancellation email with the reason. A cancelled class can\'t be edited.',
              ],
            ]}
          />
          <Terms
            head={["Meet badge", "Meaning"]}
            rows={[
              [<Ui key="m">Meet · auto-record</Ui>, "Automatic Meet with open access and recording on. Recordings appear by themselves."],
              [
                <Ui key="m">Meet</Ui>,
                "Automatic Meet, but open access and recording could not be set. Students may need to be admitted by hand, and you may need to start the recording yourself.",
              ],
              [<Ui key="m">Manual link</Ui>, "Uses the link you pasted."],
              [<Ui key="m">No link</Ui>, "There is no link yet. Students can't join. Edit the class and paste a link."],
            ]}
          />
        </>
      ),
    },
    {
      id: "join",
      title: "How students join",
      body: (
        <>
          <List>
            <>
              Students never see the Meet link itself. They click a join button in their portal, which checks they are allowed in and
              records the join.
            </>
            <>
              The join button opens 15 minutes before the start (the number of minutes is set in Settings) and closes at the scheduled end
              time.
            </>
            <>Only Active students can join. Students who are locked, waiting for approval or behind on their balance can&apos;t.</>
          </List>
          <P>
            <b>Past and cancelled</b> lists earlier classes with the number of <b>Joins</b> and their recordings, 25 per page (use the page
            numbers under the list). Joins counts every click on the join button (including staff using <Ui>Open Meet</Ui>), so one person
            can count more than once.
          </P>
        </>
      ),
    },
  ];
}

const classes: DocModule = {
  slug: "classes",
  title: "Live classes",
  summary: "Schedule, reschedule and cancel live Google Meet classes for any batch, and see who joined.",
  icon: CalendarDays,
  group: "Teaching",
  audience: ["class.schedule.any"],
  href: "/admin/classes",
  sections: [
    {
      id: "what-for",
      title: "What this page is for",
      body: (
        <P>
          <To href="/admin/classes">Live classes</To> lets you manage classes for every batch. Mentors manage classes for their own batches
          from the staff portal, using the same form. The host list shows staff who can teach (mentors and admins).
        </P>
      ),
    },
    ...classSections(true),
  ],
};

/** Recordings work the same in both areas; mentors only see the batches they teach. */
function recordingSections(admin: boolean): DocSection[] {
  return [
    {
      id: "automatic",
      title: "Automatic Meet recordings",
      body: (
        <>
          <P>
            Classes scheduled with an automatic Meet are recorded. After the class, the system looks for the recording every 15 minutes (for
            up to 48 hours) and adds it, usually about 15 minutes after Google has saved it in Drive. It is published to the batch straight
            away, with the class title. A class recorded in several files gets one recording per part (&quot;part 1&quot;, &quot;part
            2&quot;).
          </P>
          <Note kind="info">
            Classes that use a pasted Meet link are not picked up automatically. Add their recording with a Drive link.
          </Note>
        </>
      ),
    },
    {
      id: "drive",
      title: "Add a recording from a Drive link",
      body: (
        <>
          <Steps>
            <>
              In Google Drive, share the video file with the class host&apos;s Workspace account or the academy host account (viewer access
              is enough).
            </>
            <>
              Open <To href={admin ? "/admin/recordings" : "/staff/recordings"}>Recordings</To> and use{" "}
              <Ui>Add a recording from Google Drive</Ui>.
            </>
            <>
              Choose the <Ui>Batch</Ui>, and the <Ui>Class (optional)</Ui> it belongs to, or leave &quot;Not linked to a class&quot;.
            </>
            <>
              Paste the <Ui>Google Drive link</Ui> (it looks like https://drive.google.com/file/d/…/view), and enter a <Ui>Title</Ui> and
              optional description.
            </>
            <>
              Keep <Ui>Publish to students now</Ui> ticked to show it right away, or untick it to publish later.
            </>
            <>
              Click <Ui>Add recording</Ui>.
            </>
          </Steps>
        </>
      ),
    },
    {
      id: "publish",
      title: "Publish or hide",
      body: (
        <>
          <P>
            Each recording has a <Ui>Publish</Ui> or <Ui>Hide</Ui> button. Hiding stops it playing for students immediately; publishing
            makes it visible again.
          </P>
          <Terms
            head={["Status", "Meaning"]}
            rows={[
              ["published", "Students of the batch can watch it."],
              ["discovered", "Added but not published yet. Students can't see it."],
              ["hidden", "Hidden by staff. Students can't see it."],
              ["error", "Something is wrong with the recording. Students can't watch it."],
            ]}
          />
          <List>
            <>
              Only Active students of that batch see its published recordings. They watch inside the portal, with their name shown on the
              video.
            </>
            <>
              <b>Views</b> counts how many times the recording was opened.
            </>
          </List>
        </>
      ),
    },
    {
      id: "troubleshooting",
      title: "When a recording won't add or play",
      body: (
        <>
          <P>
            The first time a recording is published, the portal copies the video from Drive to its own server so it plays smoothly. The{" "}
            <b>Streaming</b> column shows this:
          </P>
          <Terms
            rows={[
              ["none / filling", "Not copied yet, or being copied. Students can usually still watch it, straight from Drive."],
              ["cached", "Copied and ready."],
              ["evicted", "Removed from the server to save space. It is copied again the next time someone plays it."],
              ["error", "The copy failed. Hover over the word to see the reason."],
            ]}
          />
          <List>
            <>
              <b>&quot;Could not read that file from Drive&quot;</b> or a Streaming <b>error</b>: the file is not shared with the host
              account named in the message. Share it and try again.
            </>
            <>
              <b>&quot;That file is … not a video&quot;</b>: you pasted a link to a folder, document or other file. Use the link of the
              video file itself.
            </>
            <>
              <b>&quot;This Drive file is already added&quot;</b>: the recording exists already (perhaps it was found automatically). Look
              for it in the list.
            </>
            <>
              <b>&quot;That class is not part of the chosen batch&quot;</b>: pick the class that belongs to the batch you chose, or leave
              the class empty.
            </>
            <>
              A student sees <b>&quot;This recording is being prepared&quot;</b>: the video is being copied. Ask them to try again in a few
              minutes.
            </>
          </List>
        </>
      ),
    },
  ];
}

const recordings: DocModule = {
  slug: "recordings",
  title: "Recordings",
  summary: "Class recordings for students: automatic Meet recordings, adding a Drive link, publishing, hiding and fixing playback.",
  icon: PlayCircle,
  group: "Teaching",
  audience: ["recording.manage"],
  href: "/admin/recordings",
  sections: [
    {
      id: "what-for",
      title: "What this page is for",
      body: (
        <P>
          <To href="/admin/recordings">Recordings</To> lists the recordings of every batch, newest first and 25 per page, with where they
          came from (<b>Meet (auto)</b> or <b>Drive link</b>), status, streaming state and views. Mentors manage recordings of their own
          batches from the staff portal.
        </P>
      ),
    },
    ...recordingSections(true),
  ],
};

const staff: DocModule = {
  slug: "staff",
  title: "Staff accounts",
  summary: "Add staff, share their temporary password, reset passwords, and disable or enable accounts.",
  icon: ShieldCheck,
  group: "Team & settings",
  audience: ["staff.manage"],
  href: "/admin/staff",
  sections: [
    {
      id: "add",
      title: "Add a staff member",
      body: (
        <>
          <Steps>
            <>
              Open <To href="/admin/staff">Staff &amp; roles</To> and scroll to <Ui>Add a staff member</Ui>.
            </>
            <>
              Enter their <Ui>Full name</Ui> and <Ui>Login email</Ui> (the email they sign in with), and a <Ui>Job title</Ui> if you like.
            </>
            <>
              For mentors, enter their <Ui>Google Workspace email</Ui>. Their Meet classes are created in this calendar.
            </>
            <>
              Tick one or more <Ui>Roles</Ui>. See <To href="/admin/docs/roles">Who can do what</To>.
            </>
            <>
              Click <Ui>Create account</Ui>.
            </>
          </Steps>
          <P>
            They are emailed a temporary password and a sign-in link. Staff who only have CRM roles get the CRM sign-in link and sign in at
            the CRM; everyone else signs in here.
          </P>
          <Note kind="info">Only a super admin can give someone the super admin role.</Note>
        </>
      ),
    },
    {
      id: "invited",
      title: "Invited staff and the temporary password",
      body: (
        <>
          <P>
            Until someone signs in and chooses their own password, the staff list shows them as <Ui>Invited</Ui>, with their temporary
            password underneath. Their own page shows &quot;Waiting for the first sign-in.&quot;
          </P>
          <List>
            <>
              The password is hidden as dots. Click the eye to show it, or the copy button to copy it, then share it with the person (for
              example if the email didn&apos;t arrive).
            </>
            <>
              Once they set their own password, the temporary password disappears and the status changes to <Ui>Active</Ui>.
            </>
            <>
              Some older invites show &quot;Reset the password to get a new one&quot; instead. Open the person and click{" "}
              <Ui>Reset password</Ui> to get a password you can share.
            </>
          </List>
        </>
      ),
    },
    {
      id: "manage",
      title: "Edit, reset a password, disable",
      body: (
        <>
          <P>Click a name on the staff list to open the person.</P>
          <Terms
            rows={[
              [
                "Details and roles",
                <>
                  Change the name, job title, Google Workspace email or roles, then click <Ui>Save</Ui>. Only a super admin can add or
                  remove super admin, and nobody can remove their own super admin role.
                </>,
              ],
              [
                <Ui key="r">Reset password</Ui>,
                "Creates a new temporary password, emails it to them and signs them out everywhere. The password also stays on screen until you close the message, and on the staff list until they change it.",
              ],
              [
                <Ui key="d">Disable account</Ui>,
                "Signs them out at once and blocks sign-in. Use it when someone leaves. You can't disable your own account.",
              ],
              [<Ui key="e">Enable account</Ui>, "Lets a disabled person sign in again."],
            ]}
          />
        </>
      ),
    },
    {
      id: "roles-page",
      title: "Roles & permissions",
      body: (
        <>
          <P>
            <Ui>Roles &amp; permissions</Ui> (top right of the staff list) shows every role, how many people have it, and what it allows. A
            person can hold several roles; what they can do adds up.
          </P>
          <List>
            <>Only a super admin can edit roles or create new ones. Others see the page read-only.</>
            <>
              To create a role, fill in <Ui>New role</Ui> at the bottom: name, description and the permissions to tick, then click{" "}
              <Ui>Create role</Ui>.
            </>
          </List>
          <Note kind="warning" title="Don't edit the built-in roles">
            The built-in roles (Admin, Admissions staff, Finance, Mentor and the CRM roles) are reset to their standard permissions every
            time the system is updated. If you need a different mix, create a new role with its own name instead.
          </Note>
        </>
      ),
    },
  ],
};

const roles: DocModule = {
  slug: "roles",
  title: "Who can do what",
  summary: "The built-in staff roles in plain language, and how combined roles add up.",
  icon: UserCog,
  group: "Team & settings",
  audience: ["staff.manage", "roles.manage"],
  sections: [
    {
      id: "roles",
      title: "Built-in roles",
      body: (
        <Terms
          head={["Role", "What they can do"]}
          rows={[
            [
              "Super admin",
              "Everything, including editing roles and the Odoo invoicing settings. Only a super admin can make someone else a super admin.",
            ],
            [
              "Admin",
              "Runs the academy day to day: the whole admin panel, the staff portal and the CRM. Cannot edit roles or the Odoo invoicing settings.",
            ],
            [
              "Admissions staff",
              "Verifies new students: approvals, student pages, lock and unlock, due dates, assigning and moving batches, recording bank and cash payments, and viewing payments and balances.",
            ],
            [
              "Finance",
              "Payments: viewing payments and students, recording bank and cash payments, retrying Odoo syncs, the balances list, and payment method fees and general settings.",
            ],
            ["Mentor", "The staff portal only: schedules classes and manages recordings for the batches they are ticked on as mentor."],
            ["CRM admin", "Everything in the CRM, including CRM staff and CRM roles. No admin panel."],
            [
              "CRM manager",
              "Sees every CRM project and lead, creates projects, assigns teams and leads, converts leads to students, and handles CRM settings, imports and merges.",
            ],
            [
              "Project manager",
              "Runs the CRM projects assigned to them: their leads, team and tasks, assigning work within those projects and converting leads.",
            ],
            ["Sales executive", "Works their own CRM leads and follow-ups, and converts leads into students."],
          ]}
        />
      ),
    },
    {
      id: "combined",
      title: "Combining roles",
      body: (
        <>
          <P>
            A person can have several roles. They can do everything any of their roles allows. For example, Finance plus Mentor can work on
            payments in the admin panel and teach in the staff portal; they switch areas from their name in the top-right corner.
          </P>
          <P>
            People whose roles are all CRM roles sign in at the CRM. Anyone with an admin panel or staff portal role signs in here. Roles
            are given on <To href="/admin/staff">Staff &amp; roles</To>, and the exact permissions of each role are on{" "}
            <To href="/admin/staff/roles">Roles &amp; permissions</To>.
          </P>
        </>
      ),
    },
    {
      id: "two-factor",
      title: "Two-factor sign-in",
      body: (
        <Note kind="warning" title="Required for admin panel and CRM admin access">
          Everyone who can open the admin panel (super admins, admins, admissions staff and finance) and everyone who can manage CRM staff
          (CRM admins) must set up two-factor sign-in with an authenticator app. Until they do, they are sent to{" "}
          <To href="/security">Two-factor authentication</To> after signing in.
        </Note>
      ),
    },
  ],
};

const settings: DocModule = {
  slug: "settings",
  title: "Settings",
  summary: "Payment methods and fees, VAT, reminders, class join time, academy contact details, Odoo invoicing and integrations.",
  icon: Settings,
  group: "Team & settings",
  audience: ["settings.fees", "settings.integrations"],
  href: "/admin/settings",
  sections: [
    {
      id: "fees",
      title: "Payment methods and fees",
      body: (
        <>
          <P>
            Each row is one payment method students can choose at checkout (Card (UAE), Card (international), Card (Nomod), Tabby, Tamara,
            and Bank transfer / cash for staff). Change a row and click its <Ui>Save</Ui> button.
          </P>
          <Terms
            rows={[
              ["Label", "The name of the method."],
              [<Ui key="f">Fee %</Ui>, "The percentage the provider charges, for example 2.9."],
              [<Ui key="f">Fixed AED</Ui>, "The fixed amount the provider charges per payment, for example 1.00."],
              [
                <>
                  <Ui>Min total</Ui> / <Ui>Max total</Ui>
                </>,
                "The method is only offered when the total is within these limits. Leave empty for no limit.",
              ],
              [
                <Ui key="f">Only in</Ui>,
                "Offer the method only to students living in these countries. Two-letter codes separated by commas, for example AE, SA. Empty means every country.",
              ],
              [
                <Ui key="f">Not in</Ui>,
                "Never offer the method to students living in these countries, for example IN. Empty means no country is left out.",
              ],
              [<Ui key="f">On</Ui>, "Untick to stop offering the method."],
            ]}
          />
          <P>
            The country is the student&apos;s country of residence. A code that isn&apos;t a real two-letter country code is refused when
            you save, and the message names it.
          </P>
          <Note kind="warning">
            The rates must match each provider&apos;s contract. The processing fee students pay is calculated from them so the academy
            receives the full course amount and VAT.
          </Note>
        </>
      ),
    },
    {
      id: "general",
      title: "General settings",
      body: (
        <>
          <Terms
            head={["Field", "What it does (default)"]}
            rows={[
              [
                <Ui key="g">Countries that pay 5% VAT on the course</Ui>,
                "Students billed in these countries pay VAT; everyone else is zero-rated. Two-letter codes. (AE)",
              ],
              [<Ui key="g">Course VAT rate %</Ui>, "The VAT rate on the course. (5)"],
              [
                <Ui key="g">Balance reminder days before due</Ui>,
                "When balance reminder emails go out. 0 means on the due day. (7, 3, 1, 0)",
              ],
              [<Ui key="g">Join button opens (minutes before class)</Ui>, "How early students can join a live class. (15)"],
              [<Ui key="g">Checkout link valid for (minutes)</Ui>, "How long a student has to finish an online payment. (60)"],
              [
                <>
                  <Ui>Academy name</Ui>, <Ui>Support email</Ui>, <Ui>Support WhatsApp</Ui>, <Ui>Website</Ui>
                </>,
                "The academy's contact details. The support email is shown to students in messages such as a rejection or a manual lock.",
              ],
            ]}
          />
          <P>
            Click <Ui>Save settings</Ui>. A student&apos;s VAT treatment is fixed at their first payment, so VAT changes only affect new
            students.
          </P>
        </>
      ),
    },
    {
      id: "odoo",
      title: "Odoo invoicing",
      body: (
        <>
          <P>
            These are the Odoo record numbers used on every invoice: the course product, the processing fee product, the 5% VAT tax, the
            zero-rated export tax, and one journal for each payment method. Your accountant can confirm them.
          </P>
          <List>
            <>
              Only a super admin can change them (then click <Ui>Save Odoo mapping</Ui>). Others see them greyed out.
            </>
            <>
              If a number is wrong or missing, invoices fail and show on Payments as Odoo: failed. After fixing it, retry the failed
              payments.
            </>
          </List>
        </>
      ),
    },
    {
      id: "integrations",
      title: "Integrations",
      body: (
        <>
          <P>
            This box shows how each connected service is running: Payments, Mobile OTP (Twilio), Email, Odoo, Google Meet / Drive and
            MailerLite. It is for information only; the technical team changes it.
          </P>
          <Terms
            rows={[
              [<Ui key="i">live</Ui>, "Connected to the real service (green)."],
              [<Ui key="i">mailersend</Ui>, "Emails are really being sent (green)."],
              [<Ui key="i">mock</Ui>, "Test mode. The service is never contacted (amber)."],
              [<Ui key="i">console</Ui>, "Emails are not sent to anyone yet (amber)."],
            ]}
          />
        </>
      ),
    },
  ],
};

const audit: DocModule = {
  slug: "audit",
  title: "Audit log",
  summary: "A record of every sensitive change: who did what, and when.",
  icon: FileClock,
  group: "Team & settings",
  audience: ["audit.read"],
  href: "/admin/audit",
  sections: [
    {
      id: "what",
      title: "What is logged",
      body: (
        <>
          <P>
            <To href="/admin/audit">Audit log</To> records sensitive changes, newest first, including:
          </P>
          <List>
            <>Enrollments: approve, reject, lock, unlock, due date changes, assigning and moving batches.</>
            <>A student&apos;s country of residence being corrected (search for country), with the old and new country.</>
            <>Payments marked paid (online or recorded by staff).</>
            <>Courses and batches, live classes and recordings.</>
            <>Staff accounts (created, updated, disabled, enabled, password reset) and roles.</>
            <>Payment method fees, general settings and Odoo settings.</>
            <>CRM changes such as leads, tasks and projects.</>
          </List>
          <P>
            Each row shows <b>When</b>, <b>Who</b> (a staff name, or &quot;system&quot; / &quot;webhook&quot; for automatic changes), the{" "}
            <b>Action</b>, the record it changed, and the new values.
          </P>
        </>
      ),
    },
    {
      id: "search",
      title: "Search the log",
      body: (
        <>
          <P>
            The log shows 50 entries per page, newest first. Use the page numbers at the bottom to go further back, or change <Ui>Rows</Ui>{" "}
            to 25, 50 or 100. Type in the search box to narrow it down. You can search by:
          </P>
          <List>
            <>
              An action word, for example <b>approve</b>, <b>lock</b>, <b>staff</b>, <b>role</b> or <b>feeRate</b>.
            </>
            <>
              A type of record, for example <b>Payment</b>, <b>Enrollment</b> or <b>Batch</b>.
            </>
            <>A full ID, for example a payment&apos;s &quot;Our reference&quot; from its payment page.</>
          </List>
        </>
      ),
    },
  ],
};

const notifications: DocModule = {
  slug: "notifications",
  title: "Notifications and emails",
  summary: "Your in-app notifications, and the emails the system sends to students and staff.",
  icon: Bell,
  group: "Basics",
  href: "/admin/notifications",
  sections: [
    {
      id: "in-app",
      title: "In-app notifications",
      body: (
        <>
          <P>
            The bell in the top bar shows how many unread notifications you have. Click it to open{" "}
            <To href="/admin/notifications">Notifications</To>. The page shows 25 notifications at a time, newest first. Only the ones on
            the page you open are marked as read; older unread ones stay unread until you open their page. Click a title to go to the
            student or record it is about.
          </P>
          <Terms
            head={["Notification", "Who gets it"]}
            rows={[
              ["New student awaiting approval", "Everyone who can approve students, when a student makes their first payment."],
              [
                "Payment received on a closed enrollment",
                "Everyone who can see payments, when a Rejected or Cancelled student pays. Review it and decide what to do.",
              ],
            ]}
          />
          <P>If you also work in the CRM, its notifications (such as leads assigned to you) appear here too.</P>
        </>
      ),
    },
    {
      id: "emails",
      title: "Emails the system sends",
      body: (
        <>
          <Terms
            head={["Email", "When it is sent"]}
            rows={[
              ["Payment received", "To the student after every successful payment, with the remaining balance and due date if any."],
              [
                "You're in! Your Edge Academy access is active",
                "To the student when approved, with the portal link and the WhatsApp group link.",
              ],
              ["About your Edge Academy registration", "To the student when rejected, with your reason and the support email."],
              ["Course balance due …", "Balance reminders before the due date (7, 3, 1 and 0 days by default)."],
              [
                "Your Edge Academy access is paused",
                "When access is locked, automatically for an overdue balance (with a Pay balance button) or by staff (with your note).",
              ],
              [
                "Your Edge Academy access is restored",
                "When a student is unlocked, by staff, by a new due date, or by paying the balance.",
              ],
              [
                "Live class: …",
                "To the batch's Active students when a class is scheduled or its time changes, if you chose to email them.",
              ],
              ["Class cancelled: …", "To the batch's Active students when an upcoming class is cancelled, if you chose to email them."],
              [
                "Your Edge Academy staff account",
                "To new staff, and after a password reset, with the temporary password and sign-in link.",
              ],
              ["Reset your Edge Academy password", 'When someone uses "forgot password". The link works for one hour.'],
            ]}
          />
          <Note kind="info">
            Marketing emails (news, webinar invites) are not sent from here; they are sent from MailerLite to students who agreed to receive
            them.
          </Note>
        </>
      ),
    },
  ],
};

export const adminDocs: DocModule[] = [
  gettingStarted("/admin", "/security"),
  overview,
  approvals,
  students,
  balances,
  payments,
  batches,
  classes,
  recordings,
  staff,
  roles,
  settings,
  audit,
  notifications,
];

/* ------------------------------------------------------------------------------------------------
 * Staff portal (mentors)
 * ---------------------------------------------------------------------------------------------- */

const staffDashboard: DocModule = {
  slug: "dashboard",
  title: "Your dashboard",
  summary: "Your batches and your next classes at a glance.",
  icon: LayoutDashboard,
  group: "Basics",
  href: "/staff",
  sections: [
    {
      id: "what-for",
      title: "What this page shows",
      body: (
        <>
          <P>
            <To href="/staff">Dashboard</To> is your home page in the staff portal.
          </P>
          <List>
            <>
              <b>My batches</b>: the batches you teach that are open for enrollment or running, with their start date and number of active
              students.
            </>
            <>
              <b>Next classes</b>: your next scheduled classes with the batch and start time (Dubai). Use <Ui>Schedule or edit classes</Ui>{" "}
              to manage them.
            </>
          </List>
          <Note kind="tip">
            Don&apos;t see a batch you teach? Ask an admin to tick you as a mentor on that batch. Staff who manage every batch see{" "}
            <b>Running batches</b> instead.
          </Note>
        </>
      ),
    },
  ],
};

const staffClasses: DocModule = {
  slug: "classes",
  title: "Live classes",
  summary: "Schedule, edit and cancel the live Google Meet classes of the batches you teach.",
  icon: CalendarDays,
  group: "Teaching",
  href: "/staff/classes",
  sections: [
    {
      id: "what-for",
      title: "What this page is for",
      body: (
        <>
          <P>
            <To href="/staff/classes">Live classes</To> is where you plan your teaching. You can only schedule and change classes for the
            batches where you are a mentor. If you see &quot;You are not assigned to any batch yet&quot;, ask an admin to add you as a
            mentor on your batch.
          </P>
          <Note kind="info">
            To host classes in your own Google calendar, your staff profile needs your Google Workspace email. Ask an admin to add it if
            your classes show No link.
          </Note>
        </>
      ),
    },
    ...classSections(false),
  ],
};

const staffRecordings: DocModule = {
  slug: "recordings",
  title: "Recordings",
  summary: "Add a class recording from Google Drive, publish or hide it, and fix recordings that won't play.",
  icon: PlayCircle,
  group: "Teaching",
  href: "/staff/recordings",
  sections: [
    {
      id: "what-for",
      title: "What this page is for",
      body: (
        <P>
          <To href="/staff/recordings">Recordings</To> lists the recordings of the batches you teach, 25 per page, with where they came from
          (<b>Meet (auto)</b> or <b>Drive link</b>), status, streaming state and views. You can add, publish and hide recordings for your
          own batches only.
        </P>
      ),
    },
    ...recordingSections(false),
  ],
};

export const staffDocs: DocModule[] = [gettingStarted("/staff", "/security"), staffDashboard, staffClasses, staffRecordings];
