"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { motion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  ChevronDown,
  Clock,
  FileEdit,
  Globe,
  Inbox,
  Lock,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import { PrivacyTier, readJsonViaAggregator } from "@/lib/echo";
import type { FormMetadata } from "@/lib/echo";
import {
  TierDonut,
  TierLegend,
  SubmissionsBarList,
  MiniBars,
} from "./BentoCharts";
import { useDemoAdminMode } from "./DemoAdminToggle";
import { AuroraPlate, BrutalistButton, SuiDroplet } from "./FrameForms";

/**
 * Apple-bento-style overview that lives ABOVE the dense
 * CrossFormDashboard table on /dashboard. Asymmetric 12-col grid:
 *
 *   ┌──────────────────────┬────────┬────────┐
 *   │ hero stat (4×2)      │ tile   │ tile   │
 *   │                      │        │        │
 *   │                      ├────────┴────────┤
 *   │                      │ wide tile (4×1) │
 *   ├──────────┬───────────┴────────┬────────┤
 *   │ tile 2×1 │   tile 4×1         │ tile   │
 *   └──────────┴────────────────────┴────────┘
 *
 * Reuses the existing form-fetching pattern from CrossFormDashboard
 * (FormOwnerCap → form ids → getObjects + Walrus metadata) so the
 * data is consistent. Read-only — actions are deep-links into the
 * CrossFormDashboard table or per-form admin views.
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

interface BentoForm {
  id: string;
  title: string;
  onChain: OnChainForm;
}

const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
};

export function BentoDashboard() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;
  // Mirror CrossFormDashboard's ownerAddress + queryKey shape so all three
  // dashboard components share one TanStack cache. When demo admin toggle
  // is ON, substitute the project's demo address.
  const demoMode = useDemoAdminMode();
  const demoAddress = clientConfig.DEMO_ADMIN_ADDRESS;
  const ownerAddress = demoMode ? demoAddress : account?.address;

  const formsQuery = useQuery({
    queryKey: ["echo", "dashboard-forms", ownerAddress, demoMode],
    queryFn: async (): Promise<BentoForm[]> => {
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
      // Drop objects whose chain payload didn't deserialize — happens when
      // a referenced form was deleted, lives on a different network, or
      // hit a transient RPC error. Without this filter the downstream
      // reduce/map crashes on `f.onChain.submission_count`.
      const validObjects = fobjs.objects.filter(
        (obj) => !!(obj as { json?: unknown }).json,
      ) as unknown as Array<{ objectId: string; json: OnChainForm }>;
      const items = await Promise.all(
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
      return items;
    },
    enabled: !!ownerAddress && packageId.startsWith("0x"),
    staleTime: 30_000,
  });

  // Belt-and-suspenders: filter again at the consumer in case the query
  // cache returned a stale entry built before the queryFn started
  // dropping invalid onChain payloads.
  const forms = (formsQuery.data ?? []).filter(
    (f): f is BentoForm => !!f && !!f.onChain,
  );

  const stats = useMemo(() => {
    const totalSubs = forms.reduce(
      (acc, f) => acc + Number(f.onChain.submission_count ?? 0),
      0,
    );
    const tierCounts: Record<number, number> = {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
    };
    let openForms = 0;
    let encrypted = 0;
    for (const f of forms) {
      tierCounts[f.onChain.privacy_tier] =
        (tierCounts[f.onChain.privacy_tier] ?? 0) + 1;
      if (f.onChain.status === 1) openForms += 1;
      if (f.onChain.privacy_tier !== PrivacyTier.Public) encrypted += 1;
    }
    const encryptedRatio =
      forms.length > 0 ? Math.round((encrypted / forms.length) * 100) : 0;
    const recent = [...forms]
      .sort(
        (a, b) =>
          Number(b.onChain.created_ms ?? 0) - Number(a.onChain.created_ms ?? 0),
      )
      .slice(0, 3);
    return {
      formsCount: forms.length,
      totalSubs,
      openForms,
      encryptedRatio,
      tierCounts,
      recent,
    };
  }, [forms]);

  if (!ownerAddress) {
    return (
      <div className="grid grid-cols-1 gap-4 rounded-sm border border-border bg-card/30 p-8 sm:grid-cols-12">
        <div className="flex flex-col gap-4 sm:col-span-7">
          <span className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Sample dashboard
          </span>
          <h3 className="text-3xl font-medium tracking-tight text-foreground">
            Onchain feedback, decrypted.
          </h3>
          <p className="max-w-[460px] text-base text-muted-foreground">
            Connect a wallet, or toggle <span className="font-medium text-foreground">Demo admin</span> in the nav to load your dashboard. Below is a preview — donut, bar list, distribution sparkline, and quick actions.
          </p>
        </div>
        <div className="flex items-center justify-center sm:col-span-5">
          <TierDonut
            tierCounts={{ 0: 3, 1: 1, 2: 2, 3: 1, 4: 0 }}
            centerLabel="57%"
            centerSub="Encrypted"
          />
        </div>
        <div className="sm:col-span-12">
          <MiniBars values={[13, 4, 0, 6, 3, 3, 3]} height={56} />
        </div>
      </div>
    );
  }

  if (formsQuery.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
        {[8, 4, 4, 4, 4, 4, 4].map((cols, i) => (
          <div
            key={i}
            className={cn(
              "col-span-1 h-40 animate-pulse rounded-sm bg-muted/40 sm:col-span-12",
              cols === 8 && "sm:col-span-8 sm:row-span-2 sm:h-[336px]",
              cols === 4 && i > 0 && "sm:col-span-4",
            )}
          />
        ))}
      </div>
    );
  }

  if (forms.length === 0) {
    return (
      <AuroraPlate pose="haulout" className="min-h-[320px] p-8 sm:p-10">
        <div className="flex max-w-[420px] flex-col gap-4">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/70">
            <SuiDroplet size={10} /> Built on Sui
          </span>
          <h2 className="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
            Your dashboard is waiting on its first form.
          </h2>
          <p className="text-sm leading-relaxed text-foreground/70">
            Drag-drop builder, 5 privacy tiers, gas-sponsored submissions —
            about 90 seconds end to end.
          </p>
          <div className="pt-2">
            <BrutalistButton href="/forms/new" aurora size="md">
              <Plus size={14} strokeWidth={2.5} />
              Create your first form
            </BrutalistButton>
          </div>
        </div>
      </AuroraPlate>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
      {/* Hero stat — total submissions across every form (7×2) */}
      <BentoTile
        className="sm:col-span-7 sm:row-span-2"
        delay={0}
        gradient="from-blue-500/25 via-blue-500/8 to-transparent"
        glow="rgba(96,165,250,0.25)"
      >
        <div className="flex h-full flex-col justify-between gap-6 p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Total submissions
              </span>
              <span className="text-base text-muted-foreground">
                across every form you own
              </span>
            </div>
            <Inbox size={32} strokeWidth={1.5} className="text-foreground/40" />
          </div>
          <AnimatedCounter
            value={stats.totalSubs}
            className="text-[clamp(4.5rem,11vw,9rem)] font-medium leading-none tracking-tight text-foreground"
          />
          {/* Distribution sparkline */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <span>Distribution by form</span>
              <span className="tabular-nums">{forms.length} bars</span>
            </div>
            <MiniBars
              values={forms.map((f) => Number(f.onChain.submission_count ?? 0))}
              height={64}
            />
          </div>
          <div className="flex items-end justify-between gap-4">
            <span className="text-base text-muted-foreground">
              <span className="font-medium text-foreground">
                {stats.formsCount}
              </span>{" "}
              form{stats.formsCount === 1 ? "" : "s"} ·{" "}
              <span className="font-medium text-foreground">
                {stats.openForms}
              </span>{" "}
              open
            </span>
            <Link
              href="#triage"
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-foreground/20"
            >
              View all <ChevronDown size={14} />
            </Link>
          </div>
        </div>
      </BentoTile>

      {/* Privacy tier donut (5×1) */}
      <BentoTile
        className="sm:col-span-5"
        delay={0.05}
        gradient="from-violet-500/25 via-violet-500/8 to-transparent"
        glow="rgba(167,139,250,0.28)"
      >
        <div className="flex h-full flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Privacy tier mix
            </span>
            <Lock size={20} strokeWidth={1.75} className="text-foreground/65" />
          </div>
          <div className="flex items-center gap-5">
            <TierDonut
              tierCounts={stats.tierCounts}
              centerLabel={`${stats.encryptedRatio}%`}
              centerSub="Encrypted"
            />
            <TierLegend tierCounts={stats.tierCounts} className="flex-1" />
          </div>
        </div>
      </BentoTile>

      {/* Quick action — build new form (5×1) */}
      <BentoTile
        className="sm:col-span-5"
        delay={0.1}
        gradient="from-emerald-500/25 via-emerald-500/8 to-transparent"
        glow="rgba(52,211,153,0.28)"
      >
        <Link
          href="/forms/new"
          className="group flex h-full flex-col justify-between gap-4 p-6"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Quick action
            </span>
            <FileEdit
              size={20}
              strokeWidth={1.75}
              className="text-foreground/65"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-3xl font-medium tracking-tight text-foreground">
              Build a new form
            </span>
            <span className="text-base text-muted-foreground">
              Drag-drop · 5 templates · ✨ AI generator
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition group-hover:gap-2.5">
            Open builder <ArrowRight size={15} />
          </span>
        </Link>
      </BentoTile>

      {/* Top forms — horizontal bar list (full-width) */}
      <BentoTile className="sm:col-span-12" delay={0.15}>
        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Top forms by submissions
              </span>
              <span className="text-sm text-muted-foreground">
                Ranked across every form you own · color = privacy tier
              </span>
            </div>
            <Link
              href="/forms"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              All forms <ArrowRight size={14} />
            </Link>
          </div>
          <SubmissionsBarList
            items={[...forms]
              .sort(
                (a, b) =>
                  Number(b.onChain.submission_count ?? 0) -
                  Number(a.onChain.submission_count ?? 0),
              )
              .slice(0, 5)
              .map((f) => {
                const Icon = [Globe, Lock, Users, Clock, ShieldCheck][
                  f.onChain.privacy_tier
                ];
                return {
                  id: f.id,
                  title: f.title,
                  value: Number(f.onChain.submission_count ?? 0),
                  tier: f.onChain.privacy_tier,
                  icon: Icon,
                  href: `/forms/${f.id}/admin`,
                };
              })}
          />
        </div>
      </BentoTile>

      {/* Insights CTA (4×1) */}
      <BentoTile
        className="sm:col-span-4"
        delay={0.2}
        gradient="from-amber-500/25 via-amber-500/8 to-transparent"
        glow="rgba(251,191,36,0.26)"
      >
        <Link
          href="/insights"
          className="group flex h-full flex-col justify-between gap-4 p-6"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Memwal RAG
            </span>
            <Brain size={20} strokeWidth={1.75} className="text-foreground/65" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-2xl font-medium tracking-tight text-foreground">
              Ask your forms
            </span>
            <span className="text-base text-muted-foreground">
              &ldquo;Top 3 complaints this week?&rdquo;
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground transition group-hover:gap-2.5">
            Open Insights <ArrowUpRight size={14} />
          </span>
        </Link>
      </BentoTile>

      {/* Reputation CTA (4×1) */}
      <BentoTile
        className="sm:col-span-4"
        delay={0.25}
        gradient="from-rose-500/25 via-rose-500/8 to-transparent"
        glow="rgba(251,113,133,0.26)"
      >
        <Link
          href="/reputation"
          className="group flex h-full flex-col justify-between gap-4 p-6"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Reputation
            </span>
            <ShieldCheck
              size={20}
              strokeWidth={1.75}
              className="text-foreground/65"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-2xl font-medium tracking-tight text-foreground">
              Soulbound badges
            </span>
            <span className="text-base text-muted-foreground">
              Credit tickets to top responders
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground transition group-hover:gap-2.5">
            Open Reputation <ArrowUpRight size={14} />
          </span>
        </Link>
      </BentoTile>

      {/* Stack badge (4×1) */}
      <BentoTile
        className="sm:col-span-4"
        delay={0.3}
        gradient="from-cyan-500/25 via-cyan-500/8 to-transparent"
        glow="rgba(34,211,238,0.26)"
      >
        <div className="flex h-full flex-col justify-between gap-4 p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Stack
            </span>
            <Zap size={20} strokeWidth={1.75} className="text-foreground/65" />
          </div>
          <div className="flex flex-wrap gap-2">
            {["Sui", "Walrus", "Seal", "Memwal", "Enoki"].map((s) => (
              <span
                key={s}
                className="rounded-full border border-border bg-background/40 px-3 py-1.5 text-sm font-medium text-foreground/80"
              >
                {s}
              </span>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            Five primitives, end-to-end on testnet.
          </span>
        </div>
      </BentoTile>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  Pieces
// ──────────────────────────────────────────────────────────────────────

/**
 * Bento tile — now with spring hover-lift, tier-tinted glow on hover,
 * and a soft conic gradient ring that breathes on hover. The gradient
 * fill underneath is the SAME pattern as before so each tile keeps its
 * accent identity (blue hero, violet privacy, etc.).
 */
function BentoTile({
  children,
  className,
  delay = 0,
  gradient,
  glow = "rgba(255,255,255,0.10)",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  gradient?: string;
  /** Tier-matched shadow color for the hover lift. */
  glow?: string;
}) {
  // Frame Tile — hairline rail + paper surface. The tier gradient + conic
  // ribbon + tinted shadow are dropped in favor of a single foreground-
  // weighted lift on hover. The `gradient` and `glow` props are kept on
  // the type so callers don't need rewiring, but they're intentionally
  // ignored: Frame keeps every tile visually identical so the eye lands
  // on numbers, not surfaces.
  void gradient;
  void glow;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group relative overflow-hidden rounded-sm border border-foreground/15 bg-card transition-colors duration-300 hover:border-foreground/40",
        className,
      )}
    >
      <div className="relative z-10 flex h-full flex-col">{children}</div>
    </motion.div>
  );
}

const tierLabels = [
  { label: "Public", color: "text-foreground/65" },
  { label: "Admin", color: "text-foreground/65" },
  { label: "M-of-N", color: "text-foreground/65" },
  { label: "Time", color: "text-foreground/65" },
  { label: "Cond", color: "text-foreground/65" },
];


/**
 * Animate a number from 0 to `value` over ~800ms using easing —
 * adds a satisfying "stat reveal" moment when the dashboard loads.
 */
function AnimatedCounter({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      setDisplay(value);
      return;
    }
    startedRef.current = true;
    const duration = 800;
    const startTime = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span className={className}>
      <span className="tabular-nums">{display.toLocaleString()}</span>
    </span>
  );
}
