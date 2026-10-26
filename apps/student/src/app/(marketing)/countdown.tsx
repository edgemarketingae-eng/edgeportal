"use client";

import { useEffect, useState } from "react";
import { displayBold } from "./brand";

const UNITS = [
  ["Days", 86_400_000],
  ["Hours", 3_600_000],
  ["Mins", 60_000],
  ["Secs", 1000],
] as const;

/** Time left until the class (on the Ink card); rendered only in the browser so server and client never disagree on "now". */
export function Countdown({ to }: { to: string }) {
  const target = new Date(to).getTime();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, target - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [target]);

  if (left === null) return <div className="h-[76px]" />;
  if (left === 0) return <p className="text-edge-green text-lg font-bold">Live now. Join and we&apos;ll send you the link.</p>;
  return (
    <div className="grid grid-cols-4 gap-2" role="timer" aria-label="Time until the class starts">
      {UNITS.map(([label, ms], i) => {
        const n = Math.floor((i ? left % UNITS[i - 1]![1] : left) / ms);
        return (
          <div key={label} className="border-edge-mint/15 rounded-2xl border bg-white/5 py-3 text-center">
            <div className={`${displayBold} text-edge-offwhite text-2xl tabular-nums sm:text-3xl`}>{String(n).padStart(2, "0")}</div>
            <div className="text-edge-mint/70 mt-1 text-[10px] font-semibold tracking-[0.14em] uppercase">{label}</div>
          </div>
        );
      })}
    </div>
  );
}
