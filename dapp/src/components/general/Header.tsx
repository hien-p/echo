"use client";

import Link from "next/link";
import { ConnectWalletMenu } from "./ConnectWalletMenu";
import { DemoAdminToggle, useDemoAdminMode } from "./DemoAdminToggle";

export const Header = () => {
  const demoMode = useDemoAdminMode();
  return (
    <header className="p-2xs bg-background border-b text-foreground sticky top-0 z-30 flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <Link href="/" className="text-xl font-semibold shrink-0">
          Echo
        </Link>
        <nav className="hidden md:flex items-center gap-sm text-sm text-muted-foreground">
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
