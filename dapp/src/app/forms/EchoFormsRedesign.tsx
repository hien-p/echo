"use client";

/**
 * /forms — Echo redesign per `~/Downloads/web_memwal/forms.jsx`.
 *
 * Sister surface to /dashboard's EchoRedesign. Reuses the same
 * --echo-* tokens (in globals.css), the same on-chain query keys
 * (so TanStack dedupes vs the dashboard cache), and the same
 * Frame×MemWal×Sui language: white paper, hairline rails,
 * mono micro-text, walrus mascots, brutalist commit CTAs.
 *
 * Sections:
 *   1. HeroShelf      — "your forms." display + walrus face + "+3 this week" chip
 *   2. KpiStrip       — total forms · total subs · open now · bounty TVL
 *   3. FormsList      — status tabs + tier filter + sort, pinned form + 2-up grid
 *   4. BottomBand     — brutalist "publish a form in one transaction"
 *   5. FooterRail
 *   6. Floater        — fixed bottom-right back-to-dashboard walrus
 */

import Link from "next/link";
import * as React from "react";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { clientConfig } from "@/config/clientConfig";
import { readJsonViaAggregator, type FormMetadata } from "@/lib/echo";
import { WalrusMascot } from "@/components/general/FrameForms";
import { queryEventsByFormId } from "@/components/general/CrossFormDashboard";
import { useDemoAdminMode } from "@/components/general/DemoAdminToggle";

// ─────────────────────────────────────────────────────────────────
// On-chain data
// ─────────────────────────────────────────────────────────────────

interface OnChainForm {
  metadata_blob_id: string;
  privacy_tier: number;
  status: number;
  submission_count?: string;
  threshold_n?: number;
  threshold_m?: number;
  created_ms?: string;
  unlock_ms?: string;
}
interface OwnedCap {
  objectId: string;
  json: { form_id?: string };
}
interface FormCard {
  id: string;
  title: string;
  onChain: OnChainForm;
}

const TIER_NAMES = ["Public", "Admin", "Threshold", "Time-lock", "Cond."];
const TIER_PALETTE = [
  { name: "Public", color: "#0A0A0A" },
  { name: "Admin", color: "#4DA2FF" },
  { name: "Threshold", color: "#A06EE9" },
  { name: "Time-lock", color: "#6CD3D6" },
  { name: "Cond.", color: "#E8A540" },
];

