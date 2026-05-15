"use client";

/**
 * /dashboard — Echo redesign per Claude Design handoff.
 *
 * Source: ~/Downloads (Claude Design bundle `website-memwal/`).
 * The user pulled the trigger explicitly ("design the /dashboard to me
 * i hate the current view"), so this composition replaces the prior
 * DashboardHero / BentoDashboard / CrossFormDashboard / DashboardKpiStrip
 * chain. The previous "hero locked" memory is intentionally overridden
 * for this redesign.
 *
 * Surfaces (top to bottom):
 *   1. NavRail        — brand + nav + wallet pill
 *   2. HeroShelf      — "triage." display + walrus on aurora plate
 *   3. KpiStrip       — 4 huge magazine numbers, vertical hairlines
 *   4. TriageSection  — promoted above the bento; 2/3 + 1/3 layout
 *                        with ask-RAG rail + privacy mix + top forms
 *   5. ThirtyStrip    — restrained 30-day sparkline band
 *   6. BottomBand     — brutalist "drop a question" + reputation card
 *   7. FooterRail     — Frame footer
 *   8. Floater        — fixed walrus, scrolls back to triage
 *
 * Data: this first pass uses static mock data verbatim from the
 * handoff so the visual lands first. A follow-up commit will wire
 * the existing TanStack queries (forms, submissions, KPIs, sparkline)
 * to the same shapes — every property below has a corresponding hook
 * in BentoDashboard / CrossFormDashboard / DashboardKpiStrip.
 */

import Link from "next/link";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { clientConfig } from "@/config/clientConfig";
import { readJsonViaAggregator, type FormMetadata } from "@/lib/echo";
import { WalrusMascot } from "@/components/general/FrameForms";
import { EchoNavRail } from "@/components/general/EchoNavRail";
import { queryEventsByFormId } from "@/components/general/CrossFormDashboard";
import { useDemoAdminMode } from "@/components/general/DemoAdminToggle";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Real-data hooks — share TanStack query cache with the prior
// dashboard chain (CrossFormDashboard / DashboardKpiStrip) so the
// new surface doesn't fetch twice. Query keys are kept identical
// to those components for dedupe.
// ─────────────────────────────────────────────────────────────────

interface OnChainForm {
  metadata_blob_id: string;
  privacy_tier: number;
  status: number;
  submission_count?: string;
  threshold_n?: number;
  threshold_m?: number;
}
interface OwnedCap {
  objectId: string;
  json: { form_id?: string };
}
interface SubmissionRefJson {
  payload_blob_id: string;
  submitted_ms: string;
  submitter: string;
  commitment: number[];
}
interface FormCard {
  id: string;
  title: string;
  onChain: OnChainForm;
}
// Triage row shape — declared at file scope so the hook return and the
// FALLBACK_RAW constant can both be typed against the same wide union.
// Without this, TS infers narrow per-row literal types from FALLBACK_RAW
// (status: "flagged" | "new" | "read" only, submitterNs: null on rows
// where the value is null) which collides with the hook's wider derived
// rows (status can take any of the 4 values; submitterNs: string | null).
type TriageStatus = "new" | "read" | "flagged" | "archived";
interface TriageRowData {
  id: string;
  // Optional on the type so fallback demo rows (which never had a real
  // on-chain form id) don't need to fabricate one. The hook always
  // populates this for live rows; the row UI falls back to /forms when
  // it's missing.
  formId?: string | null;
  form: string;
  submitter: string;
  submitterNs: string | null;
  ago: string;
  tier: string;
  status: TriageStatus;
  encrypted: boolean;
  k: string | null;
  note: string;
}

interface SubmissionRow {
  formId: string;
  formTitle: string;
  formTier: number;
  submissionId: string;
  submitter: string;
  anonymous: boolean;
  submittedAt: string;
  payloadBlobId: string;
  encrypted: boolean;
}

