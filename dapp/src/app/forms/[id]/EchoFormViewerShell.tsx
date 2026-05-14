"use client";

/**
 * /forms/[id] — Echo redesign shell wrapping the public form viewer.
 *
 * The actual form rendering + submission flow stays inside the
 * existing FormViewer component (which handles schema parsing,
 * field types, sponsored submit, anonymous nullifiers, etc.). This
 * shell adds the Frame×MemWal×Sui visual language around it:
 *
 *   1. HeroShelf — form title (from on-chain metadata blob on Walrus),
 *      tier dot + tier name + k/n string, privacy badge, walrus
 *      mascot on aurora plate, mono meta row (object id, status).
 *   2. ViewerBody — the working FormViewer, embedded inside an
 *      `.echo-card` so the input surface visually belongs to the page.
 *   3. FooterRail — mono links back to dashboard/forms/insights.
 *   4. Floater — fixed walrus, scrolls to the form body.
 *
 * Real data: the form object is fetched on-chain (getObject with
 * include.json), then the metadata blob is read from Walrus via
 * readJsonViaAggregator. Both calls dedupe with FormViewer's
 * internal queries via shared queryKeys.
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
import { FormViewer } from "./FormViewerClient";

interface OnChainForm {
  metadata_blob_id: string;
  schema_blob_id: string;
  privacy_tier: number;
  status: number;
  submission_count?: string;
  threshold_n?: number;
  threshold_m?: number;
  unlock_ms?: string;
  owner?: string;
}

const TIER_NAMES = ["Public", "Admin only", "Threshold", "Time-locked", "Conditional"];
const TIER_COLORS = ["#0A0A0A", "#4DA2FF", "#A06EE9", "#6CD3D6", "#E8A540"];

function useFormShell(formId: string) {
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
        /* fall back to id title */
      }
      return { onChain, title, description };
    },
    staleTime: 60_000,
    enabled: formId.startsWith("0x"),
  });
}

function MonoLabel({
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

function TierBadge({ tier, k }: { tier: number; k?: string | null }) {
  const color = TIER_COLORS[tier] ?? "#0A0A0A";
  const name = TIER_NAMES[tier] ?? "Public";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 12px",
        border: "1px solid var(--echo-ink)",
        borderRadius: 999,
        background: "var(--echo-paper)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
          boxShadow: `0 0 0 3px ${color}26`,
        }}
      />
      <MonoLabel size={10} color="var(--echo-ink)">
        {name}
      </MonoLabel>
      {k && (
        <>
          <span style={{ color: "#D6D6D6" }}>·</span>
          <MonoLabel size={10} color="var(--echo-mut)">
            {k}
          </MonoLabel>
        </>
      )}
    </span>
  );
}

function HeroShelf({ formId }: { formId: string }) {
  const shell = useFormShell(formId);
  const data = shell.data;
  const tier = data?.onChain.privacy_tier ?? 0;
  const k = useMemo(() => {
    if (!data) return null;
    if (tier === PrivacyTier.Threshold) {
      const n = data.onChain.threshold_n ?? 0;
      const m = data.onChain.threshold_m ?? 0;
      if (n > 0 && m > 0) return `${n}/${m}`;
    }
    if (tier === PrivacyTier.TimeLocked && data.onChain.unlock_ms) {
      const ms = Number(data.onChain.unlock_ms);
      if (Number.isFinite(ms)) {
        const days = Math.max(
          0,
          Math.ceil((ms - Date.now()) / (24 * 60 * 60 * 1000)),
        );
        return days === 0 ? "unlocked" : `unlocks in ${days}d`;
      }
    }
    if (tier === PrivacyTier.AdminOnly) return "owner only";
    if (tier === PrivacyTier.Conditional) return "on-chain rule";
    return null;
  }, [data, tier]);

  const statusName =
    data?.onChain.status === 1
      ? "open"
      : data?.onChain.status === 2
        ? "closed"
        : "archived";

  return (
    <section className="echo-section" style={{ background: "var(--echo-paper)" }}>
      <div
        className="echo-container"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 40,
          alignItems: "center",
          paddingBlock: "48px 56px",
        }}
      >
        <div style={{ maxWidth: 720 }}>
          <MonoLabel size={11}>
            <span style={{ color: "var(--echo-ink)" }}>● live form</span>
            <span style={{ margin: "0 10px", color: "#D6D6D6" }}>·</span>
            Walrus-backed · Sui-anchored
          </MonoLabel>
          <motion.h1
            initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              letterSpacing: "-0.045em",
              fontSize: "clamp(38px, 5vw, 64px)",
              lineHeight: 1.02,
              margin: "16px 0 14px",
              color: "var(--echo-ink)",
              textWrap: "balance" as never,
            }}
          >
            {shell.isLoading ? "Loading form…" : data?.title ?? "(metadata unavailable)"}
          </motion.h1>
          {data?.description && (
            <p
              style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 16,
                lineHeight: 1.55,
                color: "var(--echo-mut)",
                maxWidth: 560,
                margin: "0 0 20px",
              }}
            >
              {data.description}
            </p>
          )}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            <TierBadge tier={tier} k={k} />
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "3px 8px",
                borderRadius: 999,
                background:
                  statusName === "open"
                    ? "var(--echo-success-bg)"
                    : "var(--echo-rail-2)",
                color:
                  statusName === "open"
                    ? "var(--echo-success)"
                    : "var(--echo-mut)",
              }}
            >
              {statusName}
            </span>
            {data && (
              <MonoLabel size={10} color="var(--echo-mut)">
                {Number(data.onChain.submission_count ?? 0).toLocaleString()}{" "}
                submissions
              </MonoLabel>
            )}
          </div>
          <MonoLabel size={9.5} color="var(--echo-mut-2)">
            object{" "}
            <code style={{ color: "var(--echo-ink)" }}>
              {formId.slice(0, 14)}…{formId.slice(-8)}
            </code>
          </MonoLabel>
        </div>
        <div
          style={{
            position: "relative",
            height: 260,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: "20px 0 20px 20px",
              borderRadius: "999px 999px 24px 24px",
              background:
                "radial-gradient(120% 80% at 70% 30%, #6FBCF0 0%, transparent 50%), radial-gradient(100% 100% at 20% 80%, #6CD3D6 0%, transparent 55%), radial-gradient(80% 100% at 90% 90%, #A06EE9 0%, transparent 60%), #FFFFFF",
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.0, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "relative",
              zIndex: 2,
              filter: "drop-shadow(0 24px 30px rgba(76,162,255,0.25))",
            }}
            className="ff-bobble"
          >
            <WalrusMascot pose="salute" size={210} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function FooterRail() {
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
        <MonoLabel size={10} color="var(--echo-mut)">
          echo · public form view
        </MonoLabel>
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

export function EchoFormViewerShell({ formId }: { formId: string }) {
  return (
    <div className="echo-dashboard">
      <HeroShelf formId={formId} />
      <section
        className="echo-section"
        style={{ background: "var(--echo-paper-2)" }}
      >
        <div
          className="echo-container"
          style={{ paddingBlock: "32px 64px" }}
        >
          <div
            className="echo-card"
            style={{
              padding: "28px 32px",
              maxWidth: 880,
              margin: "0 auto",
              background: "var(--echo-paper)",
            }}
          >
            <FormViewer formId={formId} />
          </div>
        </div>
      </section>
      <FooterRail />
      <Floater />
    </div>
  );
}
