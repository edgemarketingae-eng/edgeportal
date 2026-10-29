"use client";

import { type SupportTopic } from "@edge/domain/crm/enums";
import { SUPPORT_TOPIC_LABELS } from "@edge/domain/crm/labels";
import { Button } from "@edge/ui/components/button";
import { Label } from "@edge/ui/components/label";
import { Textarea } from "@edge/ui/components/textarea";
import { Field, FormError } from "@edge/ui/forms/field";
import { cn } from "@edge/ui/lib/utils";
import { ArrowRight, CircleCheck, Crown, GraduationCap, Landmark, LifeBuoy, Lock, Video, type LucideIcon } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { contactSupportAction, type JoinState } from "../actions";
import { display, tw } from "../brand";
import { OpenChatButton, TONES, UTM } from "../join";

const TOPICS: { key: SupportTopic; icon: LucideIcon; body: string }[] = [
  { key: "SUPPORT", icon: LifeBuoy, body: "Questions about your account, classes, payments or anything else." },
  { key: "BROKER_ACCOUNT", icon: Landmark, body: "Open your JetaFX trading account with our team, step by step." },
  { key: "COURSE", icon: GraduationCap, body: "Fees, batches and how to join the Edge trading course." },
  { key: "INNER_CIRCLE", icon: Crown, body: "Opened a JetaFX account through us? Get your Inner Circle access." },
  { key: "FREE_CLASS", icon: Video, body: "The date and link of the next free Forex & Gold class." },
];

/** Topic tiles and the visitor's details; on success the chat (WhatsApp or Telegram) opens with their message typed in. */
export function SupportForm({ topic: initial }: { topic: SupportTopic }) {
  const [state, action, pending] = useActionState(contactSupportAction, {} as JoinState);
  const [topic, setTopic] = useState(initial);
  const url = state.ok ? state.contactUrl : null;
  const telegram = state.channel === "TELEGRAM";
  useEffect(() => {
    if (url) window.location.href = url;
  }, [url]);

  if (state.ok)
    return (
      <div className="border-edge-ink/10 mx-auto mt-10 grid max-w-md justify-items-center gap-3 rounded-[32px] border bg-white p-8 text-center shadow-xl">
        <span className="bg-edge-green/15 grid size-16 place-items-center rounded-full">
          <CircleCheck className="text-edge-emerald size-9" />
        </span>
        <h2 className={tw(display, "text-3xl")}>We&apos;re On It</h2>
        {url ? (
          <>
            <p className="text-edge-ink/70 text-[15px]">
              Opening {telegram ? "Telegram" : "WhatsApp"} so you can message {state.contactName ?? "our team"}. Send the message and
              they&apos;ll help you from there.
            </p>
            <OpenChatButton url={url} telegram={telegram} />
          </>
        ) : (
          <p className="text-edge-ink/70 text-[15px]">Thanks! Our team will contact you shortly.</p>
        )}
      </div>
    );

  // The ad's UTM tags travel with the lead into the CRM.
  const submit = (form: FormData) => {
    const q = new URLSearchParams(window.location.search);
    for (const k of UTM) form.set(`utm_${k}`, q.get(`utm_${k}`) ?? "");
    action(form);
  };
  const v = state.values;
  return (
    // Remounted after an error so the fields show what was sent (React resets a form after its action).
    <form key={JSON.stringify(v ?? {})} action={submit} className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-start">
      <fieldset>
        <legend className="mb-4 text-lg font-bold">What do you need help with?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {TOPICS.map((t, i) => (
            <label
              key={t.key}
              className={cn(
                "group border-edge-ink/15 hover:border-edge-ink/40 relative flex cursor-pointer gap-4 rounded-3xl border-[1.5px] bg-white p-5 transition-colors",
                "has-[:checked]:border-edge-ink has-[:focus-visible]:ring-edge-green/40 has-[:checked]:bg-[#C6F2E1] has-[:focus-visible]:ring-4",
                i === 0 && "sm:col-span-2",
              )}
            >
              <input
                type="radio"
                name="topic"
                value={t.key}
                defaultChecked={t.key === topic}
                onChange={() => setTopic(t.key)}
                className="sr-only"
              />
              <span className="bg-edge-ink text-edge-green grid size-11 shrink-0 place-items-center rounded-2xl">
                <t.icon className="size-5" />
              </span>
              <span className="pr-6">
                <span className="block text-[17px] font-bold">{SUPPORT_TOPIC_LABELS[t.key]}</span>
                <span className="text-edge-ink/70 mt-1 block text-sm leading-snug">{t.body}</span>
              </span>
              <CircleCheck
                aria-hidden
                className="text-edge-emerald absolute top-4 right-4 size-5 opacity-0 group-has-[:checked]:opacity-100"
              />
            </label>
          ))}
        </div>
      </fieldset>

      {/* Below lg the details card leads; the topic tiles follow it. */}
      <div className="border-edge-ink/10 grid gap-4 rounded-[32px] border bg-white p-6 shadow-xl max-lg:order-first sm:p-8 lg:sticky lg:top-6">
        <div>
          <h2 className={tw(display, "text-3xl")}>Your Details</h2>
          <p className="text-edge-ink/70 mt-2 text-[15px]">Next, you&apos;ll chat with our team on WhatsApp or Telegram.</p>
        </div>
        <FormError state={state} />
        <Field label="Full name" name="name" autoComplete="name" defaultValue={v?.name} required />
        <Field label="WhatsApp number" name="phone" type="tel" defaultValue={v?.phone} required />
        {topic === "INNER_CIRCLE" ? (
          <Field
            label="JetaFX client ID (optional)"
            name="jetaFxClientId"
            defaultValue={v?.jetaFxClientId}
            hint="The account you opened through our link, if you have it."
          />
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="support-message">How can we help? (optional)</Label>
          <Textarea id="support-message" name="message" rows={3} maxLength={1000} defaultValue={v?.message} />
        </div>
        {/* Honeypot: hidden from people, filled by bots. */}
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Website <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <Button disabled={pending} className={cn("mt-1 h-14 rounded-2xl text-sm font-extrabold tracking-[0.08em] uppercase", TONES.ink)}>
          {pending ? "Sending…" : "Contact us"}
          {pending ? null : <ArrowRight className="size-4" />}
        </Button>
        <p className="text-edge-ink/55 flex items-center justify-center gap-1.5 text-center text-xs">
          <Lock className="size-3" /> We only use your number to reply to you.
        </p>
      </div>
    </form>
  );
}
