import { Toaster } from "@edge/ui/components/sonner";
import { TooltipProvider } from "@edge/ui/components/tooltip";
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (Manrope variable font, latin, weights 200-800): fetching from Google Fonts at build time broke server builds.
const manrope = localFont({ src: "./fonts/manrope-latin.woff2", variable: "--font-manrope", weight: "200 800", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Edge Trading Academy", template: "%s · Edge Trading Academy" },
  description: "Student portal for Edge Trading Academy.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
