"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWalletMenu } from "./ConnectWalletMenu";
import { DemoAdminToggle, useDemoAdminMode } from "./DemoAdminToggle";
import { TrustBadge } from "./TrustBadge";

/**
 * Routes that present a single form to a respondent — strip the entire
 * app chrome so they look like a focused share page (mirroring Google
 * Forms / Typeform), not the inside of someone's admin panel.
 *
 *   /forms/<id>          public submission view
 *   /f/<id>              short-link alias for the same
 *   /s/<name>            SuiNS-resolved branded share link
 *
 * Admin variants (/forms/<id>/admin) intentionally KEEP the chrome —
 * the operator wants the nav to bounce between dashboards.
 */
function isPublicShareRoute(pathname: string): boolean {
  // /forms/0xabc/  but not  /forms/0xabc/admin/
  if (/^\/forms\/[^/]+\/?$/.test(pathname)) return true;
  if (/^\/f\/[^/]+\/?$/.test(pathname)) return true;
  if (/^\/s\/[^/]+\/?$/.test(pathname)) return true;
  return false;
}

function isMarketingHome(pathname: string): boolean {
  // The new agency-style homepage at "/" ships its own header with a
  // different nav and floating-pill aesthetic; suppress this app
  // header there so we don't double-stack chrome.
  return pathname === "/" || pathname === "";
}

export const Header = () => {
  const pathname = usePathname();
  const demoMode = useDemoAdminMode();
  if (isPublicShareRoute(pathname)) return null;
  if (isMarketingHome(pathname)) return null;
  return (
    <header className="p-2xs bg-background border-b text-foreground sticky top-0 z-30 flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/" className="text-xl font-semibold shrink-0">
          Echo
        </Link>
        <TrustBadge />
        <nav className="hidden md:flex items-center gap-sm text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/forms" className="hover:text-foreground">
            My forms
          </Link>
          <Link href="/forms/new" className="hover:text-foreground">
            New form
          </Link>
          <Link href="/reputation" className="hover:text-foreground">
            Reputation
          </Link>
          <Link href="/insights" className="hover:text-foreground">
            Insights
          </Link>
          <Link href="/logs/" className="hover:text-foreground">
            Devlog
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <DemoAdminToggle />
        {!demoMode && <ConnectWalletMenu />}
      </div>
      {/* Mobile-only secondary nav row — wraps under the brand on <md
          viewports so the desktop nav can stay flat. */}
      <nav className="md:hidden w-full flex items-center gap-3 text-xs text-muted-foreground overflow-x-auto pb-1">
        <Link href="/dashboard" className="hover:text-foreground shrink-0">
          Dashboard
        </Link>
        <Link href="/forms" className="hover:text-foreground shrink-0">
          My forms
        </Link>
        <Link href="/forms/new" className="hover:text-foreground shrink-0">
          New form
        </Link>
        <Link href="/reputation" className="hover:text-foreground shrink-0">
          Reputation
        </Link>
        <Link href="/insights" className="hover:text-foreground shrink-0">
          Insights
        </Link>
        <Link href="/logs/" className="hover:text-foreground shrink-0">
          Devlog
        </Link>
      </nav>
    </header>
  );
};