function useFormsData() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;
  const demoMode = useDemoAdminMode();
  const demoAddress = clientConfig.DEMO_ADMIN_ADDRESS;
  const ownerAddress = demoMode ? demoAddress : account?.address;

  const formsQuery = useQuery({
    queryKey: ["echo", "dashboard-forms", ownerAddress, demoMode],
    queryFn: async (): Promise<FormCard[]> => {
      if (!ownerAddress) return [];
      const capType = `${packageId}::form::FormOwnerCap`;
      const owned = await suiClient.listOwnedObjects({
        owner: ownerAddress,
        type: capType,
        include: { json: true },
        limit: 200,
      });
      const caps = owned.objects as unknown as OwnedCap[];
      const formIds = Array.from(
        new Set(
          caps.map((c) => c.json?.form_id).filter((id): id is string => !!id),
        ),
      );
      if (formIds.length === 0) return [];
      const formObjs = await suiClient.getObjects({
        objectIds: formIds,
        include: { json: true },
      });
      const network = clientConfig.WALRUS_NETWORK;
      const items = await Promise.all(
        formObjs.objects.map(async (obj) => {
          const asUnknown = obj as unknown as Record<string, unknown>;
          if ("error" in asUnknown) return null;
          const fobj = obj as unknown as {
            objectId: string;
            json: OnChainForm;
          };
          let title = "(metadata unavailable)";
          try {
            const meta = await readJsonViaAggregator<FormMetadata>(
              fobj.json.metadata_blob_id,
              { network },
            );
            title = meta.title;
          } catch {
            /* keep fallback */
          }
          return { id: fobj.objectId, onChain: fobj.json, title };
        }),
      );
      return items.filter((x): x is FormCard => x !== null);
    },
    enabled: !!ownerAddress && packageId.startsWith("0x"),
    staleTime: 30_000,
  });

  const forms = useMemo(() => formsQuery.data ?? [], [formsQuery.data]);
  const formIdsKey = forms.map((f) => f.id).join(",");

  // Submissions across every form — same query key as dashboard so the
  // cache is shared. We don't need full SubmissionRef objects here, just
  // counts per form + a 15-day sparkline.
  const submissionsQuery = useQuery({
    queryKey: ["echo", "dashboard-submissions", formIdsKey],
    queryFn: async () => {
      if (forms.length === 0)
        return [] as Array<{ formId: string; submittedAtMs: number }>;
      const eventType = `${packageId}::submission::SubmissionMade`;
      const fullnodeUrl = clientConfig.SUI_FULLNODE_URL;
      const perForm = await Promise.all(
        forms.map(async (form) => {
          const events = await queryEventsByFormId(
            fullnodeUrl,
            eventType,
            form.id,
          );
          if (events.length === 0) return [];
          // Try to enrich with submitted_ms via SubmissionRef getObjects
          const subObjs = await suiClient.getObjects({
            objectIds: events.map((e) => e.submission_id),
            include: { json: true },
          });
          const tsById = new Map<string, number>();
          for (const obj of subObjs.objects as unknown as Array<{
            objectId: string;
            json?: { submitted_ms?: string };
          }>) {
            if (obj.json?.submitted_ms)
              tsById.set(obj.objectId, Number(obj.json.submitted_ms));
          }
          return events.map((e) => ({
            formId: form.id,
            submittedAtMs: tsById.get(e.submission_id) ?? Date.now(),
          }));
        }),
      );
      return perForm.flat();
    },
    enabled: forms.length > 0,
    staleTime: 15_000,
  });

  return useMemo(() => {
    const subs = submissionsQuery.data ?? [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const countsByForm = new Map<string, number>();
    for (const s of subs) {
      countsByForm.set(s.formId, (countsByForm.get(s.formId) ?? 0) + 1);
    }

    // Per-form 15-day sparkline buckets
    const spark15ByForm = new Map<string, number[]>();
    const buckets = 15;
    const start = now - buckets * dayMs;
    for (const form of forms) {
      const arr = new Array(buckets).fill(0) as number[];
      for (const s of subs.filter((x) => x.formId === form.id)) {
        if (s.submittedAtMs < start || s.submittedAtMs > now) continue;
        const idx = Math.min(
          buckets - 1,
          Math.floor((s.submittedAtMs - start) / dayMs),
        );
        arr[idx]!++;
      }
      spark15ByForm.set(form.id, arr);
    }

    // KPIs
    const totalSubs = subs.length;
    const openForms = forms.filter((f) => f.onChain.status === 1).length;
    const closedForms = forms.filter((f) => f.onChain.status === 2).length;
    const draftForms = 0;
    const subs7dThis = subs.filter(
      (s) => s.submittedAtMs > now - 7 * dayMs,
    ).length;
    const subs7dLast = subs.filter(
      (s) =>
        s.submittedAtMs <= now - 7 * dayMs &&
        s.submittedAtMs > now - 14 * dayMs,
    ).length;
    const subsDelta = subs7dThis - subs7dLast;

    // Mapped form rows with derived stats
    const rows = forms.map((f) => {
      const counts =
        countsByForm.get(f.id) ?? Number(f.onChain.submission_count ?? 0);
      const spark = spark15ByForm.get(f.id) ?? new Array(buckets).fill(0);
      const formSubs = subs.filter((x) => x.formId === f.id);
      const latest = formSubs.length
        ? Math.max(...formSubs.map((s) => s.submittedAtMs))
        : null;
      const createdAt = f.onChain.created_ms
        ? Number(f.onChain.created_ms)
        : null;
      return {
        id: f.id,
        title: f.title,
        tier: f.onChain.privacy_tier,
        tierName: TIER_NAMES[f.onChain.privacy_tier] ?? "Public",
        k:
          f.onChain.privacy_tier === 2 &&
          f.onChain.threshold_n &&
          f.onChain.threshold_m
            ? `${f.onChain.threshold_n}/${f.onChain.threshold_m}`
            : f.onChain.privacy_tier === 3
              ? "time-lock"
              : f.onChain.privacy_tier === 1
                ? "owner only"
                : null,
        status: (f.onChain.status === 1
          ? "open"
          : f.onChain.status === 2
            ? "closed"
            : "draft") as "open" | "closed" | "draft",
        subs: counts,
        created: createdAt ? humanAgo(now - createdAt) + " ago" : "—",
        lastSub: latest ? humanAgo(now - latest) + " ago" : null,
        spark,
      };
    });

    // Sort: most subs first by default for pinning
    const sortedBySubs = [...rows].sort((a, b) => b.subs - a.subs);
    const pinnedId = sortedBySubs[0]?.id ?? null;

    return {
      ownerAddress: ownerAddress ?? null,
      demoMode,
      isLoading: formsQuery.isLoading || submissionsQuery.isLoading,
      forms: rows,
      pinnedId,
      kpis: {
        totalForms: forms.length,
        totalSubmissions: totalSubs,
        openForms,
        closedForms,
        draftForms,
        bountySui: 0,
        subsDelta,
      },
    };
  }, [
    forms,
    submissionsQuery.data,
    formsQuery.isLoading,
    submissionsQuery.isLoading,
    ownerAddress,
    demoMode,
  ]);
}