function useEchoDashboardData() {
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

  const submissionsQuery = useQuery({
    queryKey: ["echo", "dashboard-submissions", formIdsKey],
    queryFn: async (): Promise<SubmissionRow[]> => {
      if (forms.length === 0) return [];
      const eventType = `${packageId}::submission::SubmissionMade`;
      const fullnodeUrl = clientConfig.SUI_FULLNODE_URL;
      const perForm = await Promise.all(
        forms.map(async (form) => {
          const events = await queryEventsByFormId(
            fullnodeUrl,
            eventType,
            form.id,
          );
          if (events.length === 0) return [] as SubmissionRow[];
          const subObjs = await suiClient.getObjects({
            objectIds: events.map((e) => e.submission_id),
            include: { json: true },
          });
          const byId = new Map<string, SubmissionRefJson>();
          for (const obj of subObjs.objects as unknown as Array<{
            objectId: string;
            json?: SubmissionRefJson;
          }>) {
            if (obj.json) byId.set(obj.objectId, obj.json);
          }
          return events.map((e): SubmissionRow => {
            const ref = byId.get(e.submission_id);
            return {
              formId: form.id,
              formTitle: form.title,
              formTier: form.onChain.privacy_tier,
              submissionId: e.submission_id,
              submitter: e.submitter,
              anonymous: e.anonymous,
              submittedAt: ref
                ? new Date(Number(ref.submitted_ms)).toISOString()
                : "(unknown)",
              payloadBlobId: ref?.payload_blob_id ?? "",
              encrypted: form.onChain.privacy_tier !== 0,
            };
          });
        }),
      );
      const flat = perForm.flat();
      flat.sort(
        (a, b) =>
          (Date.parse(b.submittedAt) || 0) - (Date.parse(a.submittedAt) || 0),
      );
      return flat;
    },
    enabled: forms.length > 0,
    staleTime: 15_000,
  });

  const submissions = useMemo(
    () => submissionsQuery.data ?? [],
    [submissionsQuery.data],
  );

  // ─── Derive everything the redesign needs ───
  return useMemo(() => {
    // 24h delta
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const subs24h = submissions.filter(
      (s) => Date.parse(s.submittedAt) > now - dayMs,
    ).length;
    const subs48h = submissions.filter((s) => {
      const t = Date.parse(s.submittedAt);
      return t > now - 2 * dayMs && t <= now - dayMs;
    }).length;
    const delta24h = subs24h - subs48h;

    const openForms = forms.filter((f) => f.onChain.status === 1).length;
    const totalForms = forms.length;
    const awaitingDecrypt = submissions.filter(
      (s) => s.encrypted && Date.parse(s.submittedAt) > now - 7 * dayMs,
    ).length;

    // 30-day sparkline (oldest first, last bucket = today)
    const buckets = 30;
    const sparkline = new Array(buckets).fill(0) as number[];
    const start = now - buckets * dayMs;
    for (const s of submissions) {
      const t = Date.parse(s.submittedAt);
      if (!Number.isFinite(t) || t < start || t > now) continue;
      const idx = Math.min(buckets - 1, Math.floor((t - start) / dayMs));
      sparkline[idx] = (sparkline[idx] ?? 0) + 1;
    }

    // Triage rows — map submissions newest-first, derive status per
    // 24h/7d/older heuristic. localStorage status from CrossFormDashboard
    // is intentionally NOT consulted here since this surface is new and
    // we want a fresh "new/read/flagged" view.
    const triage: TriageRowData[] = submissions
      .slice(0, 24)
      .map<TriageRowData>((s) => {
        const t = Date.parse(s.submittedAt);
        const ageMs = Number.isFinite(t) ? now - t : 0;
        const status: TriageStatus =
          ageMs < dayMs ? "new" : ageMs < 7 * dayMs ? "read" : "archived";
        const ago = humanAgo(ageMs);
        const tierName = TIER_NAMES[s.formTier] ?? "Public";
        return {
          id: s.submissionId,
          formId: s.formId,
          form: s.formTitle,
          submitter: s.anonymous ? "anon" : shortAddr(s.submitter),
          submitterNs: null as string | null,
          ago,
          tier: tierName,
          status,
          encrypted: s.encrypted,
          k:
            s.formTier === 2
              ? "2/3"
              : s.formTier === 3
                ? "time-lock"
                : s.formTier === 1
                  ? "owner only"
                  : null,
          note: "",
        };
      });

    // Tier counts (Public 0, Admin 1, Threshold 2, Time-lock 3, Cond 4)
    const tierCounts = [0, 0, 0, 0, 0];
    for (const f of forms) {
      const t = f.onChain.privacy_tier;
      if (t >= 0 && t < tierCounts.length) tierCounts[t]++;
    }

    // Top forms by on-chain submission_count
    const topForms = [...forms]
      .map((f) => ({
        id: f.id,
        title: f.title,
        subs: Number(f.onChain.submission_count ?? 0),
        tierIdx: f.onChain.privacy_tier,
      }))
      .sort((a, b) => b.subs - a.subs)
      .slice(0, 5);

    return {
      ownerAddress: ownerAddress ?? null,
      demoMode,
      isLoading: formsQuery.isLoading || submissionsQuery.isLoading,
      forms,
      submissions,
      kpis: {
        subs24h,
        delta24h,
        openForms,
        totalForms,
        bountySui: 0, // wire bounty totals in a follow-up
        pools: 0,
        awaitingDecrypt,
      },
      sparkline,
      triage,
      tierCounts,
      topForms,
    };
  }, [
    forms,
    submissions,
    formsQuery.isLoading,
    submissionsQuery.isLoading,
    ownerAddress,
    demoMode,
  ]);
}

const TIER_NAMES = ["Public", "Admin", "Threshold", "Time-lock", "Cond."];

