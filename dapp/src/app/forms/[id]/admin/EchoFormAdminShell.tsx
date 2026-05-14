"use client";

/**
 * /forms/[id]/admin — Echo Form Admin shell per
 * `~/Downloads/memwal_newversion/form-admin.jsx`.
 *
 * Wraps the existing FormAdmin component (the full operator surface
 * — Seal session-key gate, submission decryption, members ACL,
 * webhooks, danger zone) in the Frame×MemWal×Sui paper shell so it
 * sits in the same surface family as the rest of the app.
 *
 * Hero pulls real on-chain data: tier badge with k/n string,
 * status pill, walrus blob chips (schema, metadata, object id),
 * brutalist "preview form ↗" CTA. The actual admin functionality
 * stays in <FormAdmin>; this file only adds the editorial chrome.
 */

import Link from "next/link";
import * as React from "react";
import { useMemo } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { useDAppKit } from "@mysten/dapp-kit-react";
import { clientConfig } from "@/config/clientConfig";
import {
  PrivacyTier,
  readJsonViaAggregator,
  type FormMetadata,
} from "@/lib/echo";
import { WalrusMascot } from "@/components/general/FrameForms";
import { FormAdmin } from "./FormAdminClient";

interface OnChainForm {
  metadata_blob_id: string;
  schema_blob_id: string;
  privacy_tier: number;
  status: number;
  submission_count?: string;
  threshold_n?: number;
  threshold_m?: number;
  unlock_ms?: string;
}

const TIER_NAMES = [
  "Public",
  "Admin only",
  "Threshold",
  "Time-locked",
  "Conditional",
];
const TIER_COLORS = ["#0A0A0A", "#4DA2FF", "#A06EE9", "#6CD3D6", "#E8A540"];

function useAdminShell(formId: string) {
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  return useQuery({
    queryKey: ["echo", "form-shell", formId],
    queryFn: async () => {
      const obj = await suiClient.getObject({
        objectId: formId,
        include: { json: true },
      });
      const onChain = (obj as unknown as { json?: OnChainForm }).json;
      if (!onChain) return null;
      let title = `Form ${formId.slice(0, 10)}…`;
      let description: string | undefined;
      try {
        const meta = await readJsonViaAggregator<FormMetadata>(
          onChain.metadata_blob_id,
          { network: clientConfig.WALRUS_NETWORK },
        );
        title = meta.title || title;
        description = meta.description;
      } catch {
        /* fallback to id title */
      }
      return { onChain, title, description };
    },
    staleTime: 60_000,
    enabled: formId.startsWith("0x"),
  });
}

function Mono({
  children,
  size = 11,
  color = "var(--echo-mut)",
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
}) {
  return (
    <span className="echo-mono" style={{ fontSize: size, color }}>
      {children}
    </span>
  );
}

function TierDot({ tier }: { tier: number }) {
  const c = TIER_COLORS[tier] ?? "#0A0A0A";
  return (
    <span
      aria-hidden="true"
      style={{
        width: 9,
        height: 9,
        borderRadius: 999,
        background: c,
        boxShadow: `0 0 0 3px ${c}26`,
        display: "inline-block",
      }}
    />
  );
}

function StatusTag({ status }: { status: number }) {
  const cfg =
    status === 1
      ? {
          bg: "var(--echo-success-bg)",
          color: "var(--echo-success)",
          label: "open",
        }
      : status === 2
        ? {
            bg: "var(--echo-rail-2)",
            color: "var(--echo-mut)",
            label: "closed",
          }
        : {
            bg: "var(--echo-rail-2)",
            color: "var(--echo-mut-2)",
            label: "archived",
          };
  return (
    <span
      style={{
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        padding: "3px 8px",
        borderRadius: 999,
        background: cfg.bg,
        color: cfg.color,
      }}
    >
      {cfg.label}
    </span>
  );
}

function BlobChip({
  kind,
  blob,
  href,
}: {
  kind: string;
  blob: string;
  href?: string;
}) {
  const Tag = href ? "a" : "span";
  return (
    <Tag
      href={href}
      target={href ? "_blank" : undefined}
      rel={href ? "noreferrer" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 10px",
        border: "1px solid var(--echo-rail)",
        borderRadius: 999,
        background: "var(--echo-paper)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <Mono size={9} color="var(--echo-mut)">
        {kind}
      </Mono>
      <span
        style={{
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
          color: "var(--echo-ink)",
          letterSpacing: 0,
        }}
      >
        {blob.length > 22 ? `${blob.slice(0, 10)}…${blob.slice(-6)}` : blob}
      </span>
      {href && <span style={{ fontSize: 9, color: "var(--echo-mut)" }}>↗</span>}
    </Tag>
  );
}

function TrustChip({
  icon,
  children,
}: {
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        background: "var(--echo-rail-2)",
        borderRadius: 999,
      }}
    >
      <span style={{ fontSize: 11 }}>{icon}</span>
      <Mono size={9.5} color="var(--echo-ink)">
        {children}
      </Mono>
    </span>
  );
}