type FormsData = ReturnType<typeof useFormsData>;
type FormRow = FormsData["forms"][number];

function humanAgo(ms: number): string {
  if (ms < 0) return "now";
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

// Fallback for the design-spec look before a wallet is connected.
const FALLBACK_ROWS: FormRow[] = [
  {
    id: "0x4d7c9a…1f2a",
    title: "Devnet hackathon · onboarding",
    tier: 2,
    tierName: "Threshold",
    k: "2/3",
    status: "open",
    subs: 128,
    created: "2w ago",
    lastSub: "3m ago",
    spark: [3, 5, 8, 4, 11, 9, 7, 14, 6, 12, 18, 15, 21, 24, 28],
  },
  {
    id: "0x2b81c4…ee3d",
    title: "Public bug bounty · Q2",
    tier: 0,
    tierName: "Public",
    k: null,
    status: "open",
    subs: 84,
    created: "1mo ago",
    lastSub: "11m ago",
    spark: [12, 4, 9, 6, 11, 15, 8, 13, 7, 10, 14, 6, 11, 9, 12],
  },
  {
    id: "0x3a02fe…44ab",
    title: "Validator pulse · May",
    tier: 3,
    tierName: "Time-lock",
    k: "unlocks 14:00",
    status: "open",
    subs: 62,
    created: "3w ago",
    lastSub: "22m ago",
    spark: [2, 3, 5, 4, 7, 6, 8, 9, 11, 8, 10, 7, 12, 14, 11],
  },
  {
    id: "0x4d12ab…aa44",
    title: "Customer NPS · April cohort",
    tier: 1,
    tierName: "Admin",
    k: "owner only",
    status: "open",
    subs: 41,
    created: "1mo ago",
    lastSub: "38m ago",
    spark: [4, 2, 5, 3, 6, 4, 5, 7, 6, 8, 5, 7, 9, 8, 6],
  },
];

const FALLBACK: FormsData = {
  ownerAddress: null,
  demoMode: false,
  isLoading: false,
  forms: FALLBACK_ROWS,
  pinnedId: FALLBACK_ROWS[0]?.id ?? null,
  kpis: {
    totalForms: 18,
    totalSubmissions: 1247,
    openForms: 12,
    closedForms: 2,
    draftForms: 2,
    bountySui: 412.5,
    subsDelta: 56,
  },
};

const Ctx = React.createContext<FormsData>(FALLBACK);
const useFormsCtx = () => React.useContext(Ctx);

// ─────────────────────────────────────────────────────────────────
// Primitives (copy from EchoRedesign for self-contained surface)
// ─────────────────────────────────────────────────────────────────

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

function BrutalistInk({
  children,
  href,
  size = "md",
  variant = "ink",
  aurora = false,
  onClick,
}: {
  children: React.ReactNode;
  href?: string;
  size?: "sm" | "md" | "lg";
  variant?: "ink" | "paper";
  aurora?: boolean;
  onClick?: () => void;
}) {
  const pads =
    size === "sm" ? "8px 14px" : size === "lg" ? "16px 24px" : "12px 18px";
  const fontSize = size === "sm" ? 11 : size === "lg" ? 13 : 12;
  const bg = aurora
    ? "var(--echo-aurora-plate)"
    : variant === "ink"
      ? "#0A0A0A"
      : "#FFFFFF";
  const fg = variant === "ink" ? "#FAF8F5" : "#0A0A0A";
  const style = { padding: pads, background: bg, color: fg, fontSize };
  if (href) {
    return (
      <Link href={href} onClick={onClick} className="echo-brut" style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className="echo-brut" style={style}>
      {children}
    </button>
  );
}

function FramePill({
  children,
  active,
  count,
  dotColor,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  count?: number;
  dotColor?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active ? "true" : "false"}
      className="echo-pill"
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          background: active
            ? "var(--echo-paper)"
            : (dotColor ?? "var(--echo-ink)"),
          display: "inline-block",
        }}
      />
      {children}
      {count !== undefined && (
        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontVariantNumeric: "tabular-nums",
            fontSize: 10,
            padding: "2px 6px",
            background: active
              ? "rgba(255,255,255,0.18)"
              : "var(--echo-rail-2)",
            color: active ? "var(--echo-paper)" : "var(--echo-ink)",
            borderRadius: 999,
            letterSpacing: 0,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function TierDot({ tierIdx, size = 10 }: { tierIdx: number; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: TIER_PALETTE[tierIdx]?.color ?? "var(--echo-ink)",
        borderRadius: 999,
        display: "inline-block",
        boxShadow: `0 0 0 3px ${TIER_PALETTE[tierIdx]?.color ?? "#000"}26`,
      }}
    />
  );
}

function KpiNumber({
  value,
  decimals = 0,
  suffix,
  size = "lg",
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  size?: "md" | "lg";
}) {
  const fontSize =
    size === "lg" ? "clamp(56px, 6vw, 88px)" : "clamp(40px, 4.5vw, 64px)";
  const formatted =
    decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString();
  return (
    <span className="echo-kpi-num" style={{ fontSize }}>
      {formatted}
      {suffix && (
        <span
          style={{
            marginLeft: 6,
            fontSize: "0.34em",
            letterSpacing: "0.06em",
            fontFamily: "JetBrains Mono, monospace",
            fontWeight: 500,
            color: "var(--echo-mut)",
            textTransform: "uppercase",
          }}
        >
          {suffix}
        </span>
      )}
    </span>
  );
}

function DeltaChip({ value }: { value: number }) {
  const up = value > 0;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.06em",
        padding: "3px 8px",
        borderRadius: 999,
        fontVariantNumeric: "tabular-nums",
        background: up ? "var(--echo-success-bg)" : "#FEE2E2",
        color: up ? "var(--echo-success)" : "var(--echo-danger)",
      }}
    >
      {up ? "▲" : "▼"} {Math.abs(value)}
    </span>
  );
}

