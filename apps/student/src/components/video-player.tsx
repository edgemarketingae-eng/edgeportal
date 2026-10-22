"use client";

import { useEffect, useState } from "react";

const SPOTS = [
  { top: "8%", left: "6%" },
  { top: "12%", left: "62%" },
  { top: "70%", left: "10%" },
  { top: "78%", left: "58%" },
  { top: "42%", left: "34%" },
];

/** Plain HTML5 player with a moving, semi-transparent watermark. Deters casual sharing; cannot stop screen capture. */
export function VideoPlayer({ src, watermark }: { src: string; watermark: string }) {
  const [spot, setSpot] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSpot((s) => (s + 1) % SPOTS.length), 20_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="relative overflow-hidden rounded-xl bg-black select-none" onContextMenu={(e) => e.preventDefault()}>
      <video src={src} controls controlsList="nodownload noremoteplayback" disablePictureInPicture playsInline preload="metadata" className="aspect-video w-full" />
      <span
        aria-hidden
        className="pointer-events-none absolute text-xs font-semibold tracking-wide text-white/35 transition-all duration-1000 sm:text-sm"
        style={{ top: SPOTS[spot]!.top, left: SPOTS[spot]!.left, textShadow: "0 1px 2px rgba(0,0,0,.5)" }}
      >
        {watermark}
      </span>
    </div>
  );
}