function HeroShelf({ formId }: { formId: string }) {
  const shell = useAdminShell(formId);
  const data = shell.data;
  const tier = data?.onChain.privacy_tier ?? 0;
  const k = useMemo(() => {
    if (!data) return null;
    if (tier === PrivacyTier.Threshold) {
      const n = data.onChain.threshold_n ?? 0;
      const m = data.onChain.threshold_m ?? 0;
      if (n > 0 && m > 0) return `${n}/${m}`;
    }
    if (tier === PrivacyTier.AdminOnly) return "owner only";
    if (tier === PrivacyTier.Conditional) return "on-chain rule";
    return null;
  }, [data, tier]);

  const aggregator =
    clientConfig.WALRUS_NETWORK === "mainnet"
      ? "https://aggregator.walrus.mainnet.walrus.space"
      : "https://aggregator.walrus-testnet.walrus.space";

  return (
    <section
      className="echo-section"
      style={{ background: "var(--echo-paper)" }}
    >
      <div className="echo-container" style={{ paddingBlock: "32px 40px" }}>
        <Link
          href="/forms"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--echo-mut)",
            fontWeight: 500,
            marginBottom: 18,
          }}
        >
          <span style={{ fontFamily: "JetBrains Mono, monospace" }}>←</span> all
          forms
        </Link>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 40,
            alignItems: "flex-start",
          }}
        >
          <div style={{ maxWidth: 800 }}>
            <Mono size={11}>
              <TierDot tier={tier} />
              <span style={{ color: "var(--echo-ink)" }}>
                {TIER_NAMES[tier] ?? "Public"} form
              </span>
              <span style={{ margin: "0 10px", color: "#D6D6D6" }}>·</span>
              <StatusTag status={data?.onChain.status ?? 0} />
              {k && (
                <>
                  <span style={{ margin: "0 10px", color: "#D6D6D6" }}>·</span>
                  <span style={{ color: "var(--echo-mut)" }}>{k}</span>
                </>
              )}
            </Mono>
            <motion.h1
              initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                letterSpacing: "-0.04em",
                fontSize: "clamp(36px, 5vw, 60px)",
                lineHeight: 1.02,
                margin: "12px 0 10px",
                color: "var(--echo-ink)",
                textWrap: "balance" as never,
              }}
            >
              {shell.isLoading
                ? "Loading admin…"
                : (data?.title ?? "(metadata unavailable)")}
            </motion.h1>
            {data?.description && (
              <p
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: "var(--echo-mut)",
                  maxWidth: 640,
                  margin: "0 0 16px",
                }}
              >
                {data.description}
              </p>
            )}
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                marginBottom: 14,
              }}
            >
              {tier !== 0 && (
                <TrustChip icon="🔒">end-to-end encrypted</TrustChip>
              )}
              {tier !== 0 && <TrustChip icon="◆">sealed by Seal</TrustChip>}
              <TrustChip icon="●">stored on Walrus</TrustChip>
              <TrustChip icon="∞">settled on Sui</TrustChip>
            </div>
            {data && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <BlobChip
                  kind="schema"
                  blob={data.onChain.schema_blob_id}
                  href={`${aggregator}/v1/blobs/${data.onChain.schema_blob_id}`}
                />
                <BlobChip
                  kind="metadata"
                  blob={data.onChain.metadata_blob_id}
                  href={`${aggregator}/v1/blobs/${data.onChain.metadata_blob_id}`}
                />
                <BlobChip kind="object" blob={formId} />
              </div>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "flex-end",
            }}
          >
            <Link
              href={`/forms/${formId}`}
              className="echo-brut"
              style={{
                padding: "10px 16px",
                background: "var(--echo-ink)",
                color: "#FAF8F5",
                fontSize: 11,
              }}
            >
              preview form <span style={{ fontSize: "1.1em" }}>↗</span>
            </Link>
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: 0.9,
                delay: 0.2,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="ff-bobble"
            >
              <WalrusMascot pose="salute" size={120} />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FooterRail({ formId }: { formId: string }) {
  return (
    <footer
      className="echo-section"
      style={{ background: "var(--echo-paper)" }}
    >
      <div
        className="echo-container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBlock: 24,
        }}
      >
        <Mono size={10} color="var(--echo-mut)">
          echo · form admin · {formId.slice(0, 10)}…
        </Mono>
        <div style={{ display: "flex", gap: 22 }}>
          <Link
            href="/dashboard"
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
              fontWeight: 500,
            }}
          >
            dashboard
          </Link>
          <Link
            href="/forms"
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
              fontWeight: 500,
            }}
          >
            my forms
          </Link>
          <Link
            href="/insights"
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
              fontWeight: 500,
            }}
          >
            insights
          </Link>
        </div>
      </div>
    </footer>
  );
}

function Floater() {
  return (
    <Link
      href="/dashboard"
      aria-label="back to dashboard"
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 30,
        border: "2px solid var(--echo-ink)",
        borderRadius: 999,
        width: 72,
        height: 72,
        background: "var(--echo-paper)",
        boxShadow: "var(--echo-brut-shadow)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
      className="ff-bobble"
    >
      <WalrusMascot pose="haulout" size={72} />
    </Link>
  );
}

export function EchoFormAdminShell({ formId }: { formId: string }) {
  return (
    <div className="echo-dashboard">
      <HeroShelf formId={formId} />
      <section
        className="echo-section"
        style={{ background: "var(--echo-paper-2)" }}
      >
        <div className="echo-container" style={{ paddingBlock: "32px 64px" }}>
          <div
            className="echo-card"
            style={{
              padding: "28px 32px",
              maxWidth: 1080,
              margin: "0 auto",
              background: "var(--echo-paper)",
            }}
          >
            <FormAdmin formId={formId} />
          </div>
        </div>
      </section>
      <FooterRail formId={formId} />
      <Floater />
    </div>
  );
}