function shortAddr(a: string): string {
  if (!a || a === "anon" || !a.startsWith("0x")) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function humanAgo(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

type DashboardData = ReturnType<typeof useEchoDashboardData>;

// Static fallback when wallet not connected — show the design with
// realistic-looking placeholder so the page never reads as broken.
const FALLBACK_RAW: {
  wallet: string;
  suins: string;
  kpis: DashboardData["kpis"];
  sparkline: number[];
  triage: TriageRowData[];
  topForms: DashboardData["topForms"];
  tierCounts: number[];
} = {
  wallet: "0x9c4f…ae12",
  suins: "memwal.sui",
  kpis: {
    subs24h: 247,
    delta24h: 38,
    openForms: 12,
    totalForms: 18,
    bountySui: 412.5,
    pools: 6,
    awaitingDecrypt: 3,
  },
  sparkline: [
    4, 6, 3, 8, 12, 9, 5, 7, 14, 11, 9, 13, 18, 15, 21, 17, 11, 9, 14, 22, 19,
    16, 24, 28, 31, 27, 22, 29, 34, 38,
  ],
  triage: [
    {
      id: "sub_0x4a91",
      form: "Devnet hackathon · onboarding",
      submitter: "0x812f…b03c",
      submitterNs: "alex.sui",
      ago: "3m",
      tier: "Threshold",
      status: "new" as const,
      encrypted: true,
      k: "2/3",
      note: "requires 2 of 3 admin approvals",
    },
    {
      id: "sub_0x4a8d",
      form: "Public bug bounty · Q2",
      submitter: "0xc70d…91ee",
      submitterNs: null,
      ago: "11m",
      tier: "Public",
      status: "new" as const,
      encrypted: false,
      k: null,
      note: "3rd-party scanner",
    },
    {
      id: "sub_0x4a89",
      form: "Validator pulse · May",
      submitter: "0x1133…4488",
      submitterNs: "validator.sui",
      ago: "22m",
      tier: "Time-lock",
      status: "new" as const,
      encrypted: true,
      k: "unlocks 14:00",
      note: "sealed until epoch +2",
    },
    {
      id: "sub_0x4a86",
      form: "Customer NPS · April cohort",
      submitter: "anon",
      submitterNs: null,
      ago: "38m",
      tier: "Admin",
      status: "new" as const,
      encrypted: true,
      k: "owner only",
      note: "anonymous",
    },
    {
      id: "sub_0x4a82",
      form: "Devnet hackathon · onboarding",
      submitter: "0x53f0…aa12",
      submitterNs: "hira.sui",
      ago: "1h",
      tier: "Threshold",
      status: "flagged" as const,
      encrypted: true,
      k: "2/3",
      note: "flagged — duplicate wallet",
    },
    {
      id: "sub_0x4a7e",
      form: "Conditional · seal beta",
      submitter: "0x9912…0f4d",
      submitterNs: null,
      ago: "1h",
      tier: "Cond.",
      status: "new" as const,
      encrypted: true,
      k: "on-chain rule",
      note: "unlocks if 10 votes",
    },
    {
      id: "sub_0x4a7c",
      form: "Public bug bounty · Q2",
      submitter: "0x77bb…ccdd",
      submitterNs: null,
      ago: "2h",
      tier: "Public",
      status: "read" as const,
      encrypted: false,
      k: null,
      note: "",
    },
    {
      id: "sub_0x4a77",
      form: "Validator pulse · May",
      submitter: "0xeeaa…1122",
      submitterNs: "node-7.sui",
      ago: "2h",
      tier: "Time-lock",
      status: "read" as const,
      encrypted: true,
      k: "unlocks 14:00",
      note: "",
    },
    {
      id: "sub_0x4a73",
      form: "Customer NPS · April cohort",
      submitter: "anon",
      submitterNs: null,
      ago: "3h",
      tier: "Admin",
      status: "read" as const,
      encrypted: true,
      k: "owner only",
      note: "",
    },
  ],
  topForms: [
    {
      id: "form_0x1c",
      title: "Devnet hackathon · onboarding",
      subs: 128,
      tierIdx: 2,
    },
    { id: "form_0x2b", title: "Public bug bounty · Q2", subs: 84, tierIdx: 0 },
    { id: "form_0x3a", title: "Validator pulse · May", subs: 62, tierIdx: 3 },
    {
      id: "form_0x4d",
      title: "Customer NPS · April cohort",
      subs: 41,
      tierIdx: 1,
    },
    { id: "form_0x5e", title: "Conditional · seal beta", subs: 22, tierIdx: 4 },
  ],
  tierCounts: [4, 3, 5, 3, 3],
};

// Shape compatible with both the hook output and FALLBACK_RAW so every
// section can read from a single `data` value.
const FALLBACK: DashboardData = {
  ownerAddress: null,
  demoMode: false,
  isLoading: false,
  forms: [],
  submissions: [],
  kpis: FALLBACK_RAW.kpis,
  sparkline: FALLBACK_RAW.sparkline,
  // FALLBACK_RAW.triage carries the wider TriageStatus (includes "flagged")
  // while the hook's inferred return narrows to the subset its branches
  // actually emit. Cast through unknown so the fallback can include the
  // demo "flagged" row without forcing the hook to fabricate a flagged
  // branch it doesn't need.
  triage: FALLBACK_RAW.triage as unknown as DashboardData["triage"],
  tierCounts: FALLBACK_RAW.tierCounts,
  topForms: FALLBACK_RAW.topForms,
};

// TriageRowData is declared at the top of the file so the hook return
// and the FALLBACK constant share the same wide shape.

// Context for prop-drilling-free section access. Always populated by the
// root component (either live hook output or FALLBACK).
const DashboardContext = React.createContext<DashboardData>(FALLBACK);
const useDashboard = () => React.useContext(DashboardContext);

const TIER_PALETTE = [
  { name: "Public", color: "#0A0A0A" },
  { name: "Admin", color: "#4DA2FF" },
  { name: "Threshold", color: "#A06EE9" },
  { name: "Time-lock", color: "#6CD3D6" },
  { name: "Cond.", color: "#E8A540" },
];

function tierIdxFromName(name: string): number {
  const t = TIER_PALETTE.findIndex((x) => x.name === name);
  return t === -1 ? 0 : t;
}

// ─────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────

function MonoLabel({
  children,
  size = 11,
  color = "var(--echo-mut)",
  className,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("echo-mono", className)}
      style={{ fontSize: size, color }}
    >
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
  className,
}: {
  children: React.ReactNode;
  href?: string;
  size?: "sm" | "md" | "lg";
  variant?: "ink" | "paper" | "yellow";
  aurora?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const pads =
    size === "sm" ? "8px 14px" : size === "lg" ? "16px 24px" : "12px 18px";
  const fontSize = size === "sm" ? 11 : size === "lg" ? 13 : 12;
  const bg = aurora
    ? "var(--echo-aurora-plate)"
    : variant === "ink"
      ? "#0A0A0A"
      : variant === "yellow"
        ? "#E8FF75"
        : "#FFFFFF";
  const fg = variant === "ink" ? "#FAF8F5" : "#0A0A0A";

  const inner = (
    <span
      className={cn("echo-brut", className)}
      style={{
        padding: pads,
        background: bg,
        color: fg,
        fontSize,
      }}
    >
      {children}
    </span>
  );
  if (href) {
    return (
      <Link href={href} onClick={onClick}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("echo-brut", className)}
      style={{
        padding: pads,
        background: bg,
        color: fg,
        fontSize,
      }}
    >
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
          className="echo-pill-count"
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

// ─────────────────────────────────────────────────────────────────
// Sparkline — SVG line + area fill
// ─────────────────────────────────────────────────────────────────

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
  const gid = `echo-spark-${Math.random().toString(36).slice(2, 7)}`;
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

// ─────────────────────────────────────────────────────────────────
// Privacy donut — segments via stroke-dasharray
// ─────────────────────────────────────────────────────────────────

function PrivacyDonut({
  counts,
  size = 140,
  thickness = 18,
}: {
  counts: number[];
  size?: number;
  thickness?: number;
}) {
  const total = counts.reduce((a, b) => a + b, 0);
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  let cumulative = 0;
  const segs = counts.map((c, i) => {
    const frac = total === 0 ? 0 : c / total;
    const length = frac * circumference;
    const offset = cumulative;
    cumulative += length;
    return { tier: i, length, offset };
  });
  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--echo-rail)"
          strokeWidth={thickness}
        />
        {segs.map((s) =>
          s.length === 0 ? null : (
            <circle
              key={s.tier}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={TIER_PALETTE[s.tier].color}
              strokeWidth={thickness}
              strokeLinecap="butt"
              strokeDasharray={`${s.length} ${circumference}`}
              strokeDashoffset={-s.offset}
            />
          ),
        )}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            fontSize: 24,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: "var(--echo-ink)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {total}
        </div>
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--echo-mut)",
            marginTop: 4,
          }}
        >
          Forms
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────

function HeroShelf() {
  const data = useDashboard();
  return (
    <section
      className="echo-section"
      style={{ background: "var(--echo-paper)" }}
    >
      <div
        className="echo-container"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 520px",
          gap: 48,
          alignItems: "center",
          paddingBlock: "56px 72px",
        }}
      >
        <div style={{ maxWidth: 640 }}>
          <MonoLabel size={11} color="var(--echo-mut)">
            <span className="echo-live-dot" /> live
            <span style={{ margin: "0 10px", color: "#D6D6D6" }}>·</span>
            walrus-native · sui dApp · seal-encrypted
          </MonoLabel>
          <motion.h1
            initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="echo-display"
          >
            <span>triage</span>
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
              textWrap: "pretty" as never,
            }}
          >
            Three forms have submissions waiting on you.
            <br />
            One needs <em>2 of 3</em> threshold shares before it decrypts.
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              marginBottom: 28,
            }}
          >
            <BrutalistInk size="lg" href="/forms/new">
              + Create form
            </BrutalistInk>
            <Link
              href="#triage"
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
                transition: "color 140ms ease",
              }}
            >
              jump to queue <span>↓</span>
            </Link>
          </div>
          <MonoLabel size={10}>
            <strong style={{ color: "var(--echo-ink)", fontWeight: 600 }}>
              {data.kpis.openForms}
            </strong>{" "}
            open ·{" "}
            <strong style={{ color: "var(--echo-ink)", fontWeight: 600 }}>
              {data.kpis.totalForms}
            </strong>{" "}
            total
            <span style={{ color: "#D6D6D6", margin: "0 10px" }}>·</span>
            0.0042 SUI / tx
            <span style={{ color: "#D6D6D6", margin: "0 10px" }}>·</span>
            epoch 412
          </MonoLabel>
        </div>
        <div
          style={{
            position: "relative",
            height: 480,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Aurora plate behind */}
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
            transition={{ duration: 1.1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "relative",
              zIndex: 2,
              filter: "drop-shadow(0 24px 30px rgba(76,162,255,0.25))",
            }}
            className="ff-bobble"
          >
            <WalrusMascot pose="peace" size={360} />
          </motion.div>
          {/* Top right floating chip */}
          <div
            style={{
              position: "absolute",
              top: 60,
              right: 30,
              background: "var(--echo-paper)",
              border: "2px solid var(--echo-ink)",
              borderRadius: 10,
              boxShadow: "var(--echo-brut-shadow-sm)",
              padding: "8px 12px",
              zIndex: 3,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <MonoLabel size={9} color="var(--echo-ink)">
              +{data.kpis.delta24h} / 24h
            </MonoLabel>
          </div>
          {/* Bottom left floating chip */}
          <div
            style={{
              position: "absolute",
              bottom: 70,
              left: 0,
              background: "var(--echo-paper)",
              border: "2px solid var(--echo-ink)",
              borderRadius: 10,
              boxShadow: "var(--echo-brut-shadow-sm)",
              padding: "10px 14px",
              zIndex: 3,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ width: 80, display: "inline-block" }}>
              <Sparkline
                data={data.sparkline.slice(-14)}
                height={28}
                accent="#0A0A0A"
                fillFrom="#4DA2FF"
              />
            </span>
            <MonoLabel size={9} color="var(--echo-mut)">
              14d
            </MonoLabel>
          </div>
        </div>
      </div>
    </section>
  );
}

function KpiStrip() {
  const data = useDashboard();
  const { kpis, sparkline } = data;
  return (
    <section
      className="echo-section"
      style={{ background: "var(--echo-paper)" }}
    >
      <div
        className="echo-container"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
        }}
      >
        <KpiTile
          label="Submissions · 24h"
          value={kpis.subs24h}
          delta={kpis.delta24h}
          sub="vs previous 24h"
          spark={sparkline.slice(-10)}
        />
        <KpiTile
          label="Open forms"
          value={kpis.openForms}
          sub={`of ${kpis.totalForms} total`}
        />
        <KpiTile
          label="Bounty TVL"
          value={kpis.bountySui}
          decimals={2}
          suffix=" SUI"
          sub={`${kpis.pools} pools · 412 mist gas`}
        />
        <KpiTile
          label="Awaiting decrypt"
          value={kpis.awaitingDecrypt}
          tone="warn"
          sub="m-of-n shares pending"
          peek
        />
      </div>
    </section>
  );
}

