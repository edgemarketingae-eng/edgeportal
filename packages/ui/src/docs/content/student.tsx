import { BookOpen, CircleHelp, CreditCard, KeyRound, LayoutDashboard, PlayCircle, User, Video } from "lucide-react";
import { List, Note, P, Steps, Terms, To, Ui } from "../kit";
import type { DocModule } from "../types";

/** Student portal guides. Every label inside <Ui> matches the screen; check apps/student before renaming anything. */
export const studentDocs: DocModule[] = [
  // ---------------------------------------------------------------------------------------------
  {
    slug: "getting-started",
    title: "Getting started",
    summary: "Creating your account, verifying your mobile number and signing in.",
    icon: KeyRound,
    group: "Basics",
    href: "/dashboard",
    sections: [
      {
        id: "welcome",
        title: "Welcome to Edge Trading Academy",
        body: (
          <P>
            The student portal is your home at the academy. Here you see your batch, pay your course fee, join live classes, watch
            recordings and keep your details up to date. These short guides walk you through each part. You can open them any time with the{" "}
            <Ui>?</Ui> button at the top of the page or <Ui>Help</Ui> in the menu.
          </P>
        ),
      },
      {
        id: "sign-up",
        title: "Creating your account",
        body: (
          <>
            <Steps>
              <>
                On the sign-up page, enter your <Ui>Full name</Ui> and <Ui>Email</Ui>.
              </>
              <>
                Enter your <Ui>Mobile number (WhatsApp)</Ui>. First pick your country code in the small list next to the box (it shows a
                flag and, for example, +971), then type your number. We send a code to this number.
              </>
              <>
                Check your <Ui>Country of residence</Ui>. It is filled in from your phone&apos;s country code, but you can change it if you
                live somewhere else. It decides whether VAT applies and which payment methods you can use.
              </>
              <>
                Choose a <Ui>Password</Ui> of at least 8 characters.
              </>
              <>
                If you already have a Jeta FX trading account, add your <Ui>Jeta FX client ID (optional)</Ui>. You can also add it later.
              </>
              <>
                Next to <Ui>Send code by</Ui>, choose <Ui>SMS</Ui> or <Ui>WhatsApp</Ui>.
              </>
              <>
                Tick the box to agree to the academy terms. Leave the news box ticked if you&apos;d like webinar invites and academy news.
              </>
              <>
                Press <Ui>Create account</Ui>.
              </>
            </Steps>
            <Note kind="warning" title="Pick your country of residence carefully">
              Choose the country where you live, even if your mobile number is from another country. If you picked the wrong one, contact
              the academy to correct it before you pay.
            </Note>
          </>
        ),
      },
      {
        id: "verify",
        title: "Verifying your mobile number",
        body: (
          <>
            <P>Right after signing up, you are asked for the 6-digit code we sent to your mobile.</P>
            <Steps>
              <>Open the SMS or WhatsApp message and type the code into the boxes.</>
              <>
                Press <Ui>Verify mobile number</Ui>.
              </>
            </Steps>
            <List>
              <>
                No code? Wait a minute, then press <Ui>Resend code</Ui>. You can switch between SMS and WhatsApp first.
              </>
              <>
                Typed the wrong number? Press <Ui>Wrong number?</Ui>, pick the country code and enter the <Ui>New mobile number</Ui>, then
                press <Ui>Send code to new number</Ui>.
              </>
            </List>
            <P>
              Once your number is verified, you are placed in the batch that is currently open for enrollment, and your dashboard opens.
            </P>
          </>
        ),
      },
      {
        id: "created-for-you",
        title: "If the academy created your account for you",
        body: (
          <>
            <P>
              Sometimes our team creates your account after talking with you. In that case you receive an email with a link to choose your
              password.
            </P>
            <Steps>
              <>Open the link in the email and choose your password. The link works for 7 days.</>
              <>Sign in. You are then asked to verify your mobile number with a code, as described above.</>
            </Steps>
            <Note kind="tip">Link expired? Ask the academy to send it again, or use Forgot password (below).</Note>
          </>
        ),
      },
      {
        id: "sign-in",
        title: "Signing in",
        body: (
          <>
            <P>The sign-in page has two tabs. Use whichever is easier.</P>
            <List>
              <>
                <Ui>Password</Ui>: enter your <Ui>Email or mobile number</Ui> and your password, then press <Ui>Sign in</Ui>. If you use
                your mobile number, type it with your country code, for example +971 50 123 4567.
              </>
              <>
                <Ui>One-time code</Ui>: pick your country code, enter your <Ui>Mobile number</Ui>, choose SMS or WhatsApp, press{" "}
                <Ui>Send code</Ui>, type the 6-digit code and press <Ui>Verify and sign in</Ui>. No password needed.
              </>
            </List>
          </>
        ),
      },
      {
        id: "forgot",
        title: "Forgot your password",
        body: (
          <>
            <Steps>
              <>
                On the sign-in page, press <Ui>Forgot password?</Ui>.
              </>
              <>
                Enter your email and press <Ui>Send reset link</Ui>.
              </>
              <>Open the email and choose a new password. The link works for one hour.</>
            </Steps>
            <Note kind="tip">
              In a hurry? Sign in with the <Ui>One-time code</Ui> tab instead. You can change your password later from{" "}
              <To href="/profile">Profile</To>.
            </Note>
          </>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "dashboard",
    title: "Your dashboard",
    summary: "What the message at the top of your dashboard means and what to do next.",
    icon: LayoutDashboard,
    group: "Basics",
    href: "/dashboard",
    sections: [
      {
        id: "overview",
        title: "What you see",
        body: (
          <>
            <P>Your dashboard shows, at a glance:</P>
            <List>
              <>
                <Ui>Your batch</Ui>: its name and start date. <Ui>Batch details</Ui> opens the full batch page.
              </>
              <>
                <Ui>Course fee</Ui>: how much you have paid. It says <Ui>Fully paid</Ui>, <Ui>Advance paid</Ui> or <Ui>Not paid yet</Ui>.
              </>
              <>
                <Ui>Next live class</Ui>: the next class and its time in Dubai time. Shown when your access is active.
              </>
              <>
                <Ui>Your batch WhatsApp group</Ui>: press <Ui>Join the group</Ui> to meet your batch. Shown when your access is active.
              </>
            </List>
          </>
        ),
      },
      {
        id: "messages",
        title: "The message at the top",
        body: (
          <>
            <P>When something needs your attention, a message appears at the top of the page. Here is what each one means:</P>
            <Terms
              head={["Message", "What it means and what to do"]}
              rows={[
                [
                  "Complete your enrollment",
                  <>
                    You have a place in a batch but haven&apos;t paid yet. Press <Ui>Choose a payment plan</Ui> to pay in full or pay an
                    advance.
                  </>,
                ],
                [
                  "Payment received. We are verifying your registration.",
                  "Thank you! Our team is checking your registration. This usually takes less than one working day. We email you when your access is active.",
                ],
                [
                  "Your access is paused",
                  <>
                    Your course balance was not paid by its due date. Press the <Ui>Pay</Ui> button in the message to pay the balance. Your
                    access returns immediately.
                  </>,
                ],
                [
                  "Your access is paused by the academy",
                  "The academy has paused your access. Please contact the academy using the email in the message.",
                ],
                [
                  "We could not approve your registration",
                  "Your registration was not approved. The reason is shown if there is one. Please contact the academy using the email in the message.",
                ],
                ["This enrollment was cancelled", "Your enrollment was cancelled. If you think this is a mistake, contact the academy."],
                [
                  "No batch is open for enrollment right now",
                  "There is no open batch at the moment. We email you as soon as the next batch opens.",
                ],
              ]}
            />
            <P>No message means everything is in order and your access is active.</P>
          </>
        ),
      },
      {
        id: "balance",
        title: "If you paid an advance",
        body: (
          <P>
            While you have a balance to pay, a yellow box shows the amount, the due date and how many days are left. Press{" "}
            <Ui>Pay balance</Ui> to pay it. Access pauses automatically if the balance is not paid in time.
          </P>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "batch",
    title: "Your batch",
    summary: "Your program details, schedule, mentors and fees.",
    icon: BookOpen,
    group: "Your course",
    href: "/batch",
    sections: [
      {
        id: "batch",
        title: "What a batch is",
        body: (
          <>
            <P>
              A batch is the group of students who start the program together, with the same schedule and mentors. The{" "}
              <To href="/batch">My batch</To> page shows:
            </P>
            <List>
              <>
                <Ui>About this program</Ui>: what you will learn, the start and end dates and the class schedule.
              </>
              <>
                <Ui>Mentors</Ui>: the people who teach your batch.
              </>
              <>
                <Ui>Fees</Ui>: the course fee, and the smallest advance you can pay to reserve your seat (when advances are offered).
              </>
            </List>
            <P>
              When you still have something to pay, the <Ui>Fees</Ui> box has a button to do it: <Ui>Choose a payment plan</Ui> for your
              first payment, or <Ui>Pay balance</Ui> for the rest.
            </P>
          </>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "paying",
    title: "Paying your course fee",
    summary: "Paying in full or with an advance, VAT and processing fees, the balance due date, receipts and invoices.",
    icon: CreditCard,
    group: "Your course",
    href: "/payments",
    sections: [
      {
        id: "plans",
        title: "Pay in full or pay an advance",
        body: (
          <Terms
            head={["Plan", "What you get"]}
            rows={[
              [
                "Pay in full",
                "You pay the whole course fee now. This gives lifetime access to your batch recordings and future live classes.",
              ],
              [
                "Pay an advance",
                "You pay part of the fee now to reserve your seat (there is a minimum amount). You get full access until the balance due date, and pay the rest before then.",
              ],
            ]}
          />
        ),
      },
      {
        id: "how-to-pay",
        title: "How to pay",
        body: (
          <>
            <Steps>
              <>
                On your dashboard or the My batch page, press <Ui>Choose a payment plan</Ui>.
              </>
              <>
                Pick <Ui>Pay in full</Ui> or <Ui>Pay an advance</Ui>. For an advance, choose one of the amounts, or <Ui>Other amount</Ui> to
                type your own (at least the minimum shown).
              </>
              <>
                Pick a <Ui>Payment method</Ui>. Each method shows its total, because the processing fee depends on the method. A method that
                is greyed out is not available for that amount. The methods you see depend on your country of residence.
              </>
              <>
                Check the <Ui>Summary</Ui> on the right, then press <Ui>Pay</Ui>.
              </>
              <>Complete the payment on the provider&apos;s secure page. You then return to the portal.</>
            </Steps>
            <P>
              Wait a few seconds on the payment page while we confirm. It updates by itself. When it says <Ui>Payment successful</Ui>,
              you&apos;re done. After your first payment, our team verifies your registration (usually less than one working day) and your
              access becomes active.
            </P>
            <Note kind="warning">Course fees are non-refundable. Please check the amount before you pay.</Note>
          </>
        ),
      },
      {
        id: "summary",
        title: "Understanding the total",
        body: (
          <>
            <Terms
              head={["Line", "Meaning"]}
              rows={[
                ["Course amount", "The part of the course fee you are paying now."],
                ["VAT (5%)", "UAE VAT on the course amount. It applies only when your country of residence is the UAE."],
                [
                  "Payment processing fee",
                  "The cost of the payment method you chose. It is different for each method. For UAE residents it includes VAT.",
                ],
                ["Total to pay", "What you are charged."],
              ]}
            />
            <Note kind="info" title="VAT follows your country of residence">
              VAT is based on the <b>country of residence</b> you chose when you signed up, not on your phone number. Once you have made
              your first payment for a course, the same VAT stays for the rest of that course&apos;s payments. If your country is wrong,
              contact the academy before you pay so they can correct it.
            </Note>
          </>
        ),
      },
      {
        id: "balance",
        title: "Paying the balance",
        body: (
          <>
            <P>If you paid an advance, your balance has a due date. You see it on your dashboard and we email you reminders before it.</P>
            <Steps>
              <>
                Press <Ui>Pay balance</Ui> on your dashboard or the My batch page.
              </>
              <>Pick a payment method, check the total and pay.</>
            </Steps>
            <Note kind="warning" title="If the due date passes">
              If the balance isn&apos;t paid in time, your access to live classes and recordings pauses automatically. Pay the balance and
              it comes back straight away.
            </Note>
          </>
        ),
      },
      {
        id: "history",
        title: "Receipts, invoices and payment history",
        body: (
          <>
            <P>
              <To href="/payments">Payments</To> lists every payment with its date, type, method, amount and status. Click a date to see the
              details.
            </P>
            <List>
              <>A receipt is emailed to you after each successful payment.</>
              <>
                When your invoice is ready, a <Ui>Download invoice</Ui> button appears on the payment.
              </>
            </List>
            <Terms
              head={["Status", "Meaning"]}
              rows={[
                ["Paid", "The payment went through."],
                ["Started, Pending, Authorised", "We are still confirming it. The payment page updates by itself."],
                [
                  "Failed, Cancelled, Expired",
                  "The payment didn't go through and no money was taken. Press Try again on the payment to pay again.",
                ],
              ]}
            />
          </>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "classes",
    title: "Live classes",
    summary: "Joining your live classes on Google Meet, class times and when the Join button opens.",
    icon: Video,
    group: "Your course",
    href: "/classes",
    sections: [
      {
        id: "join",
        title: "Joining a class",
        body: (
          <>
            <P>
              <To href="/classes">Live classes</To> lists your upcoming classes with the title, time and mentor. Classes run on Google Meet.
            </P>
            <Steps>
              <>Open Live classes a little before the start time.</>
              <>
                The join button opens shortly before the class starts (15 minutes before, unless the academy changes it). Until then it is
                greyed out and says when it opens, for example <Ui>Opens 15 min before</Ui>.
              </>
              <>
                Press <Ui>Join now</Ui>. Google Meet opens in a new tab.
              </>
            </Steps>
            <Note kind="info">All class times are Dubai time (GMT+4). If you live elsewhere, convert to your local time.</Note>
          </>
        ),
      },
      {
        id: "more",
        title: "Good to know",
        body: (
          <List>
            <>
              <Ui>Recent classes</Ui> at the bottom lists past classes. When a recording is ready, press <Ui>Watch recording</Ui>.
            </>
            <>If a class has no meeting link yet, the page tells you. Check back shortly.</>
            <>
              If you have paid in full, you may also see classes from later batches that are open to past students. They are marked with the
              batch name.
            </>
            <>
              If Live classes shows a lock in the menu, your access isn&apos;t active yet or is paused. Check the message on your{" "}
              <To href="/dashboard">dashboard</To>.
            </>
          </List>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "recordings",
    title: "Recordings",
    summary: "Watching the recorded classes of your batch.",
    icon: PlayCircle,
    group: "Your course",
    href: "/recordings",
    sections: [
      {
        id: "watch",
        title: "Watching a recording",
        body: (
          <>
            <Steps>
              <>
                Open <To href="/recordings">Recordings</To>. Recordings of your batch appear here after each live class.
              </>
              <>Click a recording to play it.</>
            </Steps>
            <P>A new recording can take a moment to start the first time it is played.</P>
          </>
        ),
      },
      {
        id: "rules",
        title: "Personal study only",
        body: (
          <>
            <P>
              Recordings are for your personal study only. Sharing or re-uploading them is not allowed. Each video shows your name and part
              of your mobile number moving across the screen.
            </P>
            <Note kind="info">
              Recordings, like live classes, need active access. If Recordings shows a lock, check the message on your{" "}
              <To href="/dashboard">dashboard</To>.
            </Note>
          </>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "profile",
    title: "Your profile",
    summary: "Changing your name, Jeta FX client ID, news preferences and password.",
    icon: User,
    group: "Your account",
    href: "/profile",
    sections: [
      {
        id: "change",
        title: "What you can change",
        body: (
          <>
            <P>
              On <To href="/profile">Profile</To>, under <Ui>Your details</Ui>:
            </P>
            <List>
              <>
                <Ui>Full name</Ui>.
              </>
              <>
                <Ui>Jeta FX client ID</Ui>: the ID of your Jeta FX trading account, if you have one. Changes are recorded.
              </>
              <>The box for academy news and webinar invites by email and WhatsApp. Untick it if you don&apos;t want them.</>
            </List>
            <P>
              Press <Ui>Save changes</Ui>.
            </P>
          </>
        ),
      },
      {
        id: "academy-only",
        title: "Email, mobile and country",
        body: (
          <P>
            Your email, mobile number and country of residence (<Ui>Country (for VAT)</Ui>) are shown under <Ui>Sign-in</Ui>. Your country
            decides whether UAE VAT applies and which payment methods you can use. To change any of these, contact the academy.
          </P>
        ),
      },
      {
        id: "password",
        title: "Changing your password",
        body: (
          <P>
            On Profile, press <Ui>Change password</Ui>. Enter your current password and your new password twice (at least 8 characters),
            then press <Ui>Save password</Ui>.
          </P>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "help",
    title: "Getting help",
    summary: "Who to contact when something isn't right.",
    icon: CircleHelp,
    group: "Your account",
    sections: [
      {
        id: "contact",
        title: "Contacting the academy",
        body: (
          <>
            <List>
              <>
                For questions about your registration, payments or access, email the academy. The support email address is shown in the
                messages on your <To href="/dashboard">dashboard</To> whenever there is something to sort out.
              </>
              <>
                For questions about classes and lessons, ask in your batch WhatsApp group (<Ui>Join the group</Ui> on your dashboard) or
                speak to your mentors.
              </>
              <>
                Notifications from the academy appear under the bell at the top of the page. The notifications page shows 25 at a time; only
                the ones on the page you open are marked as read.
              </>
            </List>
            <Note kind="tip">
              When you write to us about a payment, include the <Ui>Reference</Ui> shown on that payment&apos;s page. It helps us find it
              quickly.
            </Note>
          </>
        ),
      },
      {
        id: "common",
        title: "Quick answers",
        body: (
          <Terms
            head={["Problem", "What to do"]}
            rows={[
              ["I didn't get my code", "Press Resend code. Try WhatsApp instead of SMS, or the other way round."],
              ["I forgot my password", "Use Forgot password? on the sign-in page, or sign in with a one-time code."],
              [
                "The Join button is greyed out",
                "It opens shortly before the class starts (15 minutes by default). Class times are Dubai time.",
              ],
              [
                "Classes and recordings are locked",
                "Your access isn't active yet or is paused. The message on your dashboard explains why.",
              ],
              ["My payment failed", "No money was taken. Open the payment and press Try again, or choose another method."],
            ]}
          />
        ),
      },
    ],
  },
];
