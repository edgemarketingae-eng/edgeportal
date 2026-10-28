import { studentRoutes, type FreeClassDto } from "@edge/contracts";
import { formatTime } from "@edge/domain/dates";
import { api } from "@edge/web/server";
import { cn } from "@edge/ui/lib/utils";
import { CircleCheck, MessageCircle, MousePointerClick, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cache, Suspense, type ReactNode } from "react";
import { display, displayBold, eyebrow, tw } from "./brand";
import { Countdown } from "./countdown";
import { JoinButton, JoinFreeClass, StickyJoin } from "./join";

export const metadata: Metadata = {
  title: { absolute: "Free Live Forex & Gold Class · Edge Trading Academy" },
  description:
    "Join a free live trading class with Edge Trading Academy mentors in Dubai. Learn Forex & Gold from zero and ask questions in real time.",
  openGraph: {
    title: "Free Live Forex & Gold Class",
    description: "Learn to trade Forex & Gold live with Edge Trading Academy mentors. 100% free, beginner friendly.",
    siteName: "Edge Trading Academy",
    type: "website",
  },
};

const STATS = [
  ["Live", "Ask questions in real time"],
  ["Free", "No fees, no card"],
  ["Zero", "Experience needed"],
  ["Dubai", "Based mentors"],
];

const TOPICS = [
  ["Trading basics", "How Forex & Gold move: pips, lot size, leverage, margin and spread, explained simply."],
  ["Simple setups", "Support & resistance, trend direction, breakouts and pullbacks. Where to enter, where to exit."],
  ["Risk management", "Stop losses, position sizing and the 1–2% rule that protects your capital first."],
  ["Trading psychology", "Fear, greed, overtrading and revenge trading, and the discipline that beats them."],
  ["Reading the market live", "Watch a mentor read the chart and the news in real time, and ask anything."],
  ["Beginner mistakes", "The most common ways new traders lose money, and how professionals avoid them."],
];

const AUDIENCE = ["Complete beginners", "People who lost money trading", "Busy professionals in the UAE", "Anyone curious about Gold"];

const STEPS = [
  { icon: MousePointerClick, title: "Tap “Contact support”", body: "Takes 10 seconds. No payment, no card." },
  { icon: UserRound, title: "Enter name & WhatsApp", body: "So your mentor knows who you are." },
  { icon: MessageCircle, title: "Chat with your mentor", body: "Send the ready message on WhatsApp and get the class link." },
];

/** One API read per request, shared by the date block and the countdown card. */
const getFreeClass = cache(async (): Promise<FreeClassDto | null> =>
  // The page must keep converting even if the API hiccups; the blocks fall back to evergreen copy.
  api(studentRoutes.freeClass).then(
    (r) => r.freeClass,
    (e: unknown) => (console.error("[landing] free class", e), null),
  ),
);