function KpiTile({
  label,
  value,
  decimals = 0,
  suffix,
  delta,
  sub,
  spark,
  tone,
  peek,
}: {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  delta?: number;
  sub: string;
  spark?: number[];
  tone?: "warn";
  peek?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        padding: "36px 32px 32px",
        borderRight: "1px solid var(--echo-rail)",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        minHeight: 230,
        overflow: "hidden",
        background:
          tone === "warn"
            ? "linear-gradient(180deg, #FFFCEF 0%, #FFFFFF 100%)"
            : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <MonoLabel size={11}>{label}</MonoLabel>
        {delta !== undefined && <DeltaChip value={delta} />}
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
      {peek && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -28,
            bottom: -32,
            opacity: 0.95,
            zIndex: 0,
            transform: "rotate(8deg)",
            pointerEvents: "none",
          }}
        >
          <WalrusMascot pose="monogram" size={150} />
        </div>
      )}
    </div>
  );
}

function TriageSection() {
  const data = useDashboard();
  const [filter, setFilter] = useState<
    "new" | "read" | "flagged" | "archived" | "all"
  >("new");
  const filtered = data.triage.filter((r) =>
    filter === "all" ? true : r.status === filter,
  );
  const counts = useMemo(
    () => ({
      new: data.triage.filter((r) => r.status === "new").length,
      read: data.triage.filter((r) => r.status === "read").length,
      flagged: data.triage.filter((r) => r.status === "flagged").length,
      archived: data.triage.filter((r) => r.status === "archived").length,
    }),
    [],
  );
  return (
    <section
      id="triage"
      className="echo-section"
      style={{ background: "var(--echo-paper)" }}
    >
      <div
        className="echo-container"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 380px",
          gap: 40,
          paddingBlock: "56px 72px",
        }}
      >
        <div>
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
              <MonoLabel>queue · cross-form</MonoLabel>
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
                your inbox.
              </h2>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--echo-mut)",
                  margin: 0,
                  maxWidth: 420,
                }}
              >
                Every submission across every form you own. Decrypt and triage
                from one surface.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <FramePill
                active={filter === "new"}
                onClick={() => setFilter("new")}
                count={counts.new}
                dotColor="#0A0A0A"
              >
                new
              </FramePill>
              <FramePill
                active={filter === "read"}
                onClick={() => setFilter("read")}
                count={counts.read}
              >
                read
              </FramePill>
              <FramePill
                active={filter === "flagged"}
                onClick={() => setFilter("flagged")}
                count={counts.flagged}
                dotColor="#E8A540"
              >
                flagged
              </FramePill>
              <FramePill
                active={filter === "archived"}
                onClick={() => setFilter("archived")}
                count={counts.archived}
              >
                archived
              </FramePill>
              <FramePill
                active={filter === "all"}
                onClick={() => setFilter("all")}
                count={data.triage.length}
              >
                all
              </FramePill>
            </div>
          </header>
          <TriageTable rows={filtered} filter={filter} />
          <footer
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "16px 4px 0",
              gap: 16,
            }}
          >
            <MonoLabel size={9.5} color="var(--echo-mut)">
              showing {filtered.length} of {data.triage.length} · click any row
              to inspect on-chain
            </MonoLabel>
            <Link
              href="#"
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--echo-mut)",
                fontWeight: 500,
              }}
            >
              open in explorer ↗
            </Link>
          </footer>
        </div>
        <aside
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minWidth: 0,
          }}
        >
          <RailAskCard />
          <RailPrivacyCard />
          <RailTopFormsCard />
        </aside>
      </div>
    </section>
  );
}

