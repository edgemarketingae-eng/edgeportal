"use client";

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "../components/badge";
import { cn } from "../lib/utils";

/** A secret shown masked, with reveal and copy buttons. */
export function SecretReveal({ value, label = "Temporary password", className }: { value: string; label?: string; className?: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to the clipboard");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Reveal the password and copy it by hand.");
    }
  }
  return (
    <div className={cn("bg-muted/60 inline-flex max-w-full items-center gap-1 rounded-lg border py-0.5 pr-0.5 pl-2", className)}>
      <code aria-label={label} data-secret={shown ? value : undefined} className="truncate font-mono text-xs tracking-wide">
        {shown ? value : "••••••••••••"}
      </code>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        className="text-muted-foreground hover:bg-background hover:text-foreground rounded-md p-1 transition-colors"
      >
        {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label.toLowerCase()}`}
        className="text-muted-foreground hover:bg-background hover:text-foreground rounded-md p-1 transition-colors"
      >
        {copied ? <Check className="text-edge-emerald size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

/** Staff account status; invited people also show their temporary password to whoever manages staff. */
export function StaffStatus({ disabled, invited, tempPassword }: { disabled: boolean; invited: boolean; tempPassword: string | null }) {
  if (disabled)
    return (
      <Badge variant="outline" className="text-destructive">
        Disabled
      </Badge>
    );
  if (!invited)
    return (
      <Badge variant="outline" className="text-edge-emerald">
        Active
      </Badge>
    );
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Badge variant="outline">Invited</Badge>
      {tempPassword ? (
        <SecretReveal value={tempPassword} />
      ) : (
        <span className="text-muted-foreground text-xs">Reset the password to get a new one</span>
      )}
    </div>
  );
}

/** Banner on a staff profile while the person has not signed in with their temporary password yet. */
export function PendingInvite({ invited, disabled, tempPassword }: { invited: boolean; disabled: boolean; tempPassword: string | null }) {
  if (!invited || disabled) return null;
  return (
    <div
      role="status"
      className="border-edge-emerald/25 bg-edge-mint/30 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-sm"
    >
      <span className="font-medium">Waiting for the first sign-in.</span>
      {tempPassword ? (
        <>
          <span className="text-muted-foreground">Temporary password:</span>
          <SecretReveal value={tempPassword} />
        </>
      ) : (
        <span className="text-muted-foreground">Reset the password to get a temporary password you can share.</span>
      )}
    </div>
  );
}