export default function LandingPage() {
  return (
    <JoinFreeClass>
      <div className="relative isolate overflow-x-clip">
        <CrossingLines />

        <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <Image src="/brand/edge-logo-primary.svg" alt="Edge Trading Academy" width={144} height={36} unoptimized priority />
          <nav className="flex items-center gap-3 sm:gap-5">
            {/* <Link href="/login" className="text-edge-ink/70 hover:text-edge-ink text-sm font-semibold">
              Student login
            </Link> */}
            <JoinButton className="hidden h-11 rounded-xl px-5 text-xs sm:inline-flex">Contact support</JoinButton>
          </nav>
        </header>

        <main>
          {/* Hero */}
          <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:gap-14 lg:pt-14 lg:pb-24">
            <div>
              <p className={cn(eyebrow, "flex items-center gap-2.5")}>
                <span className="bg-edge-coral size-2.5 rounded-full shadow-[0_0_0_5px_rgba(255,107,107,0.18)]" /> Live online · Hosted in
                Dubai
              </p>
              <h1 className="mt-6">
                <span className={tw(display, "block text-[36px] sm:text-[52px]")}>Free Live Class</span>
                <span className={tw(display, "text-edge-green mt-1 block text-[64px] sm:text-[100px] lg:text-[96px]")}>
                  Forex &amp; Gold
                </span>
              </h1>
              <p className="border-edge-ink mt-7 max-w-xl rounded-[28px] border-[1.5px] bg-[#C6F2E1] px-5 py-3.5 text-[15px] leading-snug font-semibold sm:px-6 sm:py-4 sm:text-lg">
                For complete beginners: learn how the market really works, live with our mentors, before you risk a single dirham.
              </p>
              <Suspense fallback={<WhenBlock />}>
                <When />
              </Suspense>
              <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
                <JoinButton>Contact support</JoinButton>
                <ul className="text-edge-ink/70 grid gap-1 text-sm font-medium">
                  <li className="flex items-center gap-1.5">
                    <CircleCheck className="text-edge-emerald size-4" /> 100% free, no card
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CircleCheck className="text-edge-emerald size-4" /> Continue on WhatsApp
                  </li>
                </ul>
              </div>
            </div>
            <Suspense fallback={<ClassCard />}>
              <ClassCardLoaded />
            </Suspense>
          </section>

          {/* Stats */}
          <section className="border-edge-ink/10 border-y bg-white">
            <dl className="divide-edge-ink/10 mx-auto grid max-w-6xl grid-cols-2 px-4 sm:px-6 md:grid-cols-4 md:divide-x">
              {STATS.map(([big, small]) => (
                <div key={big} className="px-2 py-7 text-center md:py-9">
                  <dt className={tw(displayBold, "text-3xl sm:text-4xl")}>{big}</dt>
                  <dd className="text-edge-emerald mt-1.5 text-sm font-semibold">{small}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* What you'll learn + who should join: the posters' tab-and-frame pattern */}
          <section className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[2fr_1fr] lg:py-28">
            <TabFrame label="What you’ll learn">
              <ol className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
                {TOPICS.map(([title, body], i) => (
                  <li key={title} className="flex gap-4">
                    <span className={tw(displayBold, "text-edge-emerald text-xl")}>{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <h3 className="text-[17px] font-bold">{title}</h3>
                      <p className="text-edge-ink/70 mt-1 text-[15px] leading-relaxed">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </TabFrame>
            <TabFrame label="Who should join?">
              <ul className="flex flex-wrap gap-2.5">
                {AUDIENCE.map((a) => (
                  <li key={a} className="border-edge-ink rounded-full border-[1.5px] bg-[#C6F2E1] px-4 py-2 text-sm font-semibold">
                    {a}
                  </li>
                ))}
              </ul>
              <p className="text-edge-ink/70 mt-6 text-[15px] leading-relaxed">
                No experience needed. Bring your questions: the class is live, so you can ask the mentor anything.
              </p>
            </TabFrame>
          </section>

          {/* How it works */}
          <section className="bg-white">
            <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
              <p className={cn(eyebrow, "text-center")}>3 simple steps</p>
              <h2 className={tw(display, "mt-3 text-center text-4xl sm:text-6xl")}>How to Join</h2>
              <ol className="mt-12 grid gap-5 md:grid-cols-3">
                {STEPS.map((s, i) => (
                  <li key={s.title} className="bg-edge-offwhite border-edge-ink/10 relative rounded-3xl border p-7">
                    <span className={tw(display, "text-edge-green absolute top-4 right-6 text-7xl")}>{i + 1}</span>
                    <span className="bg-edge-ink text-edge-green grid size-12 place-items-center rounded-2xl">
                      <s.icon className="size-5" />
                    </span>
                    <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
                    <p className="text-edge-ink/70 mt-1.5 text-[15px]">{s.body}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-12 flex justify-center">
                <JoinButton>Contact support</JoinButton>
              </div>
            </div>
          </section>

          {/* Final CTA: the dark rounded card */}
          <section className="px-4 py-20 sm:px-6 lg:py-24">
            <div className="bg-edge-ink text-edge-offwhite relative isolate mx-auto max-w-6xl overflow-hidden rounded-[40px] px-6 py-14 text-center sm:px-12 sm:py-20">
              <div aria-hidden className="bg-edge-emerald/70 absolute -top-32 -left-24 -z-10 size-96 rounded-full blur-3xl" />
              <CrossingLines dark />
              <p className={cn(eyebrow, "text-edge-mint")}>Seats are limited for live Q&amp;A</p>
              <h2 className={tw(display, "mt-4 text-5xl sm:text-7xl")}>
                Save Your <span className="text-edge-green">Free Seat</span>
              </h2>
              <p className="text-edge-mint/90 mx-auto mt-5 max-w-lg">Join the next live class. Your mentor sends everything on WhatsApp.</p>
              <div className="mt-9 flex justify-center">
                <JoinButton tone="green">Contact support</JoinButton>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-edge-ink/10 border-t bg-white pb-24 sm:pb-0">
          <div className="mx-auto grid max-w-6xl gap-5 px-4 py-10 sm:px-6 md:grid-cols-[auto_1fr] md:items-start md:gap-12">
            <div className="grid gap-2">
              <Image src="/brand/edge-logo-primary.svg" alt="Edge Trading Academy" width={128} height={32} unoptimized />
              <p className="text-edge-ink/60 text-xs">edgeacademy.ae · Dubai, UAE</p>
            </div>
            <div className="text-edge-ink/60 grid gap-2 text-xs leading-relaxed">
              <p>
                <b className="text-edge-ink/80">Educational content only. Trading forex involves significant risk of loss.</b> Trading Forex
                and Gold (XAU/USD) on margin may not be suitable for everyone and you could lose some or all of your capital. Our classes
                are not financial advice.
              </p>
              <p>© Edge Trading Academy · Dubai</p>
            </div>
          </div>
        </footer>

        <StickyJoin />
      </div>
    </JoinFreeClass>
  );
}

/** The brand's signature: thick white lines crossing at shallow angles (thin green ones on Ink). */
function CrossingLines({ dark }: { dark?: boolean }) {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 -z-10 size-full" viewBox="0 0 1000 1000" preserveAspectRatio="none">
      <g stroke={dark ? "#08E186" : "#FFFFFF"} strokeOpacity={dark ? 0.14 : 0.85} strokeWidth={dark ? 1.5 : 18}>
        <line x1="-50" y1="120" x2="1050" y2="820" vectorEffect="non-scaling-stroke" />
        <line x1="200" y1="-50" x2="760" y2="1050" vectorEffect="non-scaling-stroke" />
        <line x1="1050" y1="200" x2="-50" y2="700" vectorEffect="non-scaling-stroke" />
        <line x1="930" y1="-50" x2="520" y2="1050" vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}

function TabFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="inline-block bg-[#464646] px-5 py-2.5 text-[15px] font-semibold text-white">{label}</span>
      <div className="border-edge-ink border-b-[1.5px] border-l-[1.5px] px-6 pt-7 pb-8 sm:px-8">{children}</div>
    </div>
  );
}

async function When() {
  return <WhenBlock fc={await getFreeClass()} />;
}

const dubaiDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dubai" });

/** Date block from console Settings, poster style: big date and time, GST, green rule. Undefined while loading. */
function WhenBlock({ fc }: { fc?: FreeClassDto | null }) {
  const big = tw(displayBold, "text-[40px] text-[#3c3c3c] sm:text-[52px]");
  const meta = (s: string) => <p className="text-edge-emerald mt-2.5 text-xs font-bold tracking-[0.12em] uppercase">{s}</p>;
  let body: ReactNode;
  if (fc === undefined) body = <div className="h-[86px]" />;
  else if (fc?.startsAt)
    body = (
      <div>
        <p className={big}>{dubaiDate.format(new Date(fc.startsAt))}</p>
        <p className={tw(big, "mt-1")}>{formatTime(fc.startsAt)}</p>
        {meta(["GST", fc.platform, `${fc.durationMinutes} min`].filter(Boolean).join(" · "))}
      </div>
    );
  else
    body = (
      <div>
        <p className={big}>Every Week</p>
        {meta("New free classes run regularly · Dates on WhatsApp")}
      </div>
    );
  return (
    <div className="mt-9 flex items-end gap-6">
      {body}
      <div className="bg-edge-green mb-8 hidden h-0.5 flex-1 sm:block" />
    </div>
  );
}

async function ClassCardLoaded() {
  return <ClassCard fc={await getFreeClass()} />;
}

/** Ink card with an Emerald glow: the class at a glance, countdown and rising glass bars. Undefined while loading. */
function ClassCard({ fc }: { fc?: FreeClassDto | null }) {
  return (
    <div className="bg-edge-ink text-edge-offwhite shadow-edge-ink/20 relative isolate overflow-hidden rounded-[40px] p-7 shadow-2xl sm:p-9">
      <div aria-hidden className="bg-edge-emerald/80 absolute -top-28 -left-20 -z-10 size-80 rounded-full blur-3xl" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-edge-mint/80 text-[11px] font-bold tracking-[0.16em] uppercase">Next free live class</p>
          <h2 className="mt-2 text-xl leading-snug font-bold sm:text-2xl">{fc?.title ?? "Free Live Forex & Gold Class"}</h2>
        </div>
        <span className={tw(display, "bg-edge-green text-edge-ink shrink-0 rounded-xl px-3 py-2 text-sm tracking-[0.04em] uppercase")}>
          Free
        </span>
      </div>
      <div className="mt-6">
        {fc === undefined ? (
          <div className="h-[76px]" />
        ) : fc?.startsAt ? (
          <Countdown to={fc.startsAt} />
        ) : (
          <p className="border-edge-mint/15 text-edge-mint rounded-2xl border bg-white/5 px-4 py-3 text-sm">
            Join now and your mentor will send you the date of the next class.
          </p>
        )}
      </div>
      <GlassBars />
      <ul className="text-edge-mint/90 mt-2 grid grid-cols-3 gap-2 text-center text-xs font-semibold">
        {["Live Q&A", "Real charts", "Beginner friendly"].map((t) => (
          <li key={t} className="rounded-full bg-white/5 px-2 py-2">
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Translucent mint-to-green bars rising left to right (growth, never a crash). */
function GlassBars() {
  const bars = [34, 46, 40, 58, 52, 70, 64, 84, 78, 100];
  return (
    <svg aria-hidden viewBox="0 0 320 130" className="mt-6 w-full">
      <defs>
        <linearGradient id="edge-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#08E186" stopOpacity="0.95" />
          <stop offset="1" stopColor="#BEEBEA" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      {bars.map((h, i) => (
        <rect key={i} x={6 + i * 31.5} y={124 - h * 1.15} width="22" height={h * 1.15} rx="6" fill="url(#edge-glass)" />
      ))}
      <polyline
        points={bars.map((h, i) => `${17 + i * 31.5},${116 - h * 1.15}`).join(" ")}
        fill="none"
        stroke="#08E186"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
