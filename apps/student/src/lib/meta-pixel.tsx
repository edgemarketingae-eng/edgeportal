import Script from "next/script";

/**
 * Meta Pixel (dataset) for the Facebook / Instagram ads. Read at build time; set it only in production, so `next dev` and
 * the e2e builds never send visits or test leads to Meta.
 */
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/** Loads the Meta Pixel and counts a PageView. Renders nothing unless `NEXT_PUBLIC_META_PIXEL_ID` holds a pixel ID. */
export function MetaPixel() {
  if (!PIXEL_ID || !/^\d{5,20}$/.test(PIXEL_ID)) return null;
  // Meta's standard base code.
  return (
    <Script id="meta-pixel">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');fbq('track','PageView');`}
    </Script>
  );
}

/** Report a standard event to the Meta Pixel. Returns false (and does nothing) where the pixel isn't loaded. */
export function trackMeta(event: "Lead", params?: Record<string, string | number>): boolean {
  if (typeof window === "undefined" || !window.fbq) return false;
  window.fbq("track", event, params);
  return true;
}
