"use client";

import { useMemo, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  Inbox,
  ShieldCheck,
  Unlock,
} from "lucide-react";
import AuroraBlur from "@/components/react-bits/aurora-blur";
import { clientConfig } from "@/config/clientConfig";
import {
  PrivacyTier,
  readJsonViaAggregator,
  listApprovals,
} from "@/lib/echo";
import type { FormMetadata } from "@/lib/echo";
import { CountUp } from "./CountUp";

/**
 * Dashboard KPI strip — replaces the three competing overview zones
 * (LivePreviewCard, SwissBentoOverview, BentoDashboard hero tile)
 * with one coherent operator surface.
 *
 *   ┌──────────────┬──────────────┬──────────────┬──────────────┐
 *   │ Submissions  │ Open forms   │ Bounty TVL   │ Awaiting     │
 *   │ 24h Δ        │              │              │ decrypt      │
 *   └──────────────┴──────────────┴──────────────┴──────────────┘
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ 30-day submissions area chart (real, from SubmissionMade)│
 *   └──────────────────────────────────────────────────────────┘
 *
 * All data is sourced from on-chain queries that CrossFormDashboard
 * already runs. We subscribe with the same query keys so TanStack
 * dedupes — zero extra RPC calls. The four queries:
 *   - dashboard-forms       (FormOwnerCap → owned forms)
 *   - dashboard-submissions (SubmissionMade events → time-series)
 *   - dashboard-bounties    (BountyOpened pool TVL)
 *   - dashboard-approvals   (ApprovalPosted counts for Threshold forms)
 *
 * The strip mounts at the top of the dark "operator console" zone,
 * directly below the editorial hero — the deliberate visual handoff
 * between brand chrome and admin surface.
 */

interface OnChainForm {
  schema_blob_id: string;
  metadata_blob_id: string;
  owner: string;
  privacy_tier: number;
  threshold_n: number;
  threshold_m: number;
  unlock_ms: string;
  status: number;
  submission_count: string;
  created_ms: string;
}

interface FormCard {
  id: string;
  title: string;
  onChain: OnChainForm;
}

interface SubmissionRefJson {
  submitted_ms?: string;
  payload_blob_id?: string;
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

export function DashboardKpiStrip() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;
  const ownerAddress = account?.address;

  // 1) Owned forms — same key as CrossFormDashboard so cache is shared.
  const formsQuery = useQuery({
    queryKey: ["echo", "dashboard-forms", ownerAddress, false],
    queryFn: async (): Promise<FormCard[]> => {
      if (!ownerAddress || !packageId.startsWith("0x")) return [];
      const owned = await suiClient.listOwnedObjects({
        owner: ownerAddress,
        type: `${packageId}::form::FormOwnerCap`,
        include: { json: true },
        limit: 200,
      });
      const caps = (owned.objects ?? []) as unknown as Array<{
        objectId: string;
        json: { form_id?: string };
      }>;
      const ids = Array.from(
        new Set(
          caps.map((c) => c.json?.form_id).filter((id): id is string => !!id),
        ),
      );
      if (ids.length === 0) return [];
      const fobjs = await suiClient.getObjects({
        objectIds: ids,
        include: { json: true },
      });
      const network = clientConfig.WALRUS_NETWORK;
      const validObjects = fobjs.objects.filter(
        (obj) => !!(obj as { json?: unknown }).json,
      ) as unknown as Array<{ objectId: string; json: OnChainForm }>;
      return Promise.all(
        validObjects.map(async (o) => {
          let title = "(metadata unavailable)";
          try {
            const meta = await readJsonViaAggregator<FormMetadata>(
              o.json.metadata_blob_id,
              { network },
            );
            title = meta.title;
          } catch {
            /* keep fallback */
          }
          return { id: o.objectId, title, onChain: o.json };
        }),
      );
    },
    enabled: !!ownerAddress && packageId.startsWith("0x"),
    staleTime: 30_000,
  });

  const forms = formsQuery.data ?? [];
  const formIdsKey = forms.map((f) => f.id).join(",");

