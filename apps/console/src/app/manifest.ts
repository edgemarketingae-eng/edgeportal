import type { MetadataRoute } from "next";

/**
 * Lets staff add the console to their phone's home screen. "/" sends each person to their own home (admin panel or
 * staff portal). No service worker: Chrome and Safari install without one, and these signed-in pages shouldn't be cached.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Edge Console",
    short_name: "Edge",
    description: "Staff portal and admin panel for Edge Trading Academy.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#021a1a",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