function TriageTable({
  rows,
  filter,
}: {
  rows: TriageRowData[];
  filter: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--echo-rail)",
        borderRadius: 16,
        background: "var(--echo-paper)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1fr) 160px 100px 130px",
          gap: 16,
          padding: "14px 20px",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--echo-mut)",
          borderBottom: "1px solid var(--echo-rail)",
          background: "var(--echo-rail-2)",
        }}
      >
        <span>form · submitter</span>
        <span>tier</span>
        <span>received</span>
        <span style={{ textAlign: "right" }}>action</span>
      </div>
      {rows.map((row, i) => (
        <TriageRow key={row.id} row={row} index={i} />
      ))}
      {rows.length === 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            padding: "36px 24px",
          }}
        >
          <WalrusMascot pose="haulout" size={120} />
          <div>
            <h4
              style={{
                margin: "0 0 4px",
                fontWeight: 500,
                fontSize: 22,
                letterSpacing: "-0.025em",
              }}
            >
              nothing in <em>{filter}</em>.
            </h4>
            <p style={{ margin: 0, color: "var(--echo-mut)" }}>
              You&rsquo;re caught up. Try a different filter or create a new
              form.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function TriageRow({ row, index }: { row: TriageRowData; index: number }) {
  const tierIdx = tierIdxFromName(row.tier);
  const rail =
    row.status === "new"
      ? "var(--echo-ink)"
      : row.status === "flagged"
        ? "#E8A540"
        : null;
  // Deep-link to the admin for this submission's form. Falls back to
  // /forms when the row is a demo placeholder without a real formId.
  const rowHref = row.formId
    ? `/forms/${row.formId}/admin?focus=${row.id}`
    : null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.03 }}
      onClick={() => {
        if (rowHref && typeof window !== "undefined") {
          window.location.assign(rowHref);
        }
      }}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) 160px 100px 130px",
        gap: 16,
        padding: "18px 20px",
        alignItems: "center",
        borderBottom: "1px solid var(--echo-rail)",
        position: "relative",
        cursor: rowHref ? "pointer" : "default",
      }}
      whileHover={{ background: "var(--echo-rail-2)" }}
    >
      {rail && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            background: rail,
          }}
        />
      )}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 15,
            fontWeight: 500,
            color: "var(--echo-ink)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {row.form}
          </span>
          {row.status === "new" && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: "var(--echo-sui-sea)",
                boxShadow: "0 0 0 3px rgba(77,162,255,0.18)",
                flexShrink: 0,
              }}
            />
          )}
          {row.status === "flagged" && (
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--echo-warn)",
                padding: "2px 8px",
                borderRadius: 999,
                background: "var(--echo-warn-bg)",
                flexShrink: 0,
              }}
            >
              ▲ flagged
            </span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            color: "var(--echo-mut)",
            marginTop: 4,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <span>
            {row.submitterNs ? (
              <>
                <strong style={{ color: "var(--echo-ink)", fontWeight: 500 }}>
                  {row.submitterNs}
                </strong>{" "}
                <span style={{ color: "var(--echo-mut-2)" }}>
                  · {row.submitter}
                </span>
              </>
            ) : row.submitter === "anon" ? (
              <em>anonymous</em>
            ) : (
              <span style={{ color: "var(--echo-mut)" }}>{row.submitter}</span>
            )}
          </span>
          {row.note && (
            <span style={{ color: "var(--echo-mut-2)" }}>— {row.note}</span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <TierDot tierIdx={tierIdx} />
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--echo-ink)",
              lineHeight: 1.1,
            }}
          >
            {row.tier}
          </div>
          {row.k && (
            <MonoLabel size={9} color="var(--echo-mut)">
              {row.k}
            </MonoLabel>
          )}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          lineHeight: 1.1,
        }}
      >
        <span
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            fontSize: 16,
            letterSpacing: "-0.02em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {row.ago}
        </span>
        <MonoLabel size={9} color="var(--echo-mut-2)">
          ago
        </MonoLabel>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        {row.encrypted ? (
          <BrutalistInk
            size="sm"
            href={row.formId ? `/forms/${row.formId}/admin` : "/forms"}
          >
            decrypt
          </BrutalistInk>
        ) : (
          <Link
            href={row.formId ? `/forms/${row.formId}/admin` : "/forms"}
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 500,
              color: "var(--echo-ink)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              border: "1px solid var(--echo-rail)",
              borderRadius: 999,
              transition: "all 140ms ease",
            }}
          >
            open <span>→</span>
          </Link>
        )}
      </div>
    </motion.div>
  );
}

