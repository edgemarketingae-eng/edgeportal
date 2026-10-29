import { Toaster } from "@edge/ui/components/sonner";
import { TooltipProvider } from "@edge/ui/components/tooltip";
import { SearchableCountryPickers } from "@edge/ui/forms/country-picker";
import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Edge CRM", template: "%s · Edge CRM" },
  description: "Sales CRM for Edge Trading Academy.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <TooltipProvider>
          {/* Country and dial-code pickers with a search box, for staff picking among ~250 countries. */}
          <SearchableCountryPickers>{children}</SearchableCountryPickers>
        </TooltipProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
