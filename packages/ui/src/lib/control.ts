/** The shared look of every text-like form control (inputs, selects, date pickers, textareas). */
export const controlClass =
  "w-full min-w-0 rounded-lg border border-input bg-card text-base text-foreground shadow-[0_1px_2px_rgb(2_26_26/0.04)] transition-[border-color,box-shadow,background-color] outline-none placeholder:text-muted-foreground/70 hover:border-foreground/25 focus-visible:border-edge-emerald focus-visible:ring-4 focus-visible:ring-edge-green/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted/60 disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15 md:text-sm dark:bg-input/30";

/** Control heights: forms use `md`, compact toolbars (filters, table bulk actions) use `sm`. */
export const controlSize = { sm: "h-9 px-3", md: "h-10 px-3" } as const;
