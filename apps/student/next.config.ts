import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Development settings live in one .env at the repo root (see .env.example). Values already in the
// environment win, so Docker/production variables and an app-level .env are never overridden.
const rootEnv = path.join(import.meta.dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// The browser only ever talks to this app's origin; these paths are proxied to the Express API.
// API_INTERNAL_URL is read at build time (rewrites are compiled into the build).
const api = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
const dev = process.env.NODE_ENV !== "production";
// The e2e stack builds with DEV_ROUTES=true (mock checkout, job runner) into its own dist dir,
// so it never touches the .next folder of a running `next dev`.
const devRoutes = dev || process.env.DEV_ROUTES === "true";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Trace from the monorepo root so the standalone server includes workspace packages.
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  poweredByHeader: false,
  allowedDevOrigins: ["student.localhost"],
  transpilePackages: ["@edge/domain", "@edge/contracts", "@edge/ui", "@edge/web"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      { source: "/api/auth/:path*", destination: `${api}/api/auth/:path*` },
      { source: "/api/v1/auth/:path*", destination: `${api}/api/v1/auth/:path*` },
      { source: "/api/join/:sessionId", destination: `${api}/api/join/:sessionId` },
      { source: "/api/checkout/return/:paymentId", destination: `${api}/api/checkout/return/:paymentId` },
      ...(devRoutes ? [{ source: "/api/dev/:path*", destination: `${api}/api/dev/:path*` }] : []),
    ];
  },
};

export default nextConfig;
