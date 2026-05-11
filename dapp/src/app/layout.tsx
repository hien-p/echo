import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-[100dvh] flex flex-col`}
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
