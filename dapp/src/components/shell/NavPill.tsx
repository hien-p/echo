"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { ConnectWalletMenu } from "@/components/general/ConnectWalletMenu";
import { ThemeToggle } from "./ThemeToggle";
import { headerEnter } from "./motionPresets";

/**
 * Floating-pill nav used by AppShell on every interior route. Mirrors
 * the agency template's header aesthetic but compact (no expanding
 * hamburger), with active-route highlight and a wallet-connect slot
 * on the right.
 *
 * Suppressed on:
 *   /                         (marketing — has its own MarketingHeader)
 *   /forms/<id>               (public takeover viewer ships own chrome)
 *   /forms/<id>/admin         (admin keeps the nav)  ← still shown
 *   /f/<id> /s/<name>         (share-link aliases)
 */
const links = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Forms", href: "/forms" },
  { label: "Build", href: "/forms/new" },
  { label: "Insights", href: "/insights" },
  { label: "Reputation", href: "/reputation" },
];

function isHidden(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  if (/^\/forms\/[^/]+\/?$/.test(pathname)) return true; // public viewer
  if (/^\/f\/[^/]+\/?$/.test(pathname)) return true;
  if (/^\/s\/[^/]+\/?$/.test(pathname)) return true;
  return false;
}

export function NavPill() {
  const pathname = usePathname();
  if (isHidden(pathname)) return null;

  return (
    <motion.header
      {...headerEnter}
      className="fixed left-0 right-0 top-0 z-40 px-4 py-4 sm:px-8 sm:py-6"
    >
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
        {/* Logo pill */}
        <Link
          href="/"
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl bg-foreground/90 px-4 text-base font-semibold tracking-tight text-background shadow-lg backdrop-blur transition hover:opacity-90 sm:h-12 sm:px-5 sm:text-lg"
        >
          Echo
        </Link>

        {/* Center nav pill — hidden on mobile to leave room for actions */}
        <nav className="hidden items-center gap-0.5 rounded-2xl bg-foreground/90 p-1.5 text-background shadow-lg backdrop-blur md:flex">
          {links.map((l) => {
            const active =
              pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-xl px-3.5 py-2 text-sm font-medium transition",
                  active
                    ? "bg-background/15 text-background"
                    : "text-background/70 hover:bg-background/10 hover:text-background",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        {/* Right cluster — theme toggle + wallet */}
        <div className="flex items-center gap-2 rounded-2xl bg-foreground/90 px-2 py-1.5 text-background shadow-lg backdrop-blur">
          <ThemeToggle className="text-background/70 hover:bg-background/10 hover:text-background" />
          <span className="h-5 w-px bg-background/15" aria-hidden="true" />
          <ConnectWalletMenu />
        </div>
      </div>
    </motion.header>
  );
}
