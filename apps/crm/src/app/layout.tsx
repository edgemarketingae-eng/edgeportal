import { FlashToast } from "@edge/ui/blocks/delete-dialog";
import { Toaster } from "@edge/ui/components/sonner";
import { TooltipProvider } from "@edge/ui/components/tooltip";
import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Edge CRM", template: "%s · Edge CRM" },
  description: "Sales CRM for Edge Trading Academy.",
  robots: { index: false, follow: false },
  // Added to an iPhone home screen it opens full screen; the icon is app/apple-icon.png, the manifest is app/manifest.ts.
  appleWebApp: { capable: true, title: "Edge CRM", statusBarStyle: "default" },
};

/** The app is light only, so the phone's status bar matches the white header. */
export const viewport: Viewport = { themeColor: "#ffffff" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-center" />
        {/* After a delete redirects away from the deleted record's page, `?flash=` carries the confirmation. */}
        <Suspense>
          <FlashToast />
        </Suspense>
      </body>
    </html>
  );
}