const SUGGESTIONS = [
  "Top complaints this week?",
  "Sentiment by tier",
  "Repeat submitters",
  "Bounty hot-list",
];

function RailAskCard() {
  const [q, setQ] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setQ((i) => (i + 1) % SUGGESTIONS.length),
      3800,
    );
    return () => clearInterval(t);
  }, []);
  return (
    <div
      className="echo-card"
      style={{
        overflow: "hidden",
        padding: 0,
        border: "2px solid var(--echo-ink)",
        boxShadow: "var(--echo-brut-shadow)",
      }}
    >
      <div
        style={{
          position: "relative",
          padding: 18,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          minHeight: 380,
          background:
            "radial-gradient(120% 80% at 70% 30%, #6FBCF0 0%, transparent 50%), radial-gradient(100% 100% at 20% 80%, #6CD3D6 0%, transparent 55%), radial-gradient(80% 100% at 90% 90%, #A06EE9 0%, transparent 60%), #FFFFFF",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            position: "relative",
            zIndex: 2,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              border: "2px solid var(--echo-ink)",
              background: "var(--echo-paper)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              boxShadow: "var(--echo-brut-shadow-sm)",
              flexShrink: 0,
            }}
          >
            <WalrusMascot pose="monogram" size={42} />
          </div>
          <div>
            <MonoLabel size={10} color="var(--echo-ink)">
              <strong style={{ fontWeight: 600 }}>memwal</strong> · rag
            </MonoLabel>
            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 9.5,
                fontWeight: 500,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--echo-mut)",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                marginTop: 4,
              }}
            >
              <span className="echo-live-dot" /> 6 forms indexed · live
            </div>
          </div>
        </div>
        <motion.div
          key={q}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--echo-paper)",
            border: "1.5px solid var(--echo-ink)",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 13.5,
            fontWeight: 500,
            color: "var(--echo-ink)",
            position: "relative",
            zIndex: 2,
          }}
        >
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: "0.08em",
              padding: "2px 6px",
              background: "var(--echo-rail-2)",
              border: "1px solid var(--echo-rail)",
              borderRadius: 5,
              color: "var(--echo-ink)",
            }}
          >
            ⌘K
          </span>
          <span
            style={{
              flex: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {SUGGESTIONS[q]}
          </span>
          <span
            style={{
              display: "inline-block",
              width: 2,
              height: 14,
              background: "var(--echo-sui-violet)",
              animation: "caret-blink 1.05s steps(2) infinite",
            }}
          />
          <style jsx>{`
            @keyframes caret-blink {
              50% {
                opacity: 0;
              }
            }
          `}</style>
        </motion.div>
        <div
          style={{
            position: "relative",
            zIndex: 2,
            background: "rgba(255,255,255,0.78)",
            backdropFilter: "blur(4px)",
            border: "1px solid var(--echo-rail)",
            borderRadius: 10,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <Bullet
            tierIdx={2}
            form="onboarding flow"
            text='14 mentions of "wallet timeout"'
            cite="↗ devnet · q2"
          />
          <Bullet
            tierIdx={4}
            form="seal beta"
            text="decrypt UX too manual (9)"
            cite="↗ seal · beta"
          />
          <Bullet
            tierIdx={1}
            form="nps · april"
            text="sentiment +12% vs march"
            cite="↗ nps · apr"
            positive
          />
        </div>
        <div
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginTop: "auto",
          }}
        >
          <BrutalistInk size="sm" href="/insights">
            open insights
          </BrutalistInk>
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <MonoLabel size={9} color="var(--echo-ink)">
              2.3s avg
            </MonoLabel>
            <span style={{ color: "#D6D6D6" }}>·</span>
            <MonoLabel size={9} color="var(--echo-mut)">
              147 q this week
            </MonoLabel>
          </span>
        </div>
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -20,
            bottom: -28,
            zIndex: 1,
            opacity: 0.85,
            filter: "drop-shadow(0 12px 24px rgba(160,110,233,0.35))",
            pointerEvents: "none",
          }}
          className="ff-bobble"
        >
          <WalrusMascot pose="salute" size={120} />
        </div>
      </div>
    </div>
  );
}

