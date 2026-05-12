import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { SuiProvider } from "@/contexts/SuiProvider";
import { Header } from "@/components/general/Header";
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
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased min-h-[100dvh] flex flex-col`}
        suppressHydrationWarning
      >
        <SuiProvider>
          <Header />
          <main className="p-2xs flex-1 w-full">{children}</main>
          <Toaster />
        </SuiProvider>
      </body>
    </html>
  );
}
