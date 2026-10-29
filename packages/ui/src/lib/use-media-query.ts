import { useSyncExternalStore } from "react";

/** Whether a media query matches; false on the server and during hydration. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Phones: below Tailwind's `sm` breakpoint. */
export const PHONE_QUERY = "(max-width: 639px)";
