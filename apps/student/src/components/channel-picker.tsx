"use client";

import { cn } from "@edge/ui/lib/utils";
import { useState } from "react";

/** SMS or WhatsApp delivery for Twilio Verify. Posts as `channel`. */
export function ChannelPicker() {
  const [channel, setChannel] = useState<"sms" | "whatsapp">("sms");
  return (
    <div className="text-muted-foreground flex items-center gap-2 text-xs">
      <input type="hidden" name="channel" value={channel} />
      <span>Send code by</span>
      {(["sms", "whatsapp"] as const).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => setChannel(c)}
          className={cn("rounded-full border px-2.5 py-0.5", channel === c ? "border-edge-emerald bg-edge-mint/50 text-edge-emerald" : "border-border")}
        >
          {c === "sms" ? "SMS" : "WhatsApp"}
        </button>
      ))}
    </div>
  );
}
