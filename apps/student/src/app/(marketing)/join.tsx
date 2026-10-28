"use client";

import { Button } from "@edge/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@edge/ui/components/dialog";
import { Field, FormError } from "@edge/ui/forms/field";
import { cn } from "@edge/ui/lib/utils";
import { ArrowRight, CircleCheck, Lock, MessageCircle } from "lucide-react";
import { createContext, use, useActionState, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { joinFreeClassAction, type JoinState } from "./actions";
import { display, tw } from "./brand";

const UTM = ["source", "medium", "campaign", "content", "term"] as const;

const JoinContext = createContext<() => void>(() => {});

/** One sign-up dialog for the whole page; every "Join" button opens it. */
export function JoinFreeClass({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <JoinContext value={() => setOpen(true)}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={tw("bg-edge-offwhite text-edge-ink gap-5 rounded-3xl p-6 sm:max-w-md sm:p-8")}>
          {open ? <JoinForm /> : null}
        </DialogContent>
      </Dialog>
    </JoinContext>
  );
}

const TONES = {
  /** Brand CTA on light: Ink button, Edge Green label. */
  ink: "bg-edge-ink text-edge-green hover:bg-edge-pine",
  /** On Ink surfaces: Edge Green button, Ink label. */
  green: "bg-edge-green text-edge-ink hover:bg-[#1ADE88]",
};

export function JoinButton({ children, className, tone = "ink", ...props }: ComponentProps<typeof Button> & { tone?: keyof typeof TONES }) {
  const openJoin = use(JoinContext);
  return (
    <Button
      type="button"
      onClick={openJoin}
      className={cn("h-14 rounded-2xl px-7 text-sm font-extrabold tracking-[0.08em] uppercase shadow-sm", TONES[tone], className)}
      {...props}
    >
      {children}
      <ArrowRight className="size-4" />
    </Button>
  );
}

function JoinForm() {
  const [state, action, pending] = useActionState(joinFreeClassAction, {} as JoinState);
  const url = state.ok ? state.contactUrl : null;
  const telegram = state.channel === "TELEGRAM";
  useEffect(() => {
    if (url) window.location.href = url;
  }, [url]);

  if (state.ok)
    return (
      <div className="grid justify-items-center gap-3 py-2 text-center">
        <span className="bg-edge-green/15 grid size-16 place-items-center rounded-full">
          <CircleCheck className="text-edge-emerald size-9" />
        </span>
        <DialogTitle className={tw(display, "text-3xl")}>You&apos;re In</DialogTitle>
        {url ? (
          <>
            <DialogDescription className="text-edge-ink/70 text-[15px]">
              Opening {telegram ? "Telegram" : "WhatsApp"} so you can say hi to {state.contactName ?? "our team"}. Send the message and
              they&apos;ll help you from there.
            </DialogDescription>
            <Button
              asChild
              className={cn(
                "mt-2 h-14 w-full rounded-2xl text-base font-bold text-white",
                telegram ? "bg-[#229ED9] hover:bg-[#1c8cc2]" : "bg-[#25D366] hover:bg-[#1ebe5b]",
              )}
            >
              <a href={url}>
                <MessageCircle className="size-5" /> Open {telegram ? "Telegram" : "WhatsApp"}
              </a>
            </Button>
          </>
        ) : (
          <DialogDescription className="text-edge-ink/70 text-[15px]">
            Thanks! Our team will contact you shortly.
          </DialogDescription>
        )}
      </div>
    );

  // The ad's UTM tags travel with the lead into the CRM.
  const submit = (form: FormData) => {
    const q = new URLSearchParams(window.location.search);
    for (const k of UTM) form.set(`utm_${k}`, q.get(`utm_${k}`) ?? "");
    action(form);
  };
  return (
    <form action={submit} className="grid gap-4">
      <DialogHeader className="gap-2">
        <span className="bg-edge-green/15 text-edge-emerald w-fit rounded-full px-3 py-1 text-[11px] font-bold tracking-[0.14em] uppercase">
          100% free
        </span>
        <DialogTitle className={tw(display, "text-3xl")}>Save Your Seat</DialogTitle>
        <DialogDescription className="text-edge-ink/70 text-[15px]">
          Next, you&apos;ll chat with your mentor and get the class link.
        </DialogDescription>
      </DialogHeader>
      <FormError state={state} />
      <Field label="Full name" name="name" autoComplete="name" defaultValue={state.values?.name} required autoFocus />
      <Field label="WhatsApp number" name="phone" type="tel" defaultValue={state.values?.phone} required />
      {/* Honeypot: hidden from people, filled by bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <Button disabled={pending} className={cn("mt-1 h-14 rounded-2xl text-sm font-extrabold tracking-[0.08em] uppercase", TONES.ink)}>
        {pending ? "Sending…" : "Contact support"}
        {pending ? null : <ArrowRight className="size-4" />}
      </Button>
      <p className="text-edge-ink/55 flex items-center justify-center gap-1.5 text-center text-xs">
        <Lock className="size-3" /> No card, no fees. We only use your number for the class details.
      </p>
    </form>
  );
}

/** Phones: once the hero's button scrolls away, a "Join" bar stays in reach at the bottom. */
export function StickyJoin() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > 560);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div
      className={cn(
        "border-edge-ink/10 fixed inset-x-0 bottom-0 z-40 border-t bg-white/90 p-3 backdrop-blur transition-transform duration-300 sm:hidden",
        shown ? "translate-y-0" : "translate-y-full",
      )}
    >
      <JoinButton className="w-full" tabIndex={shown ? 0 : -1}>
        Contact support
      </JoinButton>
    </div>
  );
}
