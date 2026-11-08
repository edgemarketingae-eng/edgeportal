"use client";

import type { ClaudeConsentDto } from "@edge/contracts";
import { Alert, AlertDescription, AlertTitle } from "@edge/ui/components/alert";
import { Button } from "@edge/ui/components/button";
import { Checkbox } from "@edge/ui/components/checkbox";
import { FormError } from "@edge/ui/forms/field";
import { hardNavigate } from "@edge/web/auth-client";
import { Check, X } from "lucide-react";
import { useActionState } from "react";
import { approveConnectAction, denyConnectAction, type ConnectState } from "@/lib/actions/claude";

type Act = (prev: ConnectState, form: FormData) => Promise<ConnectState>;
/** Back to Claude with the answer (claude.ai, or the app listening on this computer). */
const andGoBack =
  (act: Act): Act =>
  async (prev, form) => {
    const r = await act(prev, form);
    return r.redirectTo ? hardNavigate(r.redirectTo) : r;
  };

const STATUS: Record<Exclude<ClaudeConsentDto["status"], "pending">, { title: string; body: string }> = {
  expired: { title: "This request has expired", body: "Go back to Claude and connect again. A request lasts 10 minutes." },
  used: { title: "This request was already answered", body: "Go back to Claude. To connect again, start from Claude." },
  disabled: { title: "Claude access is turned off", body: "Your CRM admin has turned off Claude connections for the CRM." },
};

export function ConnectForm({ requestId, consent: c }: { requestId: string; consent: ClaudeConsentDto }) {
  const [allowState, allow, allowing] = useActionState(andGoBack(approveConnectAction), {});
  const [denyState, deny, denying] = useActionState(andGoBack(denyConnectAction), {});
  const app = c.client?.name ? `“${c.client.name}”` : "An app";

  if (c.status !== "pending") {
    const s = STATUS[c.status];
    return (
      <>
        <h2 className="font-display text-2xl uppercase">Connect Claude</h2>
        <Alert variant={c.status === "disabled" ? "destructive" : "default"}>
          <AlertTitle>{s.title}</AlertTitle>
          <AlertDescription>{s.body}</AlertDescription>
        </Alert>
        {c.client && c.status !== "used" ? (
          <form action={deny}>
            <input type="hidden" name="request" value={requestId} />
            <FormError state={denyState} />
            <Button variant="outline" pending={denying}>
              Back to Claude
            </Button>
          </form>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div>
        <h2 className="font-display text-2xl uppercase">Connect Claude</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {app} wants to work in the Edge CRM <strong className="text-foreground">as you</strong>: {c.you.name} ({c.you.email}). It will
          return to <strong className="text-foreground">{c.client?.returnsTo}</strong>.
        </p>
      </div>
      <Alert variant="warning">
        <AlertTitle>Only allow this if you just started connecting Claude yourself</AlertTitle>
        <AlertDescription>
          If someone sent you this link, choose Deny. The app&apos;s name is what it calls itself, so check where it returns to.
        </AlertDescription>
      </Alert>
      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <p className="font-medium">Claude will be able to</p>
          <ul className="grid gap-1.5">
            {c.canDo.map((x) => (
              <li key={x} className="flex gap-2">
                <Check aria-hidden className="text-edge-emerald mt-0.5 size-4 shrink-0" /> {x}
              </li>
            ))}
          </ul>
        </div>
        <div className="grid content-start gap-2">
          <p className="font-medium">It can never</p>
          <ul className="grid gap-1.5">
            {c.cannotDo.map((x) => (
              <li key={x} className="text-muted-foreground flex gap-2">
                <X aria-hidden className="mt-0.5 size-4 shrink-0" /> {x}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Everything Claude changes is recorded as you and marked &ldquo;via Claude&rdquo;. You can disconnect it any time under Connect
        Claude in the CRM; changing your password disconnects it too.
      </p>
      <form action={allow} id="allow" className="grid gap-4">
        <input type="hidden" name="request" value={requestId} />
        <FormError state={allowState} />
        <FormError state={denyState} />
        <label className="flex items-start gap-2 text-sm">
          <Checkbox name="readOnly" className="mt-0.5" />
          <span>
            <span className="font-medium">Read only</span>
            <span className="text-muted-foreground block">Claude can look things up but can&apos;t change anything.</span>
          </span>
        </label>
      </form>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" form="allow" size="lg" pending={allowing} disabled={denying}>
          Allow
        </Button>
        <form action={deny}>
          <input type="hidden" name="request" value={requestId} />
          <Button variant="outline" size="lg" pending={denying} disabled={allowing}>
            Deny
          </Button>
        </form>
      </div>
    </>
  );
}