function Bullet({
  tierIdx,
  form,
  text,
  cite,
  positive,
}: {
  tierIdx: number;
  form: string;
  text: string;
  cite: string;
  positive?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "12px 1fr",
        columnGap: 10,
        rowGap: 4,
        alignItems: "start",
        fontSize: 12.5,
        lineHeight: 1.4,
        color: "var(--echo-ink)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 10,
          height: 10,
          marginTop: 5,
          background: TIER_PALETTE[tierIdx].color,
          border: "1px solid rgba(0,0,0,0.18)",
          flexShrink: 0,
        }}
      />
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--echo-ink)",
          }}
        >
          {form}
        </span>
        <span style={{ color: "var(--echo-ink)" }}> — {text}</span>
        {positive && (
          <span
            style={{
              marginLeft: 4,
              fontFamily: "JetBrains Mono, monospace",
              fontWeight: 600,
              color: "var(--echo-success)",
              background: "var(--echo-success-bg)",
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: 11,
            }}
          />
        )}
      </span>
      <span
        style={{
          gridColumn: "2 / 3",
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--echo-mut)",
          whiteSpace: "nowrap",
          marginTop: -2,
        }}
      >
        {cite}
      </span>
    </div>
  );
}

function RailPrivacyCard() {
  const data = useDashboard();
  const total = data.tierCounts.reduce((a, b) => a + b, 0);
  return (
    <div className="echo-card" style={{ padding: 22 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <MonoLabel>privacy mix</MonoLabel>
        <MonoLabel size={9} color="var(--echo-mut-2)">
          {total} forms
        </MonoLabel>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "148px 1fr",
          gap: 18,
          alignItems: "center",
        }}
      >
        <PrivacyDonut counts={data.tierCounts} size={140} thickness={18} />
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {TIER_PALETTE.map((t, i) => (
            <li
              key={t.name}
              style={{
                display: "grid",
                gridTemplateColumns: "14px 1fr auto",
                gap: 8,
                alignItems: "center",
                fontSize: 12.5,
              }}
            >
              <TierDot tierIdx={i} />
              <span style={{ color: "var(--echo-ink)" }}>{t.name}</span>
              <span
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 11,
                  color: "var(--echo-mut)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {data.tierCounts[i]}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RailTopFormsCard() {
  const data = useDashboard();
  const max = Math.max(...data.topForms.map((f) => f.subs), 1);
  return (
    <div className="echo-card" style={{ padding: 22 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <MonoLabel>top forms · by submissions</MonoLabel>
        <Link
          href="/forms"
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--echo-mut)",
            fontWeight: 500,
          }}
        >
          all ↗
        </Link>
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {data.topForms.map((f, idx) => (
          <motion.li
            key={f.id}
            initial={{ opacity: 0, x: -6 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.05, duration: 0.4 }}
            style={{ display: "flex", flexDirection: "column", gap: 6 }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "8px 1fr auto",
                gap: 10,
                alignItems: "center",
              }}
            >
              <TierDot tierIdx={f.tierIdx} size={8} />
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: "var(--echo-ink)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {f.title}
              </span>
              <span
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--echo-ink)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {f.subs}
              </span>
            </div>
            <div
              style={{
                height: 4,
                background: "var(--echo-rail-2)",
                borderRadius: 999,
                overflow: "hidden",
                marginLeft: 18,
              }}
            >
              <motion.span
                initial={{ width: 0 }}
                whileInView={{ width: `${(f.subs / max) * 100}%` }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.8,
                  delay: idx * 0.06,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{
                  display: "block",
                  height: "100%",
                  borderRadius: 999,
                  background: TIER_PALETTE[f.tierIdx].color,
                }}
              />
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function ThirtyStrip() {
  const data = useDashboard();
  const total = data.sparkline.reduce((a, b) => a + b, 0);
  return (
    <section
      className="echo-section"
      style={{ background: "var(--echo-paper-2)" }}
    >
      <div className="echo-container" style={{ paddingBlock: "40px 48px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 32,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <MonoLabel>submissions · last 30 days</MonoLabel>
            <p
              style={{
                margin: "6px 0 0",
                color: "var(--echo-mut)",
                fontSize: 13,
              }}
            >
              from <em>SubmissionMade</em> events on sui
            </p>
          </div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: 12,
            }}
          >
            <KpiNumber value={total} size="md" />
            <MonoLabel size={11} color="var(--echo-mut)">
              total
            </MonoLabel>
          </div>
        </div>
        <div style={{ paddingTop: 4 }}>
          <Sparkline
            data={data.sparkline}
            height={100}
            accent="#0A0A0A"
            fillFrom="#4DA2FF"
          />
        </div>
      </div>
    </section>
  );
}

function BottomBand() {
  return (
    <section
      className="echo-section"
      style={{ background: "var(--echo-paper)" }}
    >
      <div
        className="echo-container"
        style={{
          paddingBlock: 56,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)",
          gap: 24,
        }}
      >
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
                  margin: "8px 0 8px",
                  textWrap: "balance" as never,
                }}
              >
                drop a question.{" "}
                <span style={{ color: "var(--echo-mut)" }}>
                  sign once. it&rsquo;s on chain.
                </span>
              </h3>
              <p
                style={{
                  margin: "8px 0 20px",
                  color: "var(--echo-mut)",
                  fontSize: 14,
                  maxWidth: 440,
                }}
              >
                Drag-drop builder · 5 privacy tiers · gas-sponsored submissions.
                About 90 seconds end-to-end.
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  flexWrap: "wrap",
                }}
              >
                <BrutalistInk href="/forms/new">create form</BrutalistInk>
                <BrutalistInk variant="paper" href="/forms/new">
                  use a template
                </BrutalistInk>
              </div>
            </div>
            <div
              style={{
                marginRight: -24,
                marginBottom: -32,
                alignSelf: "end",
                justifySelf: "end",
              }}
              className="ff-bobble"
            >
              <WalrusMascot pose="peace" size={240} />
            </div>
          </div>
        </div>
        <div
          className="echo-card"
          style={{
            padding: 22,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <MonoLabel>reputation</MonoLabel>
            <MonoLabel size={9} color="var(--echo-mut-2)">
              soulbound · sbt
            </MonoLabel>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 999,
                  background: "var(--echo-rail-2)",
                  border: "2px solid var(--echo-ink)",
                  boxShadow: "var(--echo-brut-shadow-sm)",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <WalrusMascot pose="monogram" size={62} />
              </div>
              <div>
                <strong
                  style={{
                    fontSize: 22,
                    fontWeight: 500,
                    letterSpacing: "-0.02em",
                  }}
                >
                  147
                </strong>{" "}
                badges minted
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--echo-mut)",
                    marginTop: 2,
                  }}
                >
                  12 this week · 3 awaiting credit
                </div>
              </div>
            </div>
            <BrutalistInk variant="paper" size="sm">
              credit responders
            </BrutalistInk>
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
          echo · forms on sui · v0.3.2 · pkg 0x4d7…2c8
        </MonoLabel>
        <div style={{ display: "flex", gap: 22 }}>
          <Link
            href="https://github.com/hien-p/echo"
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
              fontWeight: 500,
            }}
          >
            github ↗
          </Link>
          <Link
            href="https://suiscan.xyz"
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
              fontWeight: 500,
            }}
          >
            explorer ↗
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
      href="#triage"
      aria-label="back to triage"
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 30,
        border: "2px solid var(--echo-ink)",
        borderRadius: 999,
        width: 84,
        height: 84,
        background: "var(--echo-paper)",
        boxShadow: "var(--echo-brut-shadow)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        transition: "transform 140ms ease, box-shadow 140ms ease",
      }}
      className="ff-bobble"
    >
      <WalrusMascot pose="salute" size={84} />
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────

export function EchoDashboardRedesign() {
  const live = useEchoDashboardData();
  // Use live data once a wallet (or demo) is connected AND something has
  // resolved. Falls back to the design-spec placeholders before then so
  // the page never reads as broken/loading-skeleton.
  const data: DashboardData =
    live.ownerAddress && (live.forms.length > 0 || !live.isLoading)
      ? live
      : FALLBACK;
  return (
    <DashboardContext.Provider value={data}>
      <div className="echo-dashboard echo-builder">
        <EchoNavRail active="dashboard" />
        <HeroShelf />
        <KpiStrip />
        <TriageSection />
        <ThirtyStrip />
        <BottomBand />
        <FooterRail />
        <Floater />
      </div>
    </DashboardContext.Provider>
  );
}
