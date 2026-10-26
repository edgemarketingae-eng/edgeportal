/** Headlines: Manrope ExtraBold, Title Case, tight tracking (as on the approved Edge posters). */
export const display = "font-sans font-extrabold leading-[0.98] tracking-[-0.04em]";
/** Dates and numbers: same face, slightly looser. */
export const displayBold = "font-sans font-extrabold leading-none tracking-[-0.03em]";
/** Eyebrow / kicker: bold, spaced caps in Deep Emerald. */
export const eyebrow = "text-edge-emerald text-xs font-bold tracking-[0.18em] uppercase";
/**
 * Joins class names without tailwind-merge: `cn` drops a `leading-*` that precedes a font size, which would undo the
 * display line-height above.
 */
export const tw = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
