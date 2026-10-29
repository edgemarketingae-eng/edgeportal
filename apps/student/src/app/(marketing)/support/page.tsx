import { SUPPORT_TOPICS } from "@edge/domain/crm/enums";
import { cn } from "@edge/ui/lib/utils";
import { MessageCircle, MousePointerClick, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { display, eyebrow, tw } from "../brand";
import { CrossingLines, SiteFooter } from "../chrome";
import { SupportForm } from "./support-form";

export const metadata: Metadata = {
  title: { absolute: "Contact Us · Edge Trading Academy" },
  description:
    "Talk to Edge Trading Academy on WhatsApp: help and support, broker account opening, joining a course, Inner Circle access and free live classes.",
  openGraph: {
    title: "Contact Edge Trading Academy",
    description: "Support, broker account opening, courses, Inner Circle access and free live classes. Chat with our team on WhatsApp.",
    siteName: "Edge Trading Academy",
    type: "website",
  },
};

const STEPS = [
  { icon: MousePointerClick, title: "Pick a topic", body: "Tell us what you need: support, a broker account, a course and more." },
  { icon: UserRound, title: "Enter name & WhatsApp", body: "So our team knows who you are." },
  { icon: MessageCircle, title: "Chat with our team", body: "Send the ready message on WhatsApp or Telegram and we take it from there." },
];

/**
 * Public contact page. `?topic=broker-account` (or inner-circle, course, free-class, support) preselects a topic, for
 * links from posts and other pages.
 */
export default function SupportPage(props: PageProps<"/support">) {
  return (
    <div className="relative isolate overflow-x-clip">
      <CrossingLines />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Edge Trading Academy home">
          <Image src="/brand/edge-logo-primary.svg" alt="Edge Trading Academy" width={144} height={36} unoptimized priority />
        </Link>
        <Link href="/" className="text-edge-ink/70 hover:text-edge-ink text-sm font-semibold">
          Free live class
        </Link>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pt-6 pb-16 sm:px-6 lg:pt-12 lg:pb-24">
          <p className={cn(eyebrow, "flex items-center gap-2.5")}>
            <span className="bg-edge-green size-2.5 rounded-full shadow-[0_0_0_5px_rgba(8,225,134,0.18)]" /> Contact us · Dubai
          </p>
          <h1 className={tw(display, "mt-6 text-[44px] sm:text-[72px]")}>
            How Can We <span className="text-edge-green">Help?</span>
          </h1>
          <p className="border-edge-ink mt-7 max-w-2xl rounded-[28px] border-[1.5px] bg-[#C6F2E1] px-5 py-3.5 text-[15px] leading-snug font-semibold sm:px-6 sm:py-4 sm:text-lg">
            Pick a topic, leave your name and WhatsApp number, and continue the chat with our team on WhatsApp or Telegram.
          </p>
          {/* The page is prerendered; only the preselected topic depends on the request. */}
          <Suspense fallback={<SupportForm topic="SUPPORT" />}>
            <TopicForm searchParams={props.searchParams} />
          </Suspense>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
            <p className={cn(eyebrow, "text-center")}>3 simple steps</p>
            <h2 className={tw(display, "mt-3 text-center text-4xl sm:text-6xl")}>How It Works</h2>
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
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

async function TopicForm({ searchParams }: { searchParams: PageProps<"/support">["searchParams"] }) {
  const sp = await searchParams;
  const want = typeof sp.topic === "string" ? sp.topic.toUpperCase().replace(/-/g, "_") : "";
  return <SupportForm topic={SUPPORT_TOPICS.find((t) => t === want) ?? "SUPPORT"} />;
}