  // 2) Submissions — used for both the 24h delta AND the time-series chart.
  const submissionsQuery = useQuery({
    queryKey: ["echo", "dashboard-submissions", formIdsKey],
    queryFn: async (): Promise<SubmissionRow[]> => {
      if (forms.length === 0) return [];
      const eventType = `${packageId}::submission::SubmissionMade`;
      const fullnodeUrl = clientConfig.SUI_FULLNODE_URL;
      const perForm = await Promise.all(
        forms.map(async (form) => {
          const events = await queryEvents(fullnodeUrl, eventType, form.id);
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
          return events.map(
            (e): SubmissionRow => ({
              formId: form.id,
              formTitle: form.title,
              formTier: form.onChain.privacy_tier,
              submissionId: e.submission_id,
              submitter: e.submitter,
              anonymous: e.anonymous,
              submittedAt: byId.get(e.submission_id)?.submitted_ms
                ? new Date(
                    Number(byId.get(e.submission_id)!.submitted_ms),
                  ).toISOString()
                : "(unknown)",
              payloadBlobId: byId.get(e.submission_id)?.payload_blob_id ?? "",
              encrypted: form.onChain.privacy_tier !== 0,
            }),
          );
        }),
      );
      const flat = perForm.flat();
      flat.sort(
        (a, b) => (Date.parse(b.submittedAt) || 0) - (Date.parse(a.submittedAt) || 0),
      );
      return flat;
    },
    enabled: forms.length > 0,
    staleTime: 15_000,
  });

  const submissions = submissionsQuery.data ?? [];

