"use client";

import { FileUp } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * A drop zone for one file: click it or drop a file on it, and it shows the file's name. A native file input fills
 * the zone, so it posts with its form like any file field.
 */
export function FileInput({ className, hint, onChange, ...props }: Omit<ComponentProps<"input">, "type"> & { hint?: ReactNode }) {
  const [file, setFile] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const onReset = () => setFile("");
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  return (
    <div
      data-slot="file-input"
      className={cn(
        "border-input bg-card hover:border-edge-emerald/60 has-focus-visible:border-edge-emerald has-focus-visible:ring-edge-green/20 relative flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center text-sm transition-colors has-focus-visible:ring-4",
        dragging && "border-edge-emerald bg-edge-mint/30",
        className,
      )}
    >
      <FileUp aria-hidden className="text-muted-foreground size-5" />
      <span className={cn("max-w-full truncate font-medium", !file && "text-foreground/80")}>
        {file || (
          <>
            <span className="text-edge-emerald">Choose a file</span> or drop it here
          </>
        )}
      </span>
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
      <input
        ref={input}
        type="file"
        className="absolute inset-0 size-full cursor-pointer opacity-0"
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDrop={() => setDragging(false)}
        onChange={(e) => {
          setFile(e.target.files?.[0]?.name ?? "");
          onChange?.(e);
        }}
        {...props}
      />
    </div>
  );
}
