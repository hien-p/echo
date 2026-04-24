import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SuiProvider } from "@/contexts/SuiProvider";
import { Header } from "@/components/general/Header";
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
  title: "dApp Template",
  description:
    "The dapp template to bootstrap production battle-ready dapps on Sui easily and quickly.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-[100dvh] flex flex-col`}
      >
        <SuiProvider>
          <Header />
          <main className="p-2xs flex-1 w-full">{children}</main>
        </SuiProvider>
      </body>
    </html>
  );
}
