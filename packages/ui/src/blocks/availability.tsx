"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "../components/badge";
import { Switch } from "../components/switch";
import { tone } from "../lib/tones";
import type { ActionState } from "../forms/field";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/**
 * Receiving leads / Off toggle for a staff member. Off people keep their account and stay visible everywhere; only
 * automatic assignment (round-robin, website, landing page, import) skips them.
 */
export function AvailabilitySwitch({
  action,
  userId,
  name,
  available,
  showLabel,
}: {
  action: Action;
  userId: string;
  name: string;
  available: boolean;
  showLabel?: boolean;
}) {
  const [on, setOn] = useOptimistic(available);
  const [pending, start] = useTransition();
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium">
      <Switch
        checked={on}
        disabled={pending}
        aria-label={`${name}: receiving leads`}
        onCheckedChange={(v) =>
          start(async () => {
            setOn(v);
            const form = new FormData();
            form.set("userId", userId);
            form.set("available", v ? "1" : "0");
            const r = await action({}, form);
            if (r.ok) toast.success(r.message ?? "Saved");
            if (r.error) toast.error(r.error);
          })
        }
      />
      {showLabel ? (
        <span className={on ? "text-edge-emerald" : "text-amber-700 dark:text-amber-300"}>{on ? "Receiving leads" : "Off"}</span>
      ) : null}
    </label>
  );
}

export function OffBadge() {
  return (
    <Badge variant="outline" className={tone.warning} title="No new leads are assigned automatically">
      Off
    </Badge>
  );
}
