"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server page every few seconds (e.g. while a payment confirms). */
export function AutoRefresh({ everyMs = 3000, maxTimes = 20 }: { everyMs?: number; maxTimes?: number }) {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    const id = setInterval(() => {
      if (++n > maxTimes) return clearInterval(id);
      router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs, maxTimes]);
  return null;
}