function Sparkline({
  data,
  height = 64,
  accent = "#0A0A0A",
  fillFrom = "#4DA2FF",
}: {
  data: number[];
  height?: number;
  accent?: string;
  fillFrom?: string;
}) {
  const w = 100;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = Math.max(max - min, 1);
  const step = w / Math.max(data.length - 1, 1);
  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const area = `0,${height} ${points} ${w},${height}`;
  const gid = `forms-spark-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillFrom} stopOpacity="0.25" />
          <stop offset="100%" stopColor={fillFrom} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline
        points={points}
        fill="none"
        stroke={accent}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatusTag({ status }: { status: "open" | "closed" | "draft" }) {
  const cfg = {
    open: { bg: "var(--echo-success-bg)", color: "var(--echo-success)" },
    closed: { bg: "var(--echo-rail-2)", color: "var(--echo-mut)" },
    draft: { bg: "#FEF3C7", color: "var(--echo-warn)" },
  }[status];
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
      {status}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────

function HeroShelf() {
  const data = useFormsCtx();
  return (
    <section
      className="echo-section"
      style={{ background: "var(--echo-paper)" }}
    >
      <div
        className="echo-container"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 480px",
          gap: 48,
          alignItems: "center",
          paddingBlock: "56px 64px",
        }}
      >
        <div style={{ maxWidth: 620 }}>
          <MonoLabel size={11}>
            <span style={{ color: "var(--echo-ink)" }}>
              ● {data.kpis.totalForms} forms
            </span>
            <span style={{ margin: "0 10px", color: "#D6D6D6" }}>·</span>
            FormOwnerCap · on-chain
          </MonoLabel>
          <motion.h1
            initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="echo-display"
            style={{ fontSize: "clamp(72px, 10vw, 144px)" }}
          >
            <span>your forms</span>
            <span
              style={{
                color: "var(--echo-sui-violet)",
                fontSize: "0.6em",
                marginLeft: 6,
                lineHeight: 0.9,
                position: "relative",
                top: 6,
              }}
            >
              .
            </span>
          </motion.h1>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 18,
              lineHeight: 1.5,
              color: "var(--echo-mut)",
              maxWidth: 480,
              margin: "0 0 28px",
            }}
          >
            Every form you hold a FormOwnerCap for.
            <br />
            Click any to open its admin view.
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              marginBottom: 24,
            }}
          >
            <BrutalistInk size="lg" href="/forms/new">
              + create form
            </BrutalistInk>
            <Link
              href="#list"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--echo-mut)",
                fontWeight: 500,
                padding: "6px 0",
                borderBottom: "1px solid var(--echo-rail)",
              }}
            >
              jump to list <span>↓</span>
            </Link>
          </div>
        </div>
        <div
          style={{
            position: "relative",
            height: 380,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: "30px 0 30px 30px",
              borderRadius: "999px 999px 24px 24px",
              background:
                "radial-gradient(120% 80% at 70% 30%, #6FBCF0 0%, transparent 50%), radial-gradient(100% 100% at 20% 80%, #6CD3D6 0%, transparent 55%), radial-gradient(80% 100% at 90% 90%, #A06EE9 0%, transparent 60%), #FFFFFF",
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.0, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "relative",
              zIndex: 2,
              filter: "drop-shadow(0 24px 30px rgba(76,162,255,0.25))",
            }}
            className="ff-bobble"
          >
            <WalrusMascot pose="salute" size={280} />
          </motion.div>
          <div
            style={{
              position: "absolute",
              top: 30,
              right: 0,
              background: "var(--echo-paper)",
              border: "2px solid var(--echo-ink)",
              borderRadius: 10,
              boxShadow: "var(--echo-brut-shadow-sm)",
              padding: "8px 12px",
              zIndex: 3,
            }}
          >
            <MonoLabel size={9} color="var(--echo-ink)">
              +3 this week
            </MonoLabel>
          </div>
        </div>
      </div>
    </section>
  );
}

function KpiStrip() {
  const data = useFormsCtx();
  const { kpis, forms } = data;
  const aggregateSpark = useMemo(() => {
    if (forms.length === 0) return new Array(15).fill(0) as number[];
    const len = forms[0]!.spark.length;
    const out = new Array(len).fill(0) as number[];
    for (const f of forms) {
      for (let i = 0; i < len; i++) {
        out[i] = (out[i] ?? 0) + (f.spark[i] ?? 0);
      }
    }
    return out;
  }, [forms]);
  return (
    <section
      className="echo-section"
      style={{ background: "var(--echo-paper)" }}
    >
      <div
        className="echo-container"
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        <KpiTile
          label="Total forms"
          value={kpis.totalForms}
          sub={`${kpis.draftForms} drafts · ${kpis.openForms} open`}
        />
        <KpiTile
          label="Total submissions"
          value={kpis.totalSubmissions}
          delta={kpis.subsDelta}
          sub="across every form"
          spark={aggregateSpark}
        />
        <KpiTile
          label="Open now"
          value={kpis.openForms}
          sub="accepting submissions"
        />
        <KpiTile
          label="Bounty TVL"
          value={kpis.bountySui}
          decimals={2}
          suffix=" SUI"
          sub="staked across forms"
        />
      </div>
    </section>
  );
}

function KpiTile({
  label,
  value,
  decimals,
  suffix,
  delta,
  sub,
  spark,
}: {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  delta?: number;
  sub: string;
  spark?: number[];
}) {
  return (
    <div
      style={{
        padding: "36px 32px 32px",
        borderRight: "1px solid var(--echo-rail)",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        minHeight: 220,
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <MonoLabel size={11}>{label}</MonoLabel>
        {delta !== undefined && delta !== 0 && <DeltaChip value={delta} />}
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "flex-end" }}>
        <KpiNumber value={value} decimals={decimals} suffix={suffix} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <MonoLabel size={9.5} color="var(--echo-mut)">
          {sub}
        </MonoLabel>
        {spark && (
          <span style={{ width: 80 }}>
            <Sparkline
              data={spark}
              height={22}
              accent="#0A0A0A"
              fillFrom="#0A0A0A"
            />
          </span>
        )}
      </div>
    </div>
  );
}

function FormsList() {
  const data = useFormsCtx();
  const [status, setStatus] = useState<"all" | "open" | "closed" | "draft">(
    "all",
  );
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"recent" | "subs">("recent");

  let list = data.forms;
  if (status !== "all") list = list.filter((f) => f.status === status);
  if (tierFilter !== "all")
    list = list.filter((f) => f.tierName.toLowerCase() === tierFilter);
  if (sortBy === "subs") list = [...list].sort((a, b) => b.subs - a.subs);

  const pinned = list.find((f) => f.id === data.pinnedId) ?? null;
  const rest = pinned ? list.filter((f) => f.id !== pinned.id) : list;

  const statusCounts = {
    all: data.forms.length,
    open: data.forms.filter((f) => f.status === "open").length,
    closed: data.forms.filter((f) => f.status === "closed").length,
    draft: data.forms.filter((f) => f.status === "draft").length,
  };

  return (
    <section className="echo-section" id="list">
      <div className="echo-container" style={{ paddingBlock: "48px 64px" }}>
        <header
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 32,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <MonoLabel>
              your forms · {list.length} of {data.forms.length}
            </MonoLabel>
            <h2
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                letterSpacing: "-0.045em",
                fontSize: "clamp(40px, 5vw, 64px)",
                lineHeight: 1,
                margin: "10px 0 8px",
              }}
            >
              the catalog.
            </h2>
            <p
              style={{
                margin: 0,
                color: "var(--echo-mut)",
                fontSize: 14,
                maxWidth: 460,
              }}
            >
              Click any form to open its admin view. Drafts publish in one
              transaction.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              alignItems: "flex-end",
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <FramePill
                active={status === "all"}
                onClick={() => setStatus("all")}
                count={statusCounts.all}
              >
                all
              </FramePill>
              <FramePill
                active={status === "open"}
                onClick={() => setStatus("open")}
                count={statusCounts.open}
                dotColor="#22C55E"
              >
                open
              </FramePill>
              <FramePill
                active={status === "closed"}
                onClick={() => setStatus("closed")}
                count={statusCounts.closed}
                dotColor="#A8A8A8"
              >
                closed
              </FramePill>
              <FramePill
                active={status === "draft"}
                onClick={() => setStatus("draft")}
                count={statusCounts.draft}
                dotColor="#E8A540"
              >
                drafts
              </FramePill>
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <MonoLabel size={9} color="var(--echo-mut)">
                tier
              </MonoLabel>
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="echo-select"
              >
                <option value="all">all tiers</option>
                <option value="public">public</option>
                <option value="admin">admin</option>
                <option value="threshold">threshold</option>
                <option value="time-lock">time-lock</option>
                <option value="cond.">conditional</option>
              </select>
              <MonoLabel size={9} color="var(--echo-mut)">
                sort
              </MonoLabel>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "recent" | "subs")}
                className="echo-select"
              >
                <option value="recent">recent</option>
                <option value="subs">most subs</option>
              </select>
            </div>
          </div>
        </header>

        {list.length === 0 ? (
          <div
            className="echo-card"
            style={{
              padding: 32,
              display: "flex",
              alignItems: "center",
              gap: 24,
            }}
          >
            <WalrusMascot pose="haulout" size={160} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <h4
                style={{
                  margin: 0,
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 500,
                  fontSize: 24,
                  letterSpacing: "-0.025em",
                }}
              >
                nothing here yet.
              </h4>
              <p style={{ margin: 0, color: "var(--echo-mut)" }}>
                No forms match those filters. Try a different combination — or
                create one.
              </p>
              <BrutalistInk href="/forms/new">+ create form</BrutalistInk>
            </div>
          </div>
        ) : (
          <>
            {pinned && <PinnedFormCard form={pinned} />}
            <div
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
                gap: 16,
              }}
            >
              {rest.map((f, idx) => (
                <FormCardTile key={f.id} form={f} delay={idx * 0.04} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function PinnedFormCard({ form }: { form: FormRow }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="echo-card"
      style={{ padding: 24, borderColor: "var(--echo-ink)", borderWidth: 2 }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              padding: "3px 10px",
              background: "var(--echo-ink)",
              color: "var(--echo-paper)",
              borderRadius: 999,
            }}
          >
            ★ top
          </span>
          <TierDot tierIdx={form.tier} />
          <MonoLabel size={10}>
            {form.tierName} {form.k ? `· ${form.k}` : ""}
          </MonoLabel>
          <span style={{ color: "#D6D6D6" }}>·</span>
          <StatusTag status={form.status} />
        </div>
        <Link
          href={`/forms/${form.id}/admin`}
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--echo-ink)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            border: "1px solid var(--echo-rail)",
            borderRadius: 999,
            fontWeight: 500,
          }}
        >
          open admin <span>→</span>
        </Link>
      </header>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: 32,
          alignItems: "end",
        }}
      >
        <div>
          <h3
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              letterSpacing: "-0.04em",
              fontSize: 38,
              lineHeight: 1.02,
              margin: "0 0 6px",
            }}
          >
            {form.title}
          </h3>
          <p style={{ margin: 0, color: "var(--echo-mut)", fontSize: 13 }}>
            created {form.created} · last submission{" "}
            <strong style={{ color: "var(--echo-ink)" }}>
              {form.lastSub ?? "—"}
            </strong>
          </p>
          <div
            style={{
              marginTop: 20,
              display: "flex",
              alignItems: "baseline",
              gap: 32,
            }}
          >
            <div>
              <KpiNumber value={form.subs} size="md" />
              <div style={{ marginTop: 4 }}>
                <MonoLabel size={10} color="var(--echo-mut)">
                  submissions
                </MonoLabel>
              </div>
            </div>
            <div>
              <code
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 13,
                  color: "var(--echo-ink)",
                  letterSpacing: 0,
                }}
              >
                {form.id.length > 24
                  ? `${form.id.slice(0, 10)}…${form.id.slice(-6)}`
                  : form.id}
              </code>
              <div style={{ marginTop: 4 }}>
                <MonoLabel size={10} color="var(--echo-mut)">
                  object id
                </MonoLabel>
              </div>
            </div>
          </div>
        </div>
        <div>
          <MonoLabel size={9} color="var(--echo-mut)">
            submissions · last 15 days
          </MonoLabel>
          <div style={{ marginTop: 6 }}>
            <Sparkline
              data={form.spark}
              height={88}
              accent="#0A0A0A"
              fillFrom={TIER_PALETTE[form.tier]?.color ?? "#0A0A0A"}
            />
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function FormCardTile({ form, delay = 0 }: { form: FormRow; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/forms/${form.id}/admin`}
        className="echo-card"
        style={{
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <TierDot tierIdx={form.tier} size={8} />
            <MonoLabel size={10}>{form.tierName}</MonoLabel>
          </div>
          <StatusTag status={form.status} />
        </header>
        <h3
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            fontSize: 17,
            letterSpacing: "-0.02em",
            margin: 0,
            lineHeight: 1.25,
            color: "var(--echo-ink)",
          }}
        >
          {form.title}
        </h3>
        <div>
          <Sparkline
            data={form.spark}
            height={52}
            accent="#0A0A0A"
            fillFrom={TIER_PALETTE[form.tier]?.color ?? "#0A0A0A"}
          />
        </div>
        <footer
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}
          >
            <span
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 600,
                fontSize: 22,
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {form.subs.toLocaleString()}
            </span>
            <MonoLabel size={9} color="var(--echo-mut)">
              subs
            </MonoLabel>
          </div>
          <MonoLabel size={9} color="var(--echo-mut)">
            {form.lastSub ? `last · ${form.lastSub}` : "no subs yet"}
          </MonoLabel>
        </footer>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 6,
            borderTop: "1px solid var(--echo-rail)",
          }}
        >
          <MonoLabel size={9} color="var(--echo-mut-2)">
            {form.id.length > 22
              ? `${form.id.slice(0, 10)}…${form.id.slice(-6)}`
              : form.id}
          </MonoLabel>
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--echo-ink)",
              fontWeight: 600,
            }}
          >
            open →
          </span>
        </div>
      </Link>
    </motion.div>
  );
}

