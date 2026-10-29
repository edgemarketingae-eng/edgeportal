import {
  Banknote,
  CheckSquare,
  FolderKanban,
  GraduationCap,
  IdCard,
  KeyRound,
  LayoutDashboard,
  MessageSquareText,
  Package,
  Settings,
  Trash2,
  Trophy,
  Upload,
  Users,
  UsersRound,
} from "lucide-react";
import { Flow, List, Note, P, Steps, Terms, To, Ui } from "../kit";
import type { DocModule } from "../types";

/** CRM guides. Every label inside <Ui> matches the screen; check apps/crm before renaming anything. */
export const crmDocs: DocModule[] = [
  // ---------------------------------------------------------------------------------------------
  {
    slug: "getting-started",
    title: "Getting started",
    summary: "Signing in for the first time, your password, two-factor sign-in and finding your way around.",
    icon: KeyRound,
    group: "Basics",
    href: "/dashboard",
    sections: [
      {
        id: "first-sign-in",
        title: "Your first sign-in",
        body: (
          <>
            <P>A CRM admin (or an academy admin) creates your account. You receive an email with a temporary password.</P>
            <Steps>
              <>
                Open the CRM sign-in page and enter your <Ui>Work email</Ui> and the temporary password. Press <Ui>Sign in</Ui>.
              </>
              <>
                The CRM asks you to <b>set your password</b>. Type the temporary password, then your new password twice (at least 8
                characters), and press <Ui>Save password</Ui>. You can&apos;t open anything else until you do.
              </>
              <>
                <b>CRM admins only:</b> you are then asked to turn on two-factor sign-in. Install an authenticator app (Google
                Authenticator, Microsoft Authenticator or 1Password), confirm your password, press <Ui>Set up authenticator app</Ui>, scan
                the QR code and enter the 6-digit code. Press <Ui>Turn on two-factor</Ui>.
              </>
              <>You land on the dashboard. That&apos;s it.</>
            </Steps>
            <Note kind="warning" title="Keep your backup codes">
              When you set up two-factor sign-in, the CRM shows a list of backup codes. Save them somewhere safe. Each one works once if you
              lose your phone. At sign-in, press <Ui>Use a backup code instead</Ui>.
            </Note>
            <Note kind="tip">
              Lost the welcome email? Ask a CRM admin. They can see your temporary password on the team list until you sign in, or reset it
              for you.
            </Note>
          </>
        ),
      },
      {
        id: "forgot-password",
        title: "Forgot your password",
        body: (
          <Steps>
            <>
              On the sign-in page, press <Ui>Forgot password?</Ui>.
            </>
            <>
              Enter your email and press <Ui>Send reset link</Ui>.
            </>
            <>Open the email and choose a new password. The link works for one hour.</>
          </Steps>
        ),
      },
      {
        id: "find-your-way",
        title: "Finding your way around",
        body: (
          <>
            <List>
              <>
                The menu on the left only shows the pages your role can use. A sales executive sees fewer pages than a CRM admin. That is
                normal.
              </>
              <>
                The <Ui>Tasks</Ui> menu item shows a number: how many of your tasks are due today or overdue.
              </>
              <>
                The bell at the top shows your notifications, such as a lead assigned to you or your daily list of follow-ups. A dot means
                you have unread ones. The notifications page shows 25 at a time, newest first; only the ones on the page you open are marked
                as read.
              </>
              <>
                The <Ui>?</Ui> button next to the bell opens these guides. Most pages also have a <Ui>How this works</Ui> link under the
                title.
              </>
              <>Click your name in the top-right corner to change your password, manage two-factor sign-in or sign out.</>
              <>If you also work in the academy admin panel or staff portal, switch to it from the same menu under your name.</>
            </List>
            <Note kind="info">
              If you open a page your role can&apos;t use, you are sent back to the dashboard with the message{" "}
              <Ui>You do not have permission for that page.</Ui> Ask a CRM admin if you think you need it.
            </Note>
          </>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "roles",
    title: "Your role in the CRM",
    summary: "What CRM admins, CRM managers, project managers and sales executives can see and do.",
    icon: IdCard,
    group: "Basics",
    sections: [
      {
        id: "roles",
        title: "The four CRM roles",
        body: (
          <>
            <Terms
              head={["Role", "What you see and do"]}
              rows={[
                [
                  "CRM admin",
                  <>
                    Everything in the CRM. Sees every project and every lead. Also adds and manages CRM staff, edits CRM roles, changes CRM
                    settings, imports leads, merges duplicates and can delete leads. The only CRM role that sets commission rates, verifies
                    JetaFX deposits and sees everyone&apos;s commission. Must use two-factor sign-in.
                  </>,
                ],
                [
                  "CRM manager",
                  <>
                    Sees every project and every lead. Creates projects and picks their managers and team, assigns leads to anyone, converts
                    leads, manages products, changes CRM settings, imports leads and merges duplicates. Does not manage staff accounts or
                    commission.
                  </>,
                ],
                [
                  "Project manager",
                  <>
                    Runs the projects they manage: sees every lead and task inside them, assigns leads and tasks to their team, and converts
                    leads. Outside their projects, they see only their own leads.
                  </>,
                ],
                [
                  "Sales executive",
                  <>
                    Works their own leads and follow-ups. Also sees the <b>unassigned</b> leads of their projects and of the General
                    project, and can claim them. Can convert their leads into students, mark product conversions and log JetaFX deposits,
                    which earn them commission once verified. Receives round-robin leads in the projects they are on and in the General
                    project.
                  </>,
                ],
              ]}
            />
            <Note kind="info">
              Academy admins can also open the CRM at any time and see everything. A person can hold more than one role; the permissions add
              up.
            </Note>
          </>
        ),
      },
      {
        id: "who-sees-what",
        title: "Who sees which leads and tasks",
        body: (
          <Terms
            head={["Who", "Leads and tasks they see"]}
            rows={[
              ["CRM admin, CRM manager", "Every lead and every task."],
              ["Project manager", "Every lead and task in the projects they manage, plus their own leads and tasks anywhere else."],
              [
                "Sales executive",
                "Leads they own, plus unassigned leads in their projects and in the General project. Tasks assigned to them or created by them.",
              ],
            ]}
          />
        ),
      },
      {
        id: "day-in-the-life",
        title: "A day in the life",
        body: (
          <>
            <P>
              <b>Sales executive</b>
            </P>
            <Steps>
              <>
                Open <To href="/tasks">Tasks</To> (or the <Ui>My tasks today</Ui> panel on the dashboard) and work through what is due.
              </>
              <>
                On <To href="/leads">Leads</To>, check <Ui>Unassigned</Ui> and claim new enquiries.
              </>
              <>After every call or message, log it on the lead and schedule the next follow-up in the same step.</>
              <>Move leads forward through the stages, and convert them when they are ready to enroll.</>
              <>
                Mark each <b>conversion</b> (Inner Circle, the premium course, a club) and log every JetaFX <b>deposit</b> on the lead.
                Check your place on the <To href="/leaderboard">Leaderboard</To>.
              </>
            </Steps>
            <P>
              <b>Project manager</b>
            </P>
            <Steps>
              <>
                Open the dashboard, pick your project in the <Ui>Project</Ui> filter and check <Ui>Untouched</Ui> leads and{" "}
                <Ui>Overdue tasks</Ui>.
              </>
              <>Assign unassigned leads to your team so nothing waits.</>
              <>
                Look at the <Ui>Team</Ui> panel to see who is overloaded or behind, and rebalance.
              </>
            </Steps>
            <P>
              <b>CRM manager or CRM admin</b>
            </P>
            <Steps>
              <>Review the dashboard across all projects: funnel, win rate, first response time and results by source.</>
              <>Move leads from the General project into the right campaign projects.</>
              <>Set up new projects and teams, import lead lists and clean up duplicates.</>
              <>CRM admins also add new staff and look after their accounts.</>
            </Steps>
          </>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "dashboard",
    title: "The dashboard",
    summary: "Every number and panel on the dashboard, and what to do with it.",
    icon: LayoutDashboard,
    group: "Basics",
    audience: ["crm.read"],
    href: "/dashboard",
    sections: [
      {
        id: "what-for",
        title: "What it is for",
        body: (
          <>
            <P>
              The dashboard is your morning check. It shows the leads and tasks <b>you are allowed to see</b>: everything for CRM admins and
              managers, your projects and your own work for everyone else.
            </P>
            <List>
              <>
                Use the <Ui>Project</Ui> filter at the top to look at one project. <Ui>All my projects</Ui> shows everything you can see.
              </>
              <>Most numbers are links. Click one to open the matching list of leads or tasks.</>
              <>
                <Ui>New lead</Ui> opens the full lead form.
              </>
            </List>
          </>
        ),
      },
      {
        id: "cards",
        title: "The number cards",
        body: (
          <>
            <Terms
              head={["Card", "What it counts"]}
              rows={[
                [<Ui key="a">Open leads</Ui>, "Leads still in progress (New, Contacted, Qualified, Consultation or Negotiation)."],
                [<Ui key="b">New this week</Ui>, "Leads created in the last 7 days. The small line shows how many came in today."],
                [
                  <Ui key="c">{"Untouched > 24h"}</Ui>,
                  "New leads that nobody has contacted within the first-response time (24 hours unless your CRM admin changed it). Turns amber when there are any. Contact these first.",
                ],
                [
                  <Ui key="d">Overdue tasks</Ui>,
                  "Open tasks whose due date has passed. Turns red when there are any. The small line shows how many are due today.",
                ],
                [
                  <Ui key="e">Converted this month</Ui>,
                  "Leads that became students since the 1st of this month. The small line shows how many were lost.",
                ],
                [<Ui key="f">Win rate (90 days)</Ui>, "Converted ÷ (converted + lost) over the last 90 days."],
                [
                  <Ui key="g">First response</Ui>,
                  "The typical (median) time between a lead arriving and the first contact, for leads first contacted in the last 30 days.",
                ],
                [<Ui key="h">Lost this month</Ui>, "Leads marked Lost since the 1st of this month."],
              ]}
            />
            <Note kind="info">
              A dash (–) means there is not enough data yet, for example no converted or lost leads in the last 90 days.
            </Note>
          </>
        ),
      },
      {
        id: "panels",
        title: "The panels",
        body: (
          <Terms
            head={["Panel", "What it shows"]}
            rows={[
              [<Ui key="a">Funnel</Ui>, "How many leads sit in each stage right now. Click a stage to see those leads."],
              [
                <Ui key="b">My tasks today</Ui>,
                <>
                  Your tasks that are overdue or due today, oldest first. Click a name to open the lead. <Ui>Open the board</Ui> takes you
                  to Tasks.
                </>,
              ],
              [
                <Ui key="c">Projects</Ui>,
                "Each active project: open leads, conversions this month (against the target, if set) and overdue tasks.",
              ],
              [
                <Ui key="d">By source</Ui>,
                "Where leads come from and how far they get: total leads, how many were contacted, converted, and paid (the student has made a payment).",
              ],
              [
                <Ui key="e">Team</Ui>,
                "Per person: open leads, overdue tasks and conversions this month. Shown when there are owned leads in your view.",
              ],
            ]}
          />
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "leads",
    title: "Finding and adding leads",
    summary: "The leads list: quick views, filters, search, pages, adding leads, duplicates, export, bulk assign and round-robin.",
    icon: Users,
    group: "Leads",
    audience: ["crm.read"],
    href: "/leads",
    sections: [
      {
        id: "what-for",
        title: "What a lead is",
        body: (
          <>
            <P>
              A lead is a person who is interested in the academy but is not a student yet. Every lead belongs to one project, may have an
              owner (the salesperson working it) and moves through stages until it becomes a student or is lost.
            </P>
            <P>
              The <To href="/leads">Leads</To> page lists the leads you can see. By default it shows <b>open</b> leads only, with the most
              recently active first. Converted and lost leads are hidden until you pick them.
            </P>
          </>
        ),
      },
      {
        id: "views-and-filters",
        title: "Quick views, filters and search",
        body: (
          <>
            <P>The row of buttons at the top are ready-made views:</P>
            <Terms
              rows={[
                [<Ui key="a">Open</Ui>, "All open leads (the default)."],
                [<Ui key="b">Mine</Ui>, "Leads you own."],
                [<Ui key="c">Unassigned</Ui>, "Leads with no owner yet. Claim them or assign them."],
                [<Ui key="d">Overdue</Ui>, "Leads whose next follow-up is in the past."],
                [<Ui key="e">Hot</Ui>, "Leads marked Hot."],
                [<Ui key="f">New today</Ui>, "Leads created today."],
                [<Ui key="g">Converted</Ui>, "Leads that became students."],
                [<Ui key="h">Lost</Ui>, "Leads marked Lost."],
                [<Ui key="i">All</Ui>, "Every lead, open or closed."],
              ]}
            />
            <P>
              For anything else, use the search box and the filters: <Ui>Project</Ui>, <Ui>Stage</Ui>, <Ui>Source</Ui>, <Ui>Owner</Ui>,{" "}
              <Ui>Temperature</Ui>, <Ui>Batch</Ui>, <Ui>Follow-up</Ui> (overdue, due today, due this week, no follow-up), <Ui>Created</Ui>{" "}
              and <Ui>Sort</Ui>.
            </P>
            <List>
              <>
                Search finds a lead in <b>any stage</b>, converted and lost ones too, unless you pick a <Ui>Stage</Ui>. You only see leads
                you have access to.
              </>
              <>
                Type a name, email, tag or source; the words can be in any order (<i>hassan ali</i> finds Ali Hassan).
              </>
              <>
                Type a number to find a mobile however it is written (<i>050 123 4567</i>, <i>+971501234567</i>), a JetaFX client ID, or a
                second number kept in the lead&apos;s notes.
              </>
              <>Text from the lead&apos;s notes, such as a website message, is searched too.</>
            </List>
            <Note kind="tip">The WhatsApp and phone icons next to a mobile number open a chat or a call straight from the list.</Note>
          </>
        ),
      },
      {
        id: "pages",
        title: "Pages",
        body: (
          <>
            <P>
              The list shows 50 leads per page. The line at the bottom tells you which ones you are looking at, for example Showing 1–50 of
              320 leads.
            </P>
            <List>
              <>Use the page numbers and arrows at the bottom to move between pages. Your view, filters and search stay as they are.</>
              <>
                Change <Ui>Rows</Ui> at the bottom to see 25, 50 or 100 leads per page.
              </>
            </List>
          </>
        ),
      },
      {
        id: "add",
        title: "Adding a lead",
        body: (
          <>
            <P>
              <b>Quick add</b> is the fastest way: a name plus a mobile number or an email is enough.
            </P>
            <Steps>
              <>
                On <To href="/leads">Leads</To>, press <Ui>Quick add</Ui>.
              </>
              <>
                Enter the <Ui>Name</Ui> and the <Ui>Mobile (WhatsApp)</Ui> and/or the <Ui>Email</Ui>. For the mobile, pick the country code
                in the small list next to the box (it shows a flag and, for example, +971), then type the number. You can also type the full
                number starting with + and the list follows it.
              </>
              <>
                Pick the <Ui>Source</Ui> and the <Ui>Project</Ui>. If you can assign in that project, choose an <Ui>Owner</Ui> (or{" "}
                <Ui>Unassigned (pool)</Ui>).
              </>
              <>
                Optionally set a <Ui>Next follow-up (optional)</Ui> date and add notes. Press <Ui>Add lead</Ui>.
              </>
            </Steps>
            <P>
              <b>Full form</b> (<Ui>Full form</Ui> button, or <Ui>New lead</Ui> on the dashboard) lets you fill in everything at once:
              country, language, preferred channel, consents, course and batch of interest, trading experience, temperature, tags and a
              first follow-up. Press <Ui>Create lead</Ui>.
            </P>
            <P>
              <Ui>Country</Ui> is a list of countries. Leave it on <Ui>Detect from mobile</Ui> and the CRM uses the country of the mobile
              number&apos;s code.
            </P>
            <Note kind="warning" title="Always check the country code">
              The CRM never guesses that a number is from the UAE. A number typed without + is saved with the country code shown in the list
              next to it, so check it is right before you save.
            </Note>
            <Note kind="info">
              If you don&apos;t choose an owner, a lead you create is yours. When a project has a target course or batch, new leads in it
              are marked as interested in that course or batch automatically.
            </Note>
          </>
        ),
      },
      {
        id: "duplicates",
        title: "Duplicates",
        body: (
          <>
            <P>
              The CRM refuses a new lead when another lead already has the same mobile number or email. The message names the existing lead.
              Open that lead instead of creating a second one.
            </P>
            <P>
              If it really is a different person (for example two family members sharing an email), use <Ui>Quick add</Ui> and tick{" "}
              <Ui>Create even if a lead with this contact already exists</Ui>.
            </P>
            <List>
              <>If the contact already has a student account, the lead is created already linked to that student and marked Converted.</>
              <>A mobile number or email that belongs to a staff account can&apos;t be used for a lead.</>
              <>
                On a lead page, a <Ui>Possible duplicates</Ui> box lists other leads with the same contact. CRM managers and admins can
                merge them (see Working a lead).
              </>
            </List>
          </>
        ),
      },
      {
        id: "claim-assign",
        title: "Claiming and assigning leads",
        body: (
          <>
            <P>
              <b>Claim a lead</b> (sales executives): open an unassigned lead and press <Ui>Claim this lead</Ui>. It becomes yours and
              leaves the pool.
            </P>
            <P>
              <b>Assign several leads at once</b> (project managers, CRM managers and admins):
            </P>
            <Steps>
              <>Tick the leads in the list. To pick every lead on the page, tick the box in the list&apos;s header row.</>
              <>
                When there are more leads on other pages, a line appears above the list with a link such as{" "}
                <Ui>Select all 320 leads matching these filters</Ui>. Press it to include every lead your view, filters and search match, on
                every page. Press <Ui>Only this page</Ui> to go back.
              </>
              <>
                The bar above the list shows how many are selected (for example <Ui>12 selected</Ui>). Open <Ui>Assign to…</Ui> and choose:
                <List>
                  <>
                    <Ui>Round-robin to sales executives</Ui>: shares the leads out fairly (see the next section).
                  </>
                  <>A person: every selected lead goes to them.</>
                  <>
                    <Ui>Unassign (back to the pool)</Ui>: the leads lose their owner and wait in the unassigned pool.
                  </>
                </List>
              </>
              <>
                Press <Ui>Assign</Ui>. A message tells you how many leads were assigned and how many were skipped.
              </>
            </Steps>
            <List>
              <>
                Nothing happens until you choose an option in <Ui>Assign to…</Ui>. Leads are never unassigned by mistake.
              </>
              <>You can only assign to people on the project&apos;s team. Leads you can&apos;t assign are skipped.</>
              <>
                One action covers at most 2,000 leads. If more match, the CRM asks you to narrow the filters (for example pick a{" "}
                <Ui>Project</Ui> or <Ui>Source</Ui>) and try again.
              </>
              <>
                <Ui>Clear</Ui> removes the selection. Changing page or filters also starts the selection again.
              </>
            </List>
          </>
        ),
      },
      {
        id: "round-robin",
        title: "Round-robin: sharing leads fairly",
        body: (
          <>
            <P>
              Round-robin hands leads out one at a time, each to the sales executive who has the <b>fewest open leads in that project</b> at
              that moment. A batch of leads is spread evenly, and people who already have a lot get fewer.
            </P>
            <List>
              <>
                Only active people with the <b>Sales executive</b> role who are on the project&apos;s team receive round-robin leads.
                Project managers, CRM managers and admins don&apos;t, unless they also hold the Sales executive role and are on the team.
              </>
              <>In the General project, which is open to everyone, every active sales executive takes part.</>
              <>
                People marked <b>Off</b> on the Team page are skipped until they&apos;re back on. You can still assign leads to them by
                hand; pickers show them as &ldquo;(Off)&rdquo;.
              </>
              <>Each lead is shared within its own project. If you select leads from several projects, each project is shared separately.</>
              <>
                Leads in a project with no sales executives are skipped and counted in the message. Add sales executives to the project (
                <Ui>Add people</Ui> on the project page) and try again.
              </>
            </List>
            <Note kind="info">
              The same rule is used when importing with round-robin, and for website leads when round-robin is switched on in CRM settings.
            </Note>
          </>
        ),
      },
      {
        id: "export",
        title: "Exporting to a spreadsheet",
        body: (
          <P>
            Set the view, filters and search you want, then press <Ui>Export CSV</Ui>. The file contains exactly the leads you are looking
            at, and opens in Excel or Google Sheets.
          </P>
        ),
      },
      {
        id: "reference",
        title: "Sources and temperature",
        body: (
          <>
            <P>
              <b>Source</b> is where the lead came from: Website, Instagram, Meta ads, Google ads, YouTube, TikTok, WhatsApp, Referral,
              Walk-in, Phone enquiry, Webinar, Event, Import or Other. Use <Ui>Source detail</Ui> for the campaign, post or referrer.
              Sources feed the <Ui>By source</Ui> panel on the dashboard, so pick them carefully.
            </P>
            <P>
              <b>Temperature</b> is your feeling about how ready the lead is to buy:
            </P>
            <Terms
              rows={[
                ["Hot", "Ready or nearly ready to enroll. Follow up quickly."],
                ["Warm", "Interested. This is the default for new leads."],
                [
                  "Cold",
                  "Gone quiet. An open lead with no activity for 7 days turns Cold automatically (the number of days is set by your CRM admin).",
                ],
              ]}
            />
            <P>
              Change the temperature with <Ui>Edit</Ui> on the lead page&apos;s Details card.
            </P>
          </>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "working-a-lead",
    title: "Working a lead",
    summary: "Contacting a lead, logging activities, follow-ups, stages, assigning, moving and merging.",
    icon: MessageSquareText,
    group: "Leads",
    audience: ["crm.read"],
    href: "/leads",
    sections: [
      {
        id: "lead-page",
        title: "The lead page",
        body: (
          <>
            <P>Click a lead&apos;s name anywhere in the CRM to open its page. You find:</P>
            <List>
              <>The buttons at the top for contacting, moving and converting the lead.</>
              <>
                <Ui>Details</Ui>: stage (with the products the lead converted to), next follow-up, course and batch of interest, experience,
                preferred channel and language, JetaFX client ID, consent, first and last contact, tags and notes. Press <Ui>Edit</Ui> on
                the Details card to change them in a dialog, then <Ui>Save lead</Ui>.
              </>
              <>
                <Ui>Tasks</Ui>: this lead&apos;s open follow-ups.
              </>
              <>
                <Ui>Conversions</Ui> and <Ui>Deposits</Ui>: the products the lead joined and their JetaFX deposits (see Products and
                conversions, and Deposits and commission).
              </>
              <>
                <Ui>Qualification</Ui>: the answers to the three questions you ask every lead.
              </>
              <>
                <Ui>Activity</Ui>: the full history of the lead, newest first, and the box for logging what you did. The latest 50 entries
                are shown; press <Ui>Show older activity</Ui> at the bottom to load more.
              </>
            </List>
          </>
        ),
      },
      {
        id: "contact",
        title: "Contacting the lead",
        body: (
          <>
            <List>
              <>
                <Ui>WhatsApp</Ui> opens a WhatsApp chat with a ready greeting from Edge Trading Academy. Edit it before sending if you like.
              </>
              <>
                <Ui>Call</Ui> starts a phone call (on a phone, or through your computer&apos;s calling app).
              </>
              <>
                <Ui>Email</Ui> opens a new email in your email app.
              </>
            </List>
            <Note kind="warning">
              These buttons don&apos;t record anything by themselves. Always log what happened afterwards (next section).
            </Note>
          </>
        ),
      },
      {
        id: "log",
        title: "Logging an activity and the next follow-up",
        body: (
          <>
            <Steps>
              <>
                In the <Ui>Activity</Ui> box, pick the type: <Ui>Note</Ui>, <Ui>Call</Ui>, <Ui>WhatsApp</Ui>, <Ui>Email</Ui> or{" "}
                <Ui>Meeting</Ui>.
              </>
              <>
                For a call, choose the <Ui>Outcome</Ui>: Answered, No answer, Busy, Wrong number or Asked to call back. For WhatsApp and
                email, choose the <Ui>Direction</Ui>: <Ui>Sent by us</Ui> or <Ui>Received from the lead</Ui>.
              </>
              <>Write what happened: budget, goals, objections, what you promised.</>
              <>
                Tick <Ui>Schedule the next follow-up</Ui>, pick <Ui>When</Ui>, and optionally a <Ui>Title</Ui> and <Ui>Type</Ui>.
              </>
              <>
                Press <Ui>Log activity</Ui>.
              </>
            </Steps>
            <Note kind="tip">
              Always schedule a next follow-up. A lead with no follow-up is easy to forget, and shows up under <Ui>No follow-up</Ui> in the
              filters.
            </Note>
            <Note kind="info">
              Logging a call, WhatsApp, email or meeting on a <b>New</b> lead moves it to <b>Contacted</b> automatically and records your
              first-response time. A note doesn&apos;t count as contact.
            </Note>
            <P>
              To add a follow-up without logging anything, press <Ui>Follow-up</Ui> in the <Ui>Tasks</Ui> box. Each follow-up there has{" "}
              <Ui>Done</Ui>, <Ui>Reschedule</Ui> and <Ui>Cancel</Ui> buttons (see Tasks and follow-ups).
            </P>
          </>
        ),
      },
      {
        id: "qualification",
        title: "Qualification questions",
        body: (
          <>
            <P>
              Ask every lead these three questions and write down what they say in the <Ui>Qualification</Ui> box on the lead page:
            </P>
            <List>
              <>
                <Ui>Trading experience and capital</Ui>: how long they have traded (demo or live) and how much they can start with.
              </>
              <>
                <Ui>Job and salary or business, and any debts</Ui>: what they do, roughly what they earn, and any loans or debts.
              </>
              <>
                <Ui>Purpose of learning trading</Ui>: a second income, a career, growing savings…
              </>
            </List>
            <P>
              Press <Ui>Save answers</Ui>. You can also fill them in on the <To href="/leads/new">full form</To> when you create the lead,
              or in the <Ui>Edit</Ui> dialog.
            </P>
          </>
        ),
      },
      {
        id: "stages",
        title: "Stages",
        body: (
          <>
            <P>Every lead moves through these stages:</P>
            <Flow steps={["New", "Contacted", "Qualified", "Consultation", "Negotiation", "Converted"]} />
            <P>A lead can also be marked Lost from any open stage.</P>
            <Steps>
              <>
                To move one step forward, press the button with the arrow and the next stage name (for example <Ui>Qualified</Ui>).
              </>
              <>
                To jump to any stage, or back, press <Ui>Stage…</Ui>, pick the <Ui>New stage</Ui>, add a note if useful and press{" "}
                <Ui>Move</Ui>.
              </>
              <>
                To mark a lead Lost, choose Lost in <Ui>Stage…</Ui> and pick a <Ui>Reason</Ui>. Lost leads can be reopened the same way.
              </>
            </Steps>
            <Terms
              head={["Stage", "Use it when"]}
              rows={[
                ["New", "Nobody has talked to the lead yet."],
                ["Contacted", "You have reached them (set automatically when you log contact)."],
                ["Qualified", "They are a real prospect: interested, able and likely to join."],
                ["Consultation", "A consultation or detailed meeting is booked or done."],
                ["Negotiation", "You are discussing price, payment plan or start date."],
                ["Converted", "They are a student. Set only by converting or linking (see Converting a lead)."],
                ["Lost", "They won't join for now. A reason is required."],
              ]}
            />
            <Note kind="info">
              If a lost lead enquires again through the website, it reopens as New automatically and the new enquiry appears on its
              timeline.
            </Note>
          </>
        ),
      },
      {
        id: "assign-move",
        title: "Assigning and moving to another project",
        body: (
          <>
            <P>
              <b>Assign</b> (project managers, CRM managers and admins): press <Ui>Assign</Ui>, choose the <Ui>Owner</Ui> from the
              project&apos;s team (or <Ui>Unassigned (pool)</Ui>) and press <Ui>Assign</Ui>. The new owner is notified, and the old
              owner&apos;s open follow-ups on this lead move to them.
            </P>
            <P>
              <b>Move project</b> (CRM managers and admins, or a project manager who manages both projects): press <Ui>Move project</Ui>,
              pick the <Ui>Project</Ui> and press <Ui>Move</Ui>. Open tasks move along. The owner stays only if they are on the new
              project&apos;s team.
            </P>
          </>
        ),
      },
      {
        id: "merge",
        title: "Merging a duplicate",
        body: (
          <>
            <P>
              CRM managers and CRM admins see <Ui>Merge duplicate</Ui> when another lead has the same mobile or email. Open the lead you
              want to <b>keep</b>, then:
            </P>
            <Steps>
              <>
                Press <Ui>Merge duplicate</Ui>.
              </>
              <>
                Choose the <Ui>Duplicate</Ui> to fold into this lead.
              </>
              <>
                Press <Ui>Merge</Ui>.
              </>
            </Steps>
            <P>
              The duplicate&apos;s notes, tags, tasks and history move to the lead you kept, and the duplicate is hidden. The kept lead
              keeps its own details and only fills in what it was missing.
            </P>
          </>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "converting",
    title: "Converting a lead to a student",
    summary: "Creating the student account, linking to an existing student and resending the set-password email.",
    icon: GraduationCap,
    group: "Leads",
    audience: ["crm.convert"],
    href: "/leads",
    sections: [
      {
        id: "convert",
        title: "Convert to student",
        body: (
          <>
            <P>When a lead is ready to enroll, create their student portal account from the lead page.</P>
            <Steps>
              <>Make sure the lead has both a mobile number and an email. Both are required.</>
              <>
                Press <Ui>Convert to student</Ui>.
              </>
              <>
                In <Ui>Enroll in batch</Ui>, choose the batch they are joining. If you leave <Ui>No batch yet</Ui>, they are placed in the
                current batch after they verify their mobile.
              </>
              <>
                Keep <Ui>Email the set-password link now</Ui> ticked so they receive their sign-in email.
              </>
              <>
                Press <Ui>Create student account</Ui>.
              </>
            </Steps>
            <P>What happens next:</P>
            <List>
              <>
                The lead is marked Converted and a <Ui>Student account</Ui> box appears on the lead page with their batch and payment
                status.
              </>
              <>The student gets an email with a link to choose their password. The link works for 7 days.</>
              <>At their first sign-in, the student verifies their mobile number with a code.</>
            </List>
          </>
        ),
      },
      {
        id: "link",
        title: "Linking to an existing student",
        body: (
          <>
            <P>
              If the person already has a student account with the same mobile or email, the lead page shows an <Ui>Already a student?</Ui>{" "}
              box and a <Ui>Link to student</Ui> button instead of <Ui>Convert to student</Ui>.
            </P>
            <Steps>
              <>
                Press <Ui>Link to student</Ui>.
              </>
              <>Check the name and email in the dialog are the right person.</>
              <>
                Press <Ui>Link</Ui>. The lead is marked Converted.
              </>
            </Steps>
          </>
        ),
      },
      {
        id: "resend",
        title: "Resending the set-password email",
        body: (
          <P>
            If the student lost the email or the link expired, open the lead and press <Ui>Resend set-password email</Ui>. They get a fresh
            link, valid for 7 days. The resend is noted on the lead&apos;s timeline.
          </P>
        ),
      },
      {
        id: "automatic",
        title: "Automatic linking",
        body: (
          <>
            <P>
              You don&apos;t always have to convert by hand. When someone signs up on the student portal, or makes a payment, with the same
              mobile or email as a lead, the CRM links them and marks the lead Converted on its own. The lead&apos;s owner gets a
              notification.
            </P>
            <P>Every payment the student makes is also added to the lead&apos;s timeline as Payment received.</P>
            <Note kind="info">
              Converted is never set with the stage buttons. It happens when you mark a conversion to a product, convert or link the lead,
              or through this automatic linking. Becoming a student also counts as converting to the premium course (see Products and
              conversions).
            </Note>
          </>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "products",
    title: "Products and conversions",
    summary: "Marking a lead converted to Inner Circle, the premium course or a club, and managing the product list.",
    icon: Package,
    group: "Leads",
    audience: ["crm.read"],
    href: "/leads",
    sections: [
      {
        id: "what",
        title: "What counts as a conversion",
        body: (
          <>
            <P>A lead converts when they join any of the academy&apos;s products. Each one is a conversion:</P>
            <Terms
              head={["Product", "When it counts"]}
              rows={[
                ["Inner Circle", "They opened an account with JetaFX, our affiliate broker, and deposited the minimum amount."],
                ["Premium course", "They joined the premium course as a student. Recorded automatically when the lead becomes a student."],
                ["Wealth Circle, F1 Club and other clubs", "They joined one of the premium online clubs."],
              ]}
            />
            <P>
              A lead can convert to several products, each once. Every conversion counts for the person who <b>owns the lead</b> at that
              moment, even when someone else marks it, and shows on the <To href="/leaderboard">Leaderboard</To>.
            </P>
          </>
        ),
      },
      {
        id: "mark",
        title: "Marking a conversion",
        body: (
          <>
            <Steps>
              <>Open the lead.</>
              <>
                In the <Ui>Conversions</Ui> box, press <Ui>Conversion</Ui>.
              </>
              <>Tick every product the lead has joined. Add a note if useful.</>
              <>
                Press <Ui>Mark converted</Ui>.
              </>
            </Steps>
            <P>
              The lead moves to <b>Converted</b>, the products appear next to its stage, and the conversion is added to the timeline.
              Converted leads leave the default Open view of the leads list: use the <Ui>Converted</Ui> view or the <Ui>Converted to</Ui>{" "}
              filter to find them again (for example to log a later deposit).
            </P>
            <Note kind="info">
              Converting a lead to a product doesn&apos;t create a student account. When they join the course, use{" "}
              <Ui>Convert to student</Ui> as usual; that records the premium course conversion for you.
            </Note>
            <P>
              A mistake? CRM managers and CRM admins see <Ui>Remove</Ui> next to each conversion. Removing a lead&apos;s only conversion
              reopens it at the stage it had before (unless it is a student).
            </P>
          </>
        ),
      },
      {
        id: "manage",
        title: "Managing products (CRM managers and admins)",
        body: (
          <>
            <P>
              <To href="/products">Products</To> lists every product with its conversions this month and in total.
            </P>
            <List>
              <>
                <Ui>New product</Ui> adds one (for example a new club). Give it a <Ui>Name</Ui>, an optional description and its{" "}
                <Ui>Order in lists</Ui>.
              </>
              <>
                <Ui>Edit</Ui> renames it or changes its <Ui>Status</Ui>. Archived products disappear from the conversion dialog but keep
                their history. Products are never deleted.
              </>
              <>
                <Ui>Student course</Ui>: tick it on the product that a lead becoming a student counts as (Premium course). Only one product
                can have it; students who converted before are added to it automatically.
              </>
            </List>
          </>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "deposits",
    title: "Deposits and commission",
    summary: "Logging a lead's JetaFX deposits, how they are verified and the commission you earn on them.",
    icon: Banknote,
    group: "Leads",
    audience: ["crm.write", "crm.commission.manage"],
    href: "/deposits",
    sections: [
      {
        id: "log",
        title: "Logging a deposit",
        body: (
          <>
            <P>Whenever a lead deposits money in their JetaFX account, log it on the lead page:</P>
            <Steps>
              <>
                In the <Ui>Deposits</Ui> box, press <Ui>Deposit</Ui>.
              </>
              <>
                Choose <Ui>Which deposit</Ui>: <Ui>1st deposit</Ui> or <Ui>Later deposit</Ui>. The next one is picked for you.
              </>
              <>
                Enter the <Ui>Amount (USD)</Ui> and the <Ui>Deposit date</Ui>. If the lead has no JetaFX client ID yet, enter it too; it is
                saved on the lead.
              </>
              <>
                Add the <Ui>Broker reference (optional)</Ui>, the JetaFX transaction ID, if you have it, and press <Ui>Log deposit</Ui>.
              </>
            </Steps>
            <P>
              The deposit is <b>Pending</b> until a CRM admin checks it against the JetaFX report. A lead has at most one 1st deposit; log
              the rest as later deposits. Logged one by mistake? Press <Ui>Delete</Ui> while it is still pending.
            </P>
          </>
        ),
      },
      {
        id: "commission",
        title: "How commission works",
        body: (
          <>
            <List>
              <>
                Commission is a percent of each <b>verified</b> deposit. A lead&apos;s 1st deposit has its own rate; a later deposit earns
                the rate of the slab its amount reaches (for example 2% from $10,000, 2.5% from $25,000), on the whole amount. CRM admins
                set the rates in Settings.
              </>
              <>
                It goes to the person who <b>owned the lead when the deposit was logged</b> (whoever logged it, if the lead was unassigned).
                Reassigning the lead later doesn&apos;t move it.
              </>
              <>The rate is fixed when the deposit is verified. You get a notification with the amount.</>
              <>A rejected deposit earns nothing; you are told why.</>
            </List>
            <P>
              <To href="/deposits">Deposits</To> lists the deposits on your leads with their status and your commission. Your total is also
              on the <To href="/leaderboard">Leaderboard</To>. Only you and the CRM admins see your commission.
            </P>
          </>
        ),
      },
      {
        id: "verify",
        title: "Verifying deposits (CRM admins)",
        body: (
          <>
            <Steps>
              <>
                Open <To href="/deposits">Deposits</To> and press <Ui>Waiting for verification</Ui> (or filter <Ui>Status</Ui> to Pending).
              </>
              <>Compare each one with the JetaFX report: client ID, amount and date.</>
              <>
                Press <Ui>Verify</Ui> and confirm. The commission is calculated with today&apos;s rate.
              </>
              <>
                If it isn&apos;t in the report, press <Ui>Reject</Ui> and give a <Ui>Reason</Ui>. A verified deposit that the broker
                reversed can be rejected too; its commission is removed.
              </>
            </Steps>
            <P>
              Each person&apos;s total commission is on their page under <To href="/team">Team</To>. Use the <Ui>Credited to</Ui> filter on
              Deposits to see one person&apos;s deposits.
            </P>
          </>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "leaderboard",
    title: "Leaderboard",
    summary: "How sales executives are ranked: conversions, new leads, conversion rate and verified deposits.",
    icon: Trophy,
    group: "Leads",
    audience: ["crm.read"],
    href: "/leaderboard",
    sections: [
      {
        id: "ranking",
        title: "How the ranking works",
        body: (
          <>
            <P>
              <To href="/leaderboard">Leaderboard</To> ranks everyone with the Sales executive role (and anyone else with conversions) for
              the chosen <Ui>Period</Ui>, across all projects or one <Ui>Project</Ui>.
            </P>
            <Terms
              head={["Column", "What it counts"]}
              rows={[
                [<Ui key="a">Conversions</Ui>, "Product conversions credited to the person in the period. This decides the rank."],
                ["Each product", "The same conversions, per product."],
                [<Ui key="b">New leads</Ui>, "Leads they own that were created in the period."],
                [<Ui key="c">Converted</Ui>, "How many of those new leads converted (to anything), and the percent."],
                [<Ui key="d">Verified deposits</Ui>, "The JetaFX deposits on their leads verified in the period. Breaks ties."],
              ]}
            />
            <P>
              The cards at the top show your own conversions, verified deposits, commission and the deposits still waiting for verification.
              CRM admins also see everyone&apos;s <Ui>Commission</Ui> column.
            </P>
          </>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "deleting-leads",
    title: "Deleting leads",
    summary: "Permanently removing spam, test and junk leads, one at a time or in bulk.",
    icon: Trash2,
    group: "Leads",
    audience: ["crm.leads.delete"],
    href: "/leads",
    sections: [
      {
        id: "when",
        title: "When to delete (and when not to)",
        body: (
          <>
            <P>Only academy admins and CRM admins can delete leads. Deleting is permanent and can&apos;t be undone.</P>
            <List>
              <>
                <b>Delete</b> spam, test entries and junk that was never a real person.
              </>
              <>
                <b>Don&apos;t delete</b> real enquiries that didn&apos;t work out. Mark them Lost with a reason instead, so the numbers on
                the dashboard stay true and the history is kept.
              </>
              <>
                <b>Don&apos;t delete</b> duplicates of a real lead. Merge them instead (Working a lead → Merging a duplicate).
              </>
            </List>
          </>
        ),
      },
      {
        id: "one",
        title: "Deleting one lead",
        body: (
          <>
            <Steps>
              <>Open the lead.</>
              <>
                Press <Ui>Delete</Ui> (the red button at the end of the row of buttons).
              </>
              <>
                Type <Ui>DELETE</Ui> in the box to confirm.
              </>
              <>
                Press <Ui>Delete lead</Ui>.
              </>
            </Steps>
            <P>
              The lead, its activity history, its tasks and any duplicates that were merged into it are removed for good. You return to the
              leads list with the message <Ui>Lead deleted.</Ui>
            </P>
          </>
        ),
      },
      {
        id: "bulk",
        title: "Deleting several leads",
        body: (
          <>
            <Steps>
              <>
                On <To href="/leads">Leads</To>, tick the leads you want to remove, or tick the box in the header row to pick every lead on
                the page.
              </>
              <>
                To include the leads on the other pages too, press the link above the list, for example{" "}
                <Ui>Select all 320 leads matching these filters</Ui>. This covers every lead your view, filters and search match.
              </>
              <>
                Press <Ui>Delete</Ui> in the bar above the list.
              </>
              <>
                Check the number in the title (for example <Ui>Delete 320 leads?</Ui>), type <Ui>DELETE</Ui> to confirm and press{" "}
                <Ui>Delete leads</Ui>.
              </>
            </Steps>
            <P>
              The message tells you how many were deleted and how many were skipped. One delete covers at most 2,000 leads; if more match,
              narrow the filters first.
            </P>
          </>
        ),
      },
      {
        id: "rules",
        title: "Good to know",
        body: (
          <>
            <List>
              <>
                A lead linked to a student account (a converted lead) can&apos;t be deleted. It is part of the student&apos;s record. In a
                bulk delete, these leads are simply skipped.
              </>
              <>Every deletion is recorded in the audit log, with who deleted what and when.</>
            </List>
            <Note kind="warning">
              Check your ticks before confirming a bulk delete. With &quot;select all matching&quot;, the delete reaches leads on pages you
              haven&apos;t looked at. There is no undo and no recycle bin.
            </Note>
          </>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "tasks",
    title: "Tasks and follow-ups",
    summary: "The task board and list, creating tasks, completing follow-ups, rescheduling and the daily digest.",
    icon: CheckSquare,
    group: "Tasks & projects",
    audience: ["crm.read"],
    href: "/tasks",
    sections: [
      {
        id: "what-for",
        title: "What tasks are",
        body: (
          <>
            <P>
              Tasks are your to-do list. Most are <b>follow-ups</b> on a lead (call back, send details, meeting). You can also create a task
              that isn&apos;t about a lead, inside a project.
            </P>
            <P>
              A lead&apos;s <Ui>Next follow-up</Ui> is simply its earliest open task with a due date.
            </P>
          </>
        ),
      },
      {
        id: "board-list",
        title: "Board view and list view",
        body: (
          <>
            <P>
              Switch with the <Ui>Board</Ui> and <Ui>List</Ui> buttons at the top. Filter by <Ui>Project</Ui>, <Ui>Assignee</Ui> and{" "}
              <Ui>Priority</Ui>.
            </P>
            <P>
              <b>Board</b> (the default) has four columns:
            </P>
            <Flow steps={["To do", "In progress", "Waiting", "Done"]} />
            <List>
              <>Drag a card to another column to change its status. Drag it up or down inside a column to reorder.</>
              <>
                <Ui>Done</Ui> shows tasks finished in the last 7 days. Dragging a card back out of Done reopens it.
              </>
              <>Cancelled tasks leave the board.</>
            </List>
            <P>
              <b>List</b> groups your open tasks by <Ui>Overdue</Ui>, <Ui>Today</Ui>, <Ui>This week</Ui>, <Ui>Later</Ui> and{" "}
              <Ui>No date</Ui>. The <Ui>Closed</Ui> tab shows finished and cancelled tasks.
            </P>
            <P>
              The list shows 50 tasks per page. Use the page numbers at the bottom to see more, or change <Ui>Rows</Ui> to 25, 50 or 100.
            </P>
            <Note kind="tip">
              Dragging a follow-up into Done closes it without an outcome. To record how a call went and book the next one, use the{" "}
              <Ui>Done</Ui> button instead (on the lead page, in the list view or on the task page).
            </Note>
          </>
        ),
      },
      {
        id: "create",
        title: "Creating a task",
        body: (
          <>
            <Steps>
              <>
                On a lead page, press <Ui>Follow-up</Ui> in the <Ui>Tasks</Ui> box. For a task without a lead, press <Ui>New task</Ui> on
                the Tasks page and choose the <Ui>Project</Ui>.
              </>
              <>
                Enter a <Ui>Title</Ui>, for example Call back about the November batch.
              </>
              <>
                Choose the <Ui>Type</Ui> (Call, WhatsApp, Email, Meeting or Other) and the <Ui>Priority</Ui> (Low, Medium, High or Urgent).
              </>
              <>
                Set <Ui>Due (Dubai time)</Ui>. It starts at tomorrow 10:00.
              </>
              <>
                If you can assign in the project, pick who it is for in <Ui>Assign to</Ui>. Add <Ui>Details</Ui> if useful, then press{" "}
                <Ui>Create</Ui>.
              </>
            </Steps>
            <Note kind="info">All due times in the CRM are Dubai time (GMT+4), wherever you are.</Note>
          </>
        ),
      },
      {
        id: "complete",
        title: "Completing, rescheduling and cancelling",
        body: (
          <>
            <P>
              <b>Done:</b>
            </P>
            <Steps>
              <>
                Press <Ui>Done</Ui> on the task.
              </>
              <>
                For a call follow-up on a lead, choose the <Ui>Outcome</Ui>.
              </>
              <>
                Write <Ui>What happened?</Ui> This goes on the lead&apos;s timeline.
              </>
              <>
                Optionally set <Ui>Next follow-up (optional)</Ui> to book the next one in the same step. Press <Ui>Mark done</Ui>.
              </>
            </Steps>
            <P>Completing a follow-up on a lead counts as contacting them, so a New lead moves to Contacted.</P>
            <P>
              <b>Reschedule:</b> press <Ui>Reschedule</Ui> (or <Ui>Set due date</Ui>), pick a new time and press <Ui>Save</Ui>. Leave the
              field empty to remove the due date.
            </P>
            <P>
              <b>Cancel:</b> press <Ui>Cancel</Ui> when the task is no longer needed. It is closed and noted on the lead&apos;s timeline.
            </P>
          </>
        ),
      },
      {
        id: "task-page",
        title: "The task page and comments",
        body: (
          <P>
            Click a task&apos;s title to open it. There you can change the title, type, priority, due time, assignee and details (press{" "}
            <Ui>Save task</Ui>), and talk with your team in <Ui>Comments</Ui>: write in <Ui>Add a comment…</Ui> and press <Ui>Comment</Ui>.
          </P>
        ),
      },
      {
        id: "reminders",
        title: "Daily digest and automatic tasks",
        body: (
          <List>
            <>
              Every morning at 09:00 (Dubai time), everyone with tasks due today or overdue gets one email and one notification listing
              them.
            </>
            <>
              When a batch that a lead is interested in is about to start (within 7 days, unless your CRM admin changed it), the CRM creates
              a High priority task for that lead so you can close them before the batch fills.
            </>
          </List>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "projects",
    title: "Projects",
    summary: "What projects are, the General project, creating and editing projects, and project teams.",
    icon: FolderKanban,
    group: "Tasks & projects",
    audience: ["crm.read"],
    href: "/projects",
    sections: [
      {
        id: "what-for",
        title: "What a project is",
        body: (
          <>
            <P>
              A project is a sales campaign or pipeline with its own team, for example Forex Pro - November drive.{" "}
              <b>Every lead belongs to exactly one project.</b>
            </P>
            <List>
              <>
                The <b>General</b> project is the default. Everyone with CRM access works there, so it has no team to manage. Enquiries from
                the website land there, and round-robin shares General leads across every active sales executive. Managers then move leads
                from General into the right project.
              </>
              <>
                The <b>Support</b> project is created for you and receives new enquiries from the contact page (the student app&apos;s{" "}
                <i>/support</i> page: help and support, broker account opening, course joining, Inner Circle access, free live classes). Add
                the support team to it as sales executives: each new enquiry goes round-robin to one of them, and the visitor is sent to
                that person&apos;s WhatsApp or Telegram. While its team is empty, enquiries wait there unassigned and visitors go to the
                academy&apos;s support WhatsApp. Someone who is already a lead stays in their project and with their owner.
              </>
              <>
                A project has <b>project managers</b>, who see and run everything inside it, and <b>sales executives</b> (team members), who
                work their own leads and the project&apos;s unassigned pool. Sales executives are also the people who receive the
                project&apos;s round-robin leads.
              </>
            </List>
            <P>
              The <To href="/projects">Projects</To> page shows each project with its open leads, conversions this month (against the
              target, if set), overdue tasks and team. Click a project to see its funnel, team results, recent leads and open tasks. From
              there, <Ui>Lead</Ui> adds a lead to it, <Ui>All leads</Ui> lists its leads and <Ui>Board</Ui> opens its tasks.
            </P>
          </>
        ),
      },
      {
        id: "create",
        title: "Creating a project",
        body: (
          <>
            <P>CRM managers and CRM admins can create projects.</P>
            <Steps>
              <>
                On <To href="/projects">Projects</To>, press <Ui>New project</Ui>.
              </>
              <>
                Enter a <Ui>Name</Ui>. The <Ui>Code</Ui> is made from the name if you leave it empty.
              </>
              <>
                Optionally add a <Ui>Description</Ui>, <Ui>Start date</Ui> and <Ui>End date</Ui>, the <Ui>Target course</Ui> and{" "}
                <Ui>Target batch</Ui>, and the <Ui>Target leads</Ui> and <Ui>Target conversions</Ui>.
              </>
              <>
                Tick the <Ui>Project managers</Ui> and the <Ui>Sales executives (team members)</Ui>. Each person is shown with their roles,
                with sales executives at the top. Press <Ui>Create project</Ui>.
              </>
            </Steps>
            <Note kind="tip">
              Set the target course and batch. New leads in the project are then marked as interested in them automatically, and the batch
              reminder tasks work.
            </Note>
          </>
        ),
      },
      {
        id: "edit-team",
        title: "Editing a project and its team",
        body: (
          <>
            <P>
              <b>Adding people</b> (project managers of the project, CRM managers and admins):
            </P>
            <Steps>
              <>
                On the project page, press <Ui>Add people</Ui> on the <Ui>Team</Ui> card.
              </>
              <>Tick one or more people. Each name shows the person&apos;s roles, and sales executives are listed first.</>
              <>
                Choose their <Ui>Role in this project</Ui>: <Ui>Sales executive (team member)</Ui> or <Ui>Project manager</Ui>. Only CRM
                managers and admins can add project managers.
              </>
              <>
                Press <Ui>Add to project</Ui>.
              </>
            </Steps>
            <List>
              <>
                The <Ui>Edit project</Ui> form is at the bottom of the project page. Project managers can edit their own projects; only CRM
                managers and admins can change the status or the project managers. The form also has the <Ui>Project managers</Ui> and{" "}
                <Ui>Sales executives (team members)</Ui> lists, so you can tick and untick the whole team in one go. Press{" "}
                <Ui>Save project</Ui>.
              </>
              <>
                To take someone off the team, press <Ui>Remove</Ui> next to their name. Project managers can remove sales executives from
                their own projects; only CRM managers and admins can remove a project manager.
              </>
              <>
                The General project has no team to manage: everyone with CRM access works there, and round-robin shares its leads across
                every active sales executive. To give a group its own leads and team, create a project.
              </>
            </List>
            <Note kind="tip">
              Only people with the Sales executive role who are on the team receive the project&apos;s round-robin leads. If round-robin
              skips a project, add sales executives to it.
            </Note>
          </>
        ),
      },
      {
        id: "status",
        title: "Project status",
        body: (
          <Terms
            head={["Status", "Meaning"]}
            rows={[
              ["Active", "Running. Shown on the dashboard's Projects panel."],
              ["Paused", "On hold. Its leads stay visible, but it no longer appears on the dashboard's Projects panel."],
              [
                "Archived",
                "Finished. No new leads can be added or moved in, and it is listed under archived at the bottom of the Projects page.",
              ],
            ]}
          />
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "team",
    title: "Managing the CRM team",
    summary: "Adding CRM accounts, temporary passwords, resetting, disabling and CRM roles.",
    icon: UsersRound,
    group: "Admin",
    audience: ["crm.staff.manage"],
    href: "/team",
    sections: [
      {
        id: "add",
        title: "Adding a CRM account",
        body: (
          <>
            <Steps>
              <>
                Open <To href="/team">Team</To> and scroll to <Ui>Add a CRM account</Ui>.
              </>
              <>
                Enter the <Ui>Full name</Ui> and <Ui>Login email</Ui>. <Ui>Job title</Ui> is optional.
              </>
              <>
                Add their <Ui>Phone (WhatsApp)</Ui> if they should receive free class leads: visitors who join from the landing page are
                sent straight to their WhatsApp. You can add or change it later on their page.
              </>
              <>
                Tick one or more <Ui>CRM roles</Ui> (see Your role in the CRM).
              </>
              <>
                Optionally tick projects under <Ui>Add to projects (as sales executive)</Ui>.
              </>
              <>
                Press <Ui>Create account</Ui>.
              </>
            </Steps>
            <P>
              The new person receives an email with a temporary password and signs in at this CRM. To add them to more projects later, or
              make them a project manager, open the project and press <Ui>Add people</Ui> on its <Ui>Team</Ui> card (see Projects).
            </P>
            <Note kind="info">
              Only CRM roles can be given here. Staff who also hold academy roles (for example admissions or finance) don&apos;t appear in
              this list and are managed from the admin console.
            </Note>
          </>
        ),
      },
      {
        id: "status",
        title: "Account status and temporary passwords",
        body: (
          <>
            <Terms
              head={["Status", "Meaning"]}
              rows={[
                ["Invited", "The account exists but the person hasn't signed in and chosen their own password yet."],
                ["Active", "The person has signed in and set their own password."],
                ["Disabled", "The person can't sign in."],
              ]}
            />
            <P>
              While someone is <b>Invited</b>, their temporary password is shown in the team list, hidden behind dots. Press the eye icon to
              show it or the copy icon to copy it, then share it with them safely (for example in person). It disappears once they choose
              their own password.
            </P>
            <Note kind="tip">
              For older invites the list says <Ui>Reset the password to get a new one</Ui>. Open the person and press{" "}
              <Ui>Reset password</Ui>.
            </Note>
          </>
        ),
      },
      {
        id: "manage",
        title: "Resetting, disabling and editing",
        body: (
          <>
            <P>Click a name in the team list to open the person. From there:</P>
            <List>
              <>
                <Ui>Reset password</Ui> creates a new temporary password, shows it on screen and emails it to them. They must choose a new
                password at their next sign-in.
              </>
              <>
                <Ui>Receiving leads</Ui> (also a switch on the team list, for sales executives): turn it off to mark them <b>Off</b> while
                they&apos;re on leave or off shift. Round-robin, website and landing-page leads skip them, and free class visitors are never
                sent to their WhatsApp; a returning visitor whose owner is Off is handed to someone who is on. They keep their account,
                leads and tasks, and you can still assign to them by hand. Turn it back on when they return.
              </>
              <>
                <Ui>Disable account</Ui> blocks sign-in and signs them out straight away. <Ui>Enable account</Ui> lets them back in. Use it
                for people who leave, not for time off.
              </>
              <>
                Under <Ui>Details and roles</Ui>, change their name, job title or roles and press <Ui>Save</Ui>.
              </>
              <>
                The <Ui>Projects</Ui> box lists their projects. To add them to a project, open the project and press <Ui>Add people</Ui> on
                the <Ui>Team</Ui> card; to take them off, press <Ui>Remove</Ui> next to their name there.
              </>
              <>
                The <Ui>Commission</Ui> box (CRM admins only) shows the commission they have earned in total, this month and last month, the
                deposits waiting for verification, their conversions and their latest deposits. <Ui>All their deposits</Ui> opens the list.
              </>
            </List>
            <Note kind="warning">
              Before disabling someone who is leaving, reassign their open leads. Use the <Ui>Owner</Ui> filter on Leads to find them,
              select them all, then bulk assign them to someone else.
            </Note>
          </>
        ),
      },
      {
        id: "roles",
        title: "CRM roles",
        body: (
          <>
            <P>
              Press <Ui>Roles & permissions</Ui> on the Team page to see each role, how many people hold it and what it allows. Only CRM
              admins can edit roles.
            </P>
            <List>
              <>
                The four built-in roles (CRM admin, CRM manager, Project manager, Sales executive) can&apos;t be changed. They are restored
                every time the CRM is updated.
              </>
              <>
                To make a variation, fill in <Ui>New role</Ui> at the bottom: a <Ui>Role name</Ui>, a <Ui>Description</Ui>, tick the
                permissions, and press <Ui>Create role</Ui>.
              </>
            </List>
          </>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "import",
    title: "Importing leads",
    summary: "Bringing a spreadsheet of leads into a project, with a preview before anything is saved.",
    icon: Upload,
    group: "Admin",
    audience: ["crm.manage"],
    href: "/import",
    sections: [
      {
        id: "prepare",
        title: "Preparing the file",
        body: (
          <>
            <P>
              Save your spreadsheet as CSV (in Excel or Google Sheets: File → Download or Save as → CSV). The first row must hold the column
              names.
            </P>
            <Terms
              head={["Column", "Notes"]}
              rows={[
                ["name", "Required."],
                [
                  "phone (or mobile, whatsapp)",
                  "Best with the country code, for example +971501234567. A number without one is read with the row's own country, or else with the country you pick when importing.",
                ],
                ["email", "Each row needs a phone, an email, or both."],
                [
                  "country",
                  "Optional, two-letter code such as AE or IN. It must be a real country code. When filled in, it decides how that row's number is read.",
                ],
                ["notes (or message)", "Optional."],
                ["tags", "Optional, separated by commas."],
                ["source detail (or campaign)", "Optional, for example the campaign or event name."],
                ["language", "Optional."],
              ]}
            />
            <P>Up to 2,000 rows per import.</P>
          </>
        ),
      },
      {
        id: "import",
        title: "Importing",
        body: (
          <>
            <Steps>
              <>
                Open <To href="/import">Import</To>. Paste the CSV text into the box, or choose the file under <Ui>…or a file</Ui>.
              </>
              <>
                Pick the <Ui>Source for these leads</Ui> (for example Webinar or Event).
              </>
              <>
                Pick the <Ui>Country for numbers without a +code</Ui>. It starts on United Arab Emirates. If every number in the file
                already has its +code, choose <Ui>None: every number has its +code</Ui>; numbers without one are then marked invalid instead
                of guessed. A row&apos;s own country column always wins over this choice.
              </>
              <>
                Pick the <Ui>Project</Ui>. If you can assign in it, choose the <Ui>Owner</Ui>: <Ui>Unassigned (pool)</Ui> (the
                project&apos;s unassigned pool), one person for all of them, or <Ui>Round-robin to the project&apos;s sales executives</Ui>{" "}
                to share them out fairly (see Finding and adding leads → Round-robin). Round-robin is refused if the project has no sales
                executives.
              </>
              <>
                Press <Ui>Check the file</Ui>. Nothing is saved yet.
              </>
              <>
                Review the preview: each row shows <Ui>Will create</Ui> or the reason it will be skipped.
              </>
              <>
                Press <Ui>Import</Ui> (the button shows how many leads will be created). When it finishes, press <Ui>Open the new leads</Ui>
                .
              </>
            </Steps>
          </>
        ),
      },
      {
        id: "skipped",
        title: "Why rows are skipped",
        body: (
          <>
            <Terms
              head={["Reason", "What it means"]}
              rows={[
                ["Lead exists", "A lead with this mobile or email is already in the CRM. It is left as it is."],
                ["Already a portal account", "This mobile or email belongs to a student or staff account."],
                ["Repeated in this file", "The same contact appears more than once in the file. Only the first is imported."],
                [
                  "Invalid phone (add the country code)",
                  "The number can't be read. Add its +code, fill in the row's country column, or pick the right country for numbers without a +code.",
                ],
                [
                  "Unknown country code",
                  "The row's country column isn't a real two-letter country code. Fix it, for example AE, IN or SA.",
                ],
                ["Missing name, No phone or email, Invalid email", "Fix the row in your spreadsheet and import it again."],
              ]}
            />
            <Note kind="info">An import never overwrites or changes existing leads or students.</Note>
          </>
        ),
      },
    ],
  },

  // ---------------------------------------------------------------------------------------------
  {
    slug: "settings",
    title: "CRM settings",
    summary:
      "Pipeline rules (first response, cold leads, batch reminders, round-robin, lost reasons), commission rates and the website lead form.",
    icon: Settings,
    group: "Admin",
    audience: ["crm.manage"],
    href: "/settings",
    sections: [
      {
        id: "rules",
        title: "Pipeline rules",
        body: (
          <>
            <Terms
              head={["Setting", "What it does"]}
              rows={[
                [
                  <Ui key="a">First-response SLA (hours)</Ui>,
                  "How quickly a new lead should be contacted. New leads not contacted in time count as Untouched on the dashboard. Default 24.",
                ],
                [
                  <Ui key="b">Lead goes cold after (days)</Ui>,
                  "Open leads with no activity for this many days turn Cold automatically each morning. Default 7.",
                ],
                [
                  <Ui key="c">Batch urgency (days before start)</Ui>,
                  "When a lead's batch of interest starts within this many days, the CRM creates a High priority follow-up for it. Default 7. Set 0 to turn it off.",
                ],
                [
                  <Ui key="d">Assign website leads round-robin to the sales team (least loaded first)</Ui>,
                  "When ticked, each new website lead goes straight to the sales executive with the fewest open leads in the General project. Every active person with the Sales executive role takes part; project managers, CRM managers and admins don't. If there are no sales executives, or when not ticked, website leads wait unassigned in the General project.",
                ],
                [
                  <Ui key="e">Lost reasons (one per line)</Ui>,
                  "The reasons staff pick from when marking a lead Lost. Defaults: Budget, Timing, Not interested, Unreachable, Chose another academy, Duplicate.",
                ],
              ]}
            />
            <P>
              Press <Ui>Save CRM settings</Ui> when you are done.
            </P>
          </>
        ),
      },
      {
        id: "commission",
        title: "Commission rates (CRM admins)",
        body: (
          <>
            <P>
              The <Ui>Commission on JetaFX deposits</Ui> box sets the percent of each verified deposit that the lead&apos;s owner earns:
            </P>
            <List>
              <>
                <Ui>First deposit (%)</Ui>: every new customer&apos;s first deposit.
              </>
              <>
                <Ui>Later deposits</Ui>: a <Ui>Base rate</Ui> for any amount, plus slabs from an amount. Press <Ui>Add slab</Ui>, enter the
                starting amount in USD and its percent. A deposit earns the rate of the highest slab it reaches, on the whole amount: with
                1% base, 2% from $10,000, 2.5% from $25,000 and 3% from $40,000, a $30,000 deposit earns 2.5% ($750) and a $5,000 one 1%
                ($50).
              </>
            </List>
            <P>
              Press <Ui>Save commission rates</Ui>.
            </P>
            <Note kind="info">
              A new rate applies to deposits verified from then on. Deposits that are already verified keep the rate they were verified
              with.
            </Note>
          </>
        ),
      },
      {
        id: "website",
        title: "The website lead form",
        body: (
          <>
            <P>
              Enquiries from the academy website arrive in the CRM automatically. The <Ui>Website lead form</Ui> box shows where the website
              sends them and whether the connection is switched on.
            </P>
            <List>
              <>
                <Ui>secret configured</Ui> means the connection is on.
              </>
              <>If the badge says it is disabled, website enquiries are not arriving. Ask your technical team to switch it on.</>
              <>
                New website leads land in the General project. With round-robin on, each goes to a sales executive, who is notified.
                Otherwise it waits unassigned and the General project&apos;s managers are notified (or, if it has none, the CRM managers and
                admins).
              </>
              <>
                When someone who already has a lead enquires again, the enquiry is added to that lead&apos;s timeline instead of creating a
                duplicate.
              </>
            </List>
          </>
        ),
      },
    ],
  },
];
