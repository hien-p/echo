"use client";

/**
 * EchoNavRail — shared top brand bar across /dashboard, /forms,
 * /forms/new, /insights. The visual is locked per user feedback;
 * only data is live:
 *   - testnet pill reads clientConfig.SUI_NETWORK
 *   - wallet pill renders the real connected address from useCurrentAccount
 *     with SuiNS reverse lookup, and is a button that disconnects on click
 *   - when no wallet is connected the pill becomes a "connect wallet →"
 *     link to /
 */

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { clientConfig } from "@/config/clientConfig";
import { resolveAddressToName, shortAddress } from "@/lib/echo/suins";
import { DemoAdminToggle } from "@/components/general/DemoAdminToggle";

// dApp Kit's ConnectButton is a Lit web component — needs to be
// client-only so Next.js doesn't try to SSR it.
const ConnectButton = dynamic(
  () => import("@mysten/dapp-kit-react/ui").then((mod) => mod.ConnectButton),
  { ssr: false },
);

type NavKey = "forms" | "dashboard" | "insights" | "reputation";

const LINKS: { key: NavKey; href: string; label: string; ext?: boolean }[] = [
  { key: "forms", href: "/forms", label: "forms" },
  { key: "dashboard", href: "/dashboard", label: "dashboard" },
  { key: "insights", href: "/insights", label: "insights" },
  { key: "reputation", href: "/reputation", label: "reputation" },
];

export function EchoNavRail({ active }: { active: NavKey }) {
  const currentAccount = useCurrentAccount();
  const dAppKit = useDAppKit();
  const walletAddr = currentAccount?.address;
  const [suiName, setSuiName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!walletAddr) {
      setSuiName(null);
      return;
    }
    void resolveAddressToName(walletAddr).then((name) => {
      if (!cancelled) setSuiName(name);
    });
    return () => {
      cancelled = true;
    };
  }, [walletAddr]);

  const network = clientConfig.SUI_NETWORK;
  const short = walletAddr ? shortAddress(walletAddr) : null;
  const handle = suiName ? `${suiName}.sui` : walletAddr ? short : null;

  return (
    <header className="bld-navrail">
      <div className="echo-container bld-navrail__inner">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/dashboard" className="bld-brand">
            <span className="bld-brand__mark" aria-hidden="true" />
            <span className="bld-brand__word">echo</span>
            <span className="bld-brand__tag">forms on sui</span>
          </Link>
          <nav className="bld-nav-links">
            {LINKS.map((l) => (
              <Link
                key={l.key}
                href={l.href}
                className={l.key === active ? "is-active" : ""}
              >
                {l.label}
              </Link>
            ))}
            <Link href="/docs">docs ↗</Link>
          </nav>
        </div>
        <div className="bld-nav-right">
          {/* Demo-admin toggle — lets visitors browse encrypted forms
              owned by the project's demo address without connecting a
              wallet. Component hides itself when DEMO_ADMIN_ADDRESS is
              unset in the env. */}
          <DemoAdminToggle />
          <span className="bld-testnet-pill">
            <span className="bld-testnet-pill__dot" />
            {network}
          </span>
          {walletAddr ? (
            <button
              type="button"
              className="bld-wallet-pill bld-wallet-pill--btn"
              onClick={() => {
                void dAppKit.disconnectWallet();
              }}
              title="click to disconnect"
            >
              <span className="bld-wallet-pill__aurora" aria-hidden="true" />
              <span>{handle}</span>
              {suiName && (
                <span className="bld-wallet-pill__addr">· {short}</span>
              )}
              <span className="bld-wallet-pill__chev">↪</span>
            </button>
          ) : (
            // dApp Kit's stock connect button — handles the wallet
            // picker modal + Enoki Google zkLogin flow internally.
            // Styled by the dApp Kit Lit theme; pill border below
            // gives it a frame so it still feels part of the navrail.
            <span className="bld-wallet-pill bld-wallet-pill--connect">
              <ConnectButton />
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