  // 3) Bounty TVL — same key + queryFn shape as CrossFormDashboard.
  const bountyQuery = useQuery({
    queryKey: ["echo", "dashboard-bounties", packageId, formIdsKey],
    queryFn: async (): Promise<{ totalMist: bigint; pools: number }> => {
      if (forms.length === 0) return { totalMist: BigInt(0), pools: 0 };
      const formIdSet = new Set(forms.map((f) => f.id));
      const fullnodeUrl = clientConfig.SUI_FULLNODE_URL;
      const eventType = `${packageId}::bounty::BountyOpened`;
      const resp = await fetch(fullnodeUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "suix_queryEvents",
          params: [{ MoveEventType: eventType }, null, 200, true],
        }),
      });
      if (!resp.ok) return { totalMist: BigInt(0), pools: 0 };
      const json = (await resp.json()) as {
        result?: {
          data?: Array<{
            parsedJson?: { pool_id?: string; form_id?: string };
          }>;
        };
      };
      const events = json.result?.data ?? [];
      const ownedPoolIds = events
        .filter(
          (e) => e.parsedJson?.form_id && formIdSet.has(e.parsedJson.form_id),
        )
        .map((e) => e.parsedJson!.pool_id!)
        .filter(Boolean);
      if (ownedPoolIds.length === 0)
        return { totalMist: BigInt(0), pools: 0 };
      const pools = await suiClient.getObjects({
        objectIds: ownedPoolIds,
        include: { json: true },
      });
      let totalMist = BigInt(0);
      for (const p of pools.objects as unknown as Array<{
        json?: { funds?: string | { value?: string } };
      }>) {
        const funds = p.json?.funds;
        const raw =
          typeof funds === "string"
            ? funds
            : typeof funds === "object" && funds && "value" in funds
              ? funds.value
              : "0";
        try {
          totalMist += BigInt(raw ?? "0");
        } catch {
          /* skip malformed */
        }
      }
      return { totalMist, pools: ownedPoolIds.length };
    },
    enabled: forms.length > 0 && packageId.startsWith("0x"),
    staleTime: 30_000,
  });

  // 4) Awaiting decrypt — count Threshold forms still below their k.
  const approvalsQuery = useQuery({
    queryKey: ["echo", "dashboard-approvals", packageId, formIdsKey],
    queryFn: async (): Promise<Record<string, number>> => {
      const out: Record<string, number> = {};
      const targets = forms.filter(
        (f) =>
          f.onChain.privacy_tier === PrivacyTier.Threshold &&
          (f.onChain.threshold_n ?? 1) >= 2,
      );
      if (targets.length === 0) return out;
      const fullnodeUrl = clientConfig.SUI_FULLNODE_URL;
      await Promise.all(
        targets.map(async (form) => {
          const approvals = await listApprovals({
            fullnodeUrl,
            packageId,
            formId: form.id,
          });
          out[form.id] = approvals.length;
        }),
      );
      return out;
    },
    enabled: forms.length > 0 && packageId.startsWith("0x"),
    staleTime: 8_000,
    refetchInterval: 8_000,
  });

  // ──────────────────────────────────────────────────────────────────
  // Derived metrics
  // ──────────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    let subs24h = 0;
    let subsPrev24h = 0;
    for (const s of submissions) {
      const t = Date.parse(s.submittedAt);
      if (!Number.isFinite(t)) continue;
      const age = now - t;
      if (age <= day) subs24h += 1;
      else if (age <= 2 * day) subsPrev24h += 1;
    }
    const delta24h = subs24h - subsPrev24h;
    const openForms = forms.filter((f) => f.onChain.status === 1).length;

    // Awaiting decrypt: Threshold forms where current approvals < threshold k
    const approvals = approvalsQuery.data ?? {};
    const awaitingDecrypt = forms.filter((f) => {
      if (f.onChain.privacy_tier !== PrivacyTier.Threshold) return false;
      const k = f.onChain.threshold_m ?? 0;
      const have = approvals[f.id] ?? 0;
      return k >= 2 && have < k;
    }).length;

    // 30-day daily buckets for the area chart
    const days = 30;
    const bucketStartMs = now - days * day;
    const counts = new Array(days).fill(0) as number[];
    for (const s of submissions) {
      const t = Date.parse(s.submittedAt);
      if (!Number.isFinite(t) || t < bucketStartMs) continue;
      const idx = Math.min(days - 1, Math.floor((t - bucketStartMs) / day));
      counts[idx] += 1;
    }

    const tvlMist = bountyQuery.data?.totalMist ?? BigInt(0);
    const tvlSui = Number(tvlMist) / 1e9;

    return {
      subs24h,
      delta24h,
      openForms,
      awaitingDecrypt,
      tvlSui,
      pools: bountyQuery.data?.pools ?? 0,
      counts,
      totalLast30d: counts.reduce((a, b) => a + b, 0),
    };
  }, [submissions, forms, approvalsQuery.data, bountyQuery.data]);

  const isLoading = formsQuery.isLoading || submissionsQuery.isLoading;

  if (!ownerAddress) {
    return (
      <div className="rounded-2xl border border-border bg-card/40 p-8 text-center">
        <p className="text-base text-muted-foreground">
          Connect a wallet to load your live operator metrics.
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-4">
      {/* Aurora ambient glow behind the strip — toned-down Walrus palette
          so it reads as atmosphere, not a marketing background. Pointer
          events off so spotlight/clicks pass through. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-8 -top-12 -bottom-8 -z-10 overflow-hidden rounded-3xl opacity-50"
        style={{ filter: "blur(4px)" }}
      >
        <AuroraBlur
          width="100%"
          height="100%"
          speed={0.6}
          opacity={0.7}
          bloomIntensity={2.2}
          brightness={0.9}
          saturation={1.1}
          verticalFade={1.1}
          noiseScale={2.5}
          layers={[
            { color: "#5B8DEF", speed: 0.28, intensity: 0.45 },
            { color: "#A78BFA", speed: 0.18, intensity: 0.35 },
            { color: "#34D399", speed: 0.22, intensity: 0.18 },
            { color: "#FBBF24", speed: 0.12, intensity: 0.14 },
          ]}
          skyLayers={[
            { color: "#0A0A0B", blend: 0.78 },
            { color: "#111114", blend: 0.5 },
          ]}
        />
      </div>

      {/* 4-tile KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <KpiTile
          delay={0}
          icon={<Inbox size={16} strokeWidth={1.75} />}
          label="Submissions · 24h"
          value={metrics.subs24h}
          delta={metrics.delta24h}
          loading={isLoading}
          href="#triage"
        />
        <KpiTile
          delay={0.05}
          icon={<Unlock size={16} strokeWidth={1.75} />}
          label="Open forms"
          value={metrics.openForms}
          loading={isLoading}
          tone="info"
          href="/forms"
          subline={`of ${forms.length} total`}
        />
        <KpiTile
          delay={0.1}
          icon={<Coins size={16} strokeWidth={1.75} />}
          label="Bounty TVL"
          value={metrics.tvlSui}
          decimals={2}
          suffix=" SUI"
          loading={bountyQuery.isLoading}
          tone="warning"
          subline={`${metrics.pools} pool${metrics.pools === 1 ? "" : "s"}`}
        />
        <KpiTile
          delay={0.15}
          icon={<ShieldCheck size={16} strokeWidth={1.75} />}
          label="Awaiting decrypt"
          value={metrics.awaitingDecrypt}
          loading={approvalsQuery.isLoading}
          tone={metrics.awaitingDecrypt > 0 ? "danger" : "success"}
          subline={
            metrics.awaitingDecrypt > 0
              ? "m-of-N shares pending"
              : "all forms unlocked"
          }
          href="#triage"
        />
      </div>

      {/* 30-day submissions area chart */}
      <Submissions30dChart
        counts={metrics.counts}
        total={metrics.totalLast30d}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// KPI tile
// ──────────────────────────────────────────────────────────────────────

function KpiTile({
  icon,
  label,
  value,
  delta,
  decimals = 0,
  suffix = "",
  subline,
  tone = "default",
  loading = false,
  href,
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  delta?: number;
  decimals?: number;
  suffix?: string;
  subline?: string;
  tone?: "default" | "info" | "warning" | "danger" | "success";
  loading?: boolean;
  href?: string;
  delay?: number;
}) {
  const toneIconCls = {
    default: "text-foreground/60",
    info: "text-blue-400",
    warning: "text-amber-400",
    danger: "text-rose-400",
    success: "text-emerald-400",
  }[tone];

  // Tone-matched accent hex for the cursor spotlight + shimmer gradient.
  // Keeps each tile's color identity instead of a generic white glow.
  const accentHex = {
    default: "#5B8DEF",
    info: "#60A5FA",
    warning: "#FBBF24",
    danger: "#FB7185",
    success: "#34D399",
  }[tone];

  // Cursor-tracked spotlight — radial gradient mask follows the mouse.
  const cardRef = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(-200);
  const my = useMotionValue(-200);
  const smx = useSpring(mx, { stiffness: 220, damping: 28 });
  const smy = useSpring(my, { stiffness: 220, damping: 28 });
  const spotlight = useTransform(
    [smx, smy],
    ([x, y]) =>
      `radial-gradient(280px circle at ${x}px ${y}px, ${accentHex}33, transparent 55%)`,
  );

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    mx.set(e.clientX - rect.left);
    my.set(e.clientY - rect.top);
  };
  const handleLeave = () => {
    mx.set(-200);
    my.set(-200);
  };

  const content = (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card/60 p-4 backdrop-blur transition hover:border-foreground/20 hover:bg-card/80"
    >
      {/* Cursor-tracked spotlight */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: spotlight }}
      />
      {/* Subtle inner gradient border on hover (conic ribbon) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `conic-gradient(from 220deg at 50% 50%, transparent 0deg, ${accentHex}66 90deg, transparent 180deg)`,
          mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          maskComposite: "exclude",
          WebkitMaskComposite: "xor",
          padding: 1,
        }}
      />

      <div className="relative flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        <span
          className={toneIconCls}
          style={{
            filter: `drop-shadow(0 0 8px ${accentHex}66)`,
          }}
        >
          {icon}
        </span>
      </div>
      <div className="relative flex items-baseline gap-2">
        {loading ? (
          <div className="h-9 w-20 animate-pulse rounded bg-foreground/10" />
        ) : (
          <ShimmerNumber
            value={value}
            decimals={decimals}
            suffix={suffix}
            accent={accentHex}
            delay={delay}
          />
        )}
        {delta !== undefined && delta !== 0 && !loading && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums ${
              delta > 0
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-rose-500/15 text-rose-400"
            }`}
          >
            {delta > 0 ? (
              <ArrowUpRight size={11} />
            ) : (
              <ArrowDownRight size={11} />
            )}
            {Math.abs(delta)}
          </span>
        )}
      </div>
      <span className="relative text-xs text-muted-foreground">
        {subline ?? "vs previous 24h"}
      </span>
    </motion.div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block scroll-mt-24"
        aria-label={`${label}: ${value}`}
      >
        {content}
      </Link>
    );
  }
  return content;
}

/**
 * Big-number wrapper that sweeps a once-only shimmer across the
 * digits as they animate from 0 → value. Uses background-clip:text so
 * the shimmer rides INSIDE the glyphs rather than on top of them.
 */
function ShimmerNumber({
  value,
  decimals,
  suffix,
  accent,
  delay,
}: {
  value: number;
  decimals: number;
  suffix: string;
  accent: string;
  delay: number;
}) {
  return (
    <span
      className="relative text-4xl font-medium leading-none tracking-tight tabular-nums"
      style={{
        letterSpacing: "-0.6px",
        backgroundImage: `linear-gradient(110deg, var(--color-foreground) 30%, ${accent} 50%, var(--color-foreground) 70%)`,
        backgroundSize: "200% 100%",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        animation: `kpi-shimmer 2.4s cubic-bezier(0.22,1,0.36,1) ${delay + 0.2}s 1 both`,
      }}
    >
      {decimals > 0 ? (
        value.toFixed(decimals)
      ) : (
        <CountUp to={value} delay={delay + 0.1} duration={1.2} />
      )}
      {suffix && (
        <span
          className="ml-1 text-xl"
          style={{ color: "var(--color-muted-foreground)" }}
        >
          {suffix}
        </span>
      )}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 30-day submissions area chart (inline SVG, no recharts dep)
// ──────────────────────────────────────────────────────────────────────

function Submissions30dChart({
  counts,
  total,
}: {
  counts: number[];
  total: number;
}) {
  const max = Math.max(1, ...counts);
  const w = 800;
  const h = 120;
  const stepX = w / Math.max(1, counts.length - 1);

  // Build smooth area path
  const points = counts.map((v, i) => {
    const x = i * stepX;
    const y = h - (v / max) * (h - 8) - 4;
    return [x, y] as const;
  });
  const pathD = points
    .map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`))
    .join(" ");
  const areaD = `${pathD} L${w},${h} L0,${h} Z`;

  const today = new Date();
  const labelDate = (offsetDays: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offsetDays);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card/60 p-5 backdrop-blur"
    >
      {/* Slow rotating conic-gradient ribbon along the border */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-px rounded-2xl opacity-60"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, #5B8DEF55 60deg, transparent 120deg, transparent 240deg, #A78BFA44 300deg, transparent 360deg)",
          mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          maskComposite: "exclude",
          WebkitMaskComposite: "xor",
          padding: 1,
          animation: "kpi-conic 14s linear infinite",
        }}
      />

      <div className="relative flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Submissions · last 30 days
          </span>
          <span className="text-sm text-muted-foreground">
            From SubmissionMade events on Sui
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span
            className="text-3xl font-medium tabular-nums leading-none tracking-tight text-foreground"
            style={{ letterSpacing: "-0.5px" }}
          >
            <CountUp to={total} delay={0.4} />
          </span>
          <span className="text-sm text-muted-foreground">total</span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="relative h-32 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Daily submissions for the last 30 days"
      >
        <defs>
          <linearGradient id="kpi-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5B8DEF" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#5B8DEF" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#5B8DEF" stopOpacity="0" />
          </linearGradient>
          <filter id="kpi-line-glow" x="-10%" y="-30%" width="120%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <motion.path
          d={areaD}
          fill="url(#kpi-area-fill)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        />
        <motion.path
          d={pathD}
          fill="none"
          stroke="#7BA9F7"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#kpi-line-glow)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, delay: 0.35, ease: "easeInOut" }}
        />
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{labelDate(29)}</span>
        <span>{labelDate(20)}</span>
        <span>{labelDate(10)}</span>
        <span>Today</span>
      </div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Local copy of the queryEvents helper (matches CrossFormDashboard's)
// ──────────────────────────────────────────────────────────────────────

interface SubmissionEvent {
  submission_id: string;
  submitter: string;
  anonymous: boolean;
}

async function queryEvents(
  fullnodeUrl: string,
  eventType: string,
  formId: string,
): Promise<SubmissionEvent[]> {
  const resp = await fetch(fullnodeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "suix_queryEvents",
      params: [
        {
          MoveEventField: {
            path: "/form_id",
            value: formId,
          },
        },
        null,
        500,
        true,
      ],
    }),
  });
  if (!resp.ok) return [];
  const json = (await resp.json()) as {
    result?: {
      data?: Array<{
        type?: string;
        parsedJson?: SubmissionEvent;
      }>;
    };
  };
  return (json.result?.data ?? [])
    .filter((e) => e.type === eventType)
    .map((e) => e.parsedJson)
    .filter((p): p is SubmissionEvent => !!p && !!p.submission_id);
}
