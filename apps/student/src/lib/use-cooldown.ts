import { useEffect, useState } from "react";

/**
 * Seconds left before a code can be sent again: counts down from `seconds` each time `sentAt` changes to a new value
 * (every successful send from the page stamps one). Zero until the first send.
 */
export function useCooldown(seconds: number, sentAt: string | undefined) {
  const [left, setLeft] = useState(0);
  const [seen, setSeen] = useState(sentAt);
  if (sentAt && sentAt !== seen) {
    setSeen(sentAt);
    setLeft(seconds);
  }
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return left;
}

/** "Resend code in 0:27" while cooling down, the plain label after. */
export const resendLabel = (left: number, label: string) => (left > 0 ? `${label} in 0:${String(left).padStart(2, "0")}` : label);
