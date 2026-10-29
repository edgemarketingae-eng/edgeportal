/**
 * Badge colours by meaning, shared by every status badge so one colour always says the same thing. Full class names
 * (Tailwind only finds whole names), each with its dark-theme twin.
 */
export const tone = {
  neutral: "border-border bg-muted text-muted-foreground",
  success: "border-edge-green/40 bg-edge-green/20 text-edge-emerald dark:text-edge-green",
  warning: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
  blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300",
  teal: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-500/40 dark:bg-teal-500/15 dark:text-teal-300",
  violet: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-300",
  orange: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-300",
  sky: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-300",
  red: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300",
  gray: "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-500/40 dark:bg-zinc-500/15 dark:text-zinc-300",
} as const;

export type Tone = keyof typeof tone;
