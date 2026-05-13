"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { useDAppKit } from "@mysten/dapp-kit-react";
import { ExternalLink } from "lucide-react";
import { resolveAddressToName, shortAddress } from "@/lib/echo/suins";

/**
 * Renders an address as its SuiNS default name (e.g., `alice.sui`) when one
 * is registered on testnet, otherwise falls back to a shortened hex.
 *
 * Hover (or focus) reveals an enrichment popover with light on-chain
 * signals: total balance, owned-objects count, recent transaction count.
 * Adapted from sui-stack-crm's "address as a first-class column type"
 * idiom — addresses become explorable, not just labels.
 *
 * - 1-hour staleTime so the same address re-renders without re-querying.
 * - Returns the bare hex slice while loading so layout doesn't shift.
 * - Optional `linkTo` prop wraps the rendered name in a NextLink.
 * - Tooltip always shows the full address for verification.
 */
export function SuiNSName({
  address,
  linkTo,
  className,
  showAt = true,
  enrich = true,
}: {
  address: string;
  /** If set, wraps the name in a Link to this href. */
  linkTo?: string;
  className?: string;
  /** Render `@alice.sui` style with the leading "@" — turn off for code-style display. */
  showAt?: boolean;
  /** Set false to disable the enrichment popover (e.g. inside dense lists). */
  enrich?: boolean;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const q = useQuery({
    queryKey: ["suins", "reverse", address],
    queryFn: () => resolveAddressToName(address),
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    enabled: !!address?.startsWith("0x"),
    refetchOnWindowFocus: false,
  });

  const fallback = shortAddress(address);
  const name = q.data;
  const display = name ? `${showAt ? "@" : ""}${name}.sui` : fallback;

  if (!enrich) {
    const node = (
      <span title={address} className={className}>
        {display}
      </span>
    );
    return linkTo ? (
      <Link href={linkTo} className="hover:underline">
        {node}
      </Link>
    ) : (
      node
    );
  }

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setPopoverOpen(true)}
      onMouseLeave={() => setPopoverOpen(false)}
    >
      {linkTo ? (
        <Link
          href={linkTo}
          className={className ?? "hover:underline"}
          title={address}
          onFocus={() => setPopoverOpen(true)}
          onBlur={() => setPopoverOpen(false)}
        >
          {display}
        </Link>
      ) : (
        <span
          title={address}
          className={className}
          tabIndex={0}
          onFocus={() => setPopoverOpen(true)}
          onBlur={() => setPopoverOpen(false)}
        >
          {display}
        </span>
      )}
      <AnimatePresence>
        {popoverOpen && <EnrichmentPopover address={address} />}
      </AnimatePresence>
    </span>
  );
}

/**
 * Address enrichment — fetched lazily on first hover. Shows balance,
 * owned-objects count, and the latest transaction digest with an
 * explorer link. Cached for 5 minutes per address.
 */
function EnrichmentPopover({ address }: { address: string }) {
  const dAppKit = useDAppKit();
  const client = dAppKit.getClient();

  const enrich = useQuery({
    queryKey: ["suins", "enrich", address],
    enabled: !!address?.startsWith("0x"),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const [balance, owned, txs] = await Promise.all([
        client
          .getBalance({ address, coinType: "0x2::sui::SUI" })
          .catch(() => null),
        client
          .listOwnedObjects({ owner: address, limit: 1, include: {} })
          .catch(() => null),
        client
          .listTransactions({
            filter: { FromOrToAddress: { addr: address } },
            limit: 5,
            descending: true,
          })
          .catch(() => null),
      ]);
      const totalSui = balance
        ? Number((balance as unknown as { totalBalance?: string }).totalBalance ?? 0) / 1e9
        : null;
      const ownedCount =
        (owned as unknown as { objects?: unknown[] })?.objects?.length ?? null;
      const txDigests = ((txs as unknown as {
        transactions?: Array<{ digest?: string; effects?: { timestampMs?: string } }>;
      })?.transactions ?? []).map((t) => ({
        digest: t.digest ?? "",
        ts: t.effects?.timestampMs
          ? Number(t.effects.timestampMs)
          : null,
      }));
      return { totalSui, ownedCount, txDigests };
    },
  });

  const data = enrich.data;
  const lastTx = data?.txDigests?.[0];
  const lastTxAge = lastTx?.ts
    ? formatRelative(Date.now() - lastTx.ts)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      className="absolute left-0 top-full z-50 mt-1.5 w-[260px] rounded-xl border border-border bg-background p-3 text-foreground shadow-2xl shadow-foreground/10"
      role="dialog"
      onMouseEnter={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <code className="truncate font-mono text-[11px] text-muted-foreground">
          {address}
        </code>
        <Link
          href={`https://suiexplorer.com/address/${address}?network=testnet`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          title="Open in Sui explorer"
        >
          Explorer <ExternalLink size={9} />
        </Link>
      </div>
      {enrich.isLoading ? (
        <div className="mt-2 flex flex-col gap-1">
          <div className="h-3 w-24 animate-pulse rounded bg-foreground/10" />
          <div className="h-3 w-32 animate-pulse rounded bg-foreground/10" />
        </div>
      ) : enrich.isError || !data ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Enrichment unavailable.
        </p>
      ) : (
        <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Stat label="SUI" value={data.totalSui?.toFixed(2) ?? "—"} />
          <Stat label="Objects" value={data.ownedCount ?? "—"} />
          <Stat
            label="Last tx"
            value={lastTxAge ?? (data.txDigests.length > 0 ? "–" : "0")}
          />
        </dl>
      )}
      {lastTx?.digest && (
        <Link
          href={`https://suiexplorer.com/txblock/${lastTx.digest}?network=testnet`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          {lastTx.digest.slice(0, 14)}…
          <ExternalLink size={9} />
        </Link>
      )}
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}

function formatRelative(ms: number): string {
  if (ms < 60_000) return "now";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  return `${Math.round(d / 30)}mo`;
}