function BottomBand() {
  return (
    <section
      className="echo-section"
      style={{ background: "var(--echo-paper)" }}
    >
      <div className="echo-container" style={{ paddingBlock: 56 }}>
        <div
          className="echo-card"
          style={{
            position: "relative",
            border: "2px solid var(--echo-ink)",
            borderRadius: 18,
            boxShadow: "var(--echo-brut-shadow)",
            overflow: "hidden",
            padding: 0,
          }}
        >
          <div
            style={{
              height: 6,
              background: "var(--echo-aurora-plate)",
            }}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 280px",
              gap: 32,
              alignItems: "end",
              padding: "28px 32px 32px",
            }}
          >
            <div>
              <MonoLabel>+ new form</MonoLabel>
              <h3
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 500,
                  letterSpacing: "-0.03em",
                  fontSize: 26,
                  lineHeight: 1.05,
                  margin: "8px 0",
                }}
              >
                publish a form in{" "}
                <span style={{ color: "var(--echo-mut)" }}>
                  one transaction.
                </span>
              </h3>
              <p
                style={{
                  margin: "8px 0 20px",
                  color: "var(--echo-mut)",
                  fontSize: 14,
                  maxWidth: 460,
                }}
              >
                Drag-drop builder · 5 privacy tiers · gas-sponsored submissions.
                Your wallet signs once. The object lives on chain.
              </p>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <BrutalistInk href="/forms/new">create form</BrutalistInk>
                <BrutalistInk variant="paper" href="/forms/new">
                  browse templates
                </BrutalistInk>
              </div>
            </div>
            <div
              className="ff-bobble"
              style={{
                marginRight: -24,
                marginBottom: -32,
                alignSelf: "end",
                justifySelf: "end",
              }}
            >
              <WalrusMascot pose="peace" size={240} />
            </div>
          </div>
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
          echo · forms on sui
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
          <Link
            href="/logs"
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
              fontWeight: 500,
            }}
          >
            devlog
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
      <WalrusMascot pose="monogram" size={72} />
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────

export function EchoFormsRedesign() {
  const live = useFormsData();
  const data: FormsData =
    live.ownerAddress && (live.forms.length > 0 || !live.isLoading)
      ? live
      : FALLBACK;
  return (
    <Ctx.Provider value={data}>
      <div className="echo-dashboard">
        <HeroShelf />
        <KpiStrip />
        <FormsList />
        <BottomBand />
        <FooterRail />
        <Floater />
      </div>
    </Ctx.Provider>
  );
}
