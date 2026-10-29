"use client";

import { SegmentedControl } from "@edge/ui/forms/segmented-control";

/** SMS or WhatsApp delivery for Twilio Verify. Posts as `channel`. */
export function ChannelPicker() {
  return (
    <SegmentedControl
      name="channel"
      label="Send the code by"
      defaultValue="sms"
      options={[
        { value: "sms", label: "SMS" },
        { value: "whatsapp", label: "WhatsApp" },
      ]}
    />
  );
}
