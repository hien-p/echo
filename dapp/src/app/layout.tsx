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
      <head>
        {/* Strip Bitdefender / Avast / Norton anti-tracker attributes
            that get injected onto every <div> before React hydration —
            otherwise React 19 logs a hydration mismatch ("bis_skin_
            checked", "cz-shortcut-listen", "data-darkreader-*") that
            pops the dev overlay. Runs synchronously at top of head so
            it fires before React's first commit. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
              try {
                var STRIP = ["bis_skin_checked","bis_register","__processed_bis_register__","cz-shortcut-listen"];
                function clean(node){
                  if(!node || node.nodeType !== 1) return;
                  for (var i=0;i<STRIP.length;i++){
                    if (node.hasAttribute(STRIP[i])) node.removeAttribute(STRIP[i]);
                  }
                }
                var mo = new MutationObserver(function(records){
                  for (var i=0;i<records.length;i++){
                    var r = records[i];
                    if (r.type === "attributes" && STRIP.indexOf(r.attributeName) !== -1){
                      r.target.removeAttribute(r.attributeName);
                    } else if (r.type === "childList"){
                      r.addedNodes.forEach(function(n){
                        clean(n);
                        if (n.querySelectorAll){
                          n.querySelectorAll("*").forEach(clean);
                        }
                      });
                    }
                  }
                });
                if (document.documentElement){
                  mo.observe(document.documentElement, {
                    subtree: true,
                    childList: true,
                    attributes: true,
                    attributeFilter: STRIP,
                  });
                }
              } catch (e) { /* extension-strip best-effort */ }
            })();`,
          }}
        />
      </head>
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
