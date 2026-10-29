"use client";

import { Check, Copy } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { toast } from "sonner";
import { Button } from "../components/button";

/** Copies `value` to the clipboard; the icon turns into a tick for a moment. Shows just the icon without `children`. */
export function CopyButton({
  value,
  children,
  variant = "outline",
  size,
  label = "Copy",
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick" | "value"> & { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.");
    }
  }
  return (
    <Button
      type="button"
      variant={variant}
      size={size ?? (children ? "sm" : "icon-sm")}
      aria-label={children ? undefined : copied ? "Copied" : label}
      onClick={copy}
      {...props}
    >
      {copied ? <Check className="text-edge-emerald" /> : <Copy />}
      {children ? (copied ? "Copied" : children) : null}
    </Button>
  );
}
