"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { Input } from "../components/input";
import { cn } from "../lib/utils";

/** A password box with a button to check what's been typed. */
export function PasswordInput({ className, ...input }: ComponentProps<typeof Input>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...input} type={shown ? "text" : "password"} className={cn("pr-10", className)} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        disabled={input.disabled}
        aria-label={shown ? "Hide password" : "Show password"}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-edge-green/40 absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:opacity-50"
      >
        {shown ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      </button>
    </div>
  );
}
