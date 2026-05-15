import type { Metadata } from "next";
import {
  Geist,
  Geist_Mono,
  Instrument_Serif,
  Inter_Tight,
} from "next/font/google";
import { SuiProvider } from "@/contexts/SuiProvider";
import { SkipToContent } from "@/components/shell";
import { Toaster } from "@/components/general/Toaster";
import { ExtensionAttrStripper } from "@/components/general/ExtensionAttrStripper";
import { ErrorReporter } from "@/components/general/ErrorReporter";
import { ServiceWorkerRegister } from "@/components/general/ServiceWorkerRegister";
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
        {/* Chunk retry shim — Walrus aggregators occasionally 503 a
            specific JS chunk on first hit, which Next surfaces as
            "ChunkLoadError" and crashes the whole app. This inline
            script (a) patches window.fetch so failed fetches of
            /_next/static/chunks/*.js retry up to 3× with backoff,
            and (b) listens for <script>-tag onerror events and
            re-injects the same src with a cache-buster after a
            short delay. Both layers are belt-and-braces; either one
            alone would catch most cases.
            Must run BEFORE webpack init, so it lives in <head>. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
              if (typeof window === 'undefined') return;
              var CHUNK_RE = /\\/_next\\/static\\/chunks\\//;
              var MAX = 3;
              // (a) fetch retry
              var origFetch = window.fetch.bind(window);
              window.fetch = function(input, init) {
                var url = typeof input === 'string' ? input : (input && input.url) || '';
                if (!CHUNK_RE.test(url)) return origFetch(input, init);
                var attempt = 0;
                var tryFetch = function() {
                  return origFetch(input, init).then(function(res) {
                    if (res.ok || attempt >= MAX) return res;
                    attempt++;
                    return new Promise(function(r) {
                      setTimeout(function(){ r(tryFetch()); }, 250 * attempt);
                    });
                  }).catch(function(err) {
                    if (attempt >= MAX) throw err;
                    attempt++;
                    return new Promise(function(r) {
                      setTimeout(function(){ r(tryFetch()); }, 250 * attempt);
                    });
                  });
                };
                return tryFetch();
              };
              // (b) script tag onerror retry
              window.addEventListener('error', function(e) {
                var t = e.target;
                if (!t || t.tagName !== 'SCRIPT') return;
                var src = t.src || '';
                if (!CHUNK_RE.test(src)) return;
                var retries = parseInt(t.getAttribute('data-echo-retry') || '0', 10);
                if (retries >= MAX) return;
                e.preventDefault();
                setTimeout(function() {
                  var s = document.createElement('script');
                  s.src = src + (src.indexOf('?') >= 0 ? '&' : '?') + '_r=' + (retries + 1);
                  s.async = t.async;
                  s.defer = t.defer;
                  s.crossOrigin = t.crossOrigin;
                  s.setAttribute('data-echo-retry', String(retries + 1));
                  document.head.appendChild(s);
                }, 200 * (retries + 1));
              }, true);
            })();`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${interTight.variable} antialiased min-h-[100dvh] flex flex-col`}
        suppressHydrationWarning
      >
        {/* Client-only stripper for Bitdefender / Avast / Norton /
            DarkReader injected attributes (bis_skin_checked, etc.).
            A <script dangerouslySetInnerHTML> in <head> was tried first
            but Bitdefender wraps the script tag itself with bis_use,
            data-bis-config and chrome-extension:// src — causing a
            second hydration mismatch on the patch itself. Running the
            MutationObserver from a "use client" useEffect avoids any
            SSR-vs-client diff on the script element. */}
        <ExtensionAttrStripper />
        {/* Best-effort client error telemetry — POSTs ChunkLoadError +
            other client crashes to /api/error-log so we can measure
            failure rates by build + aggregator. No PII, no SDK. */}
        <ErrorReporter />
        <SuiProvider>
          {/* SW registration — caches /_next/static, /assets, fonts,
              CSS, and HTML pages so Walrus aggregator 503s on
              echo-forms.wal.app become invisible to the user. /api/*
              is never cached. Production only. */}
          <ServiceWorkerRegister />
          <SkipToContent />
          {/* Headers are now per-page: marketing uses MarketingHeader,
              app surfaces use EchoNavRail. The legacy NavPill was
              double-stacking on top of EchoNavRail across /dashboard,
              /forms, /forms/new, /insights — removed here. */}
          <main id="main-content" className="p-2xs flex-1 w-full">
            {children}
          </main>
          <Toaster />
        </SuiProvider>
      </body>
    </html>
  );
}
