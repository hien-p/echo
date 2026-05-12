import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Instrument_Serif,
  Inter_Tight,
} from "next/font/google";
import { SuiProvider } from "@/contexts/SuiProvider";
import { NavPill, SkipToContent } from "@/components/shell";
import { Toaster } from "@/components/general/Toaster";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial italic for marketing accents — agency hero uses
// `<em className="font-serif">` for the headline italic, but with no
// font-serif token defined Tailwind falls back to system Times. Wire
// Instrument Serif so the italic actually feels editorial, not 1995.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

// Editorial display face used by the Synex-style admin hero (FormAdmin
// page). Weights 300..900 covers the eyebrow (500), headline (500),
// and any heavier accent we want. Display "swap" so the page paints
// before the font arrives — important for the headline blur-in entry.
const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Echo — Decentralized Feedback & Forms",
  description:
    "Walrus-native form platform with encrypted storage, on-chain composability, and zkLogin sign-in. Nobody builds this on Google Forms.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${interTight.variable} antialiased min-h-[100dvh] flex flex-col`}
        suppressHydrationWarning
      >
        <SuiProvider>
          <SkipToContent />
          {/* Floating-pill nav — auto-hides on marketing /, public form
              viewer routes, and SuiNS share alias. Mounted on every
              other route (including /forms/<id>/admin). */}
          <NavPill />
          <main id="main-content" className="p-2xs flex-1 w-full">
            {children}
          </main>
          <Toaster />
        </SuiProvider>
      </body>
    </html>
  );
}
