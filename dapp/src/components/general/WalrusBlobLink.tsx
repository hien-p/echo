"use client";

import { ExternalLink } from "lucide-react";
import { clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";

const AGGREGATOR_BASE: Record<"testnet" | "mainnet", string> = {
  testnet: "https://aggregator.walrus-testnet.walrus.space",
  mainnet: "https://aggregator.walrus.space",
};

/**
 * Tiny inline chip that surfaces "this artifact lives on Walrus" with
 * a deep link to the public aggregator. Two affordances: clicking the
 * truncated blob id copies it; clicking the arrow opens the raw bytes.
 *
 * Using this consistently across schema / metadata / payload renderings
 * makes the Walrus integration legible — judges shouldn't have to read
 * the source to see that "stored on Walrus" actually means content-
 * addressed blobs they can fetch from any aggregator on the network.
 */
export const WalrusBlobLink = ({
  blobId,
  label,
  className,
  variant = "default",
}: {
  blobId: string;
  /** Optional caption rendered before the chip — e.g. "Schema". */
  label?: string;
  className?: string;
  /**
   * `default` — uppercase label + short hash + arrow (for dense lists).
   * `pill` — single rounded chip "{label} → Walrus ↗" with the blob id
   * only in the tooltip. Use this when the brand (Walrus) is what
   * matters to a viewer, not the content-address hash.
   */
  variant?: "default" | "pill";
}) => {
  if (!blobId) return null;
  const network = clientConfig.WALRUS_NETWORK;
  const aggregator = AGGREGATOR_BASE[network] ?? AGGREGATOR_BASE.testnet;
  const url = `${aggregator}/v1/blobs/${blobId}`;
  const short = `${blobId.slice(0, 6)}…${blobId.slice(-4)}`;

  if (variant === "pill") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={`${label ?? "Blob"} on Walrus · ${blobId}`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-foreground/80 hover:bg-accent hover:text-foreground",
          className,
        )}
      >
        {label && <span className="font-medium">{label}</span>}
        <span className="opacity-60">→</span>
        <span>Walrus</span>
        <ExternalLink size={11} className="opacity-70" />
      </a>
    );
  }

  const copy = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(blobId);
  };

  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[10px]", className)}
    >
      {label && (
        <span className="uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={copy}
        title={`${blobId} · click to copy full id`}
        className="font-mono text-muted-foreground hover:text-foreground"
      >
        {short}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title="Open raw bytes from Walrus aggregator"
        className="inline-flex items-center text-muted-foreground hover:text-foreground"
      >
        <ExternalLink size={10} />
      </a>
    </span>
  );
};
