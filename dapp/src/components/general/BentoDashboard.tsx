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
  const ownerAddress = account?.address;

  const formsQuery = useQuery({
    queryKey: ["echo", "bento-forms", ownerAddress, packageId],
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

  const forms = formsQuery.data ?? [];

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
      <div className="rounded-2xl border border-border bg-muted/40 p-12 text-center">
        <Inbox
          size={28}
          className="mx-auto text-muted-foreground"
          strokeWidth={1.5}
        />
        <p className="mt-4 text-sm text-muted-foreground">
          Connect a wallet to see your dashboard.
        </p>
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
              "col-span-1 h-40 animate-pulse rounded-2xl bg-muted/40 sm:col-span-12",
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
      <div className="flex flex-col gap-6 rounded-2xl border-2 border-dashed border-border bg-muted/20 p-12 text-center">
        <Sparkles
          size={28}
          className="mx-auto text-muted-foreground"
          strokeWidth={1.5}
        />
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-medium tracking-tight text-foreground">
            No forms yet
          </h2>
          <p className="text-sm text-muted-foreground">
            Create your first form to start collecting feedback. Drag-drop
            builder, 5 privacy tiers, gas-sponsored submissions.
          </p>
        </div>
        <Link
          href="/forms/new"
          className="mx-auto inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90"
        >
          <Plus size={16} /> Create your first form
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
      {/* Hero stat — total submissions across every form (4×2) */}
      <BentoTile
        className="sm:col-span-7 sm:row-span-2"
        delay={0}
        gradient="from-blue-500/20 via-blue-500/5 to-transparent"
      >
        <div className="flex h-full flex-col justify-between gap-6 p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Total submissions
              </span>
              <span className="text-sm text-muted-foreground">
                across every form you own
              </span>
            </div>
            <Inbox size={28} strokeWidth={1.5} className="text-foreground/40" />
          </div>
          <AnimatedCounter
            value={stats.totalSubs}
            className="text-[clamp(4rem,10vw,8rem)] font-medium leading-none tracking-tight text-foreground"
          />
          <div className="flex items-end justify-between gap-4">
            <span className="text-sm text-muted-foreground">
              <span className="text-foreground">{stats.formsCount}</span> form
              {stats.formsCount === 1 ? "" : "s"} ·{" "}
              <span className="text-foreground">{stats.openForms}</span> open
            </span>
            <Link
              href="#triage"
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-foreground/20"
            >
              View all <ChevronDown size={12} />
            </Link>
          </div>
        </div>
      </BentoTile>

      {/* Encryption ratio (3×1) */}
      <BentoTile
        className="sm:col-span-5"
        delay={0.05}
        gradient="from-violet-500/20 via-violet-500/5 to-transparent"
      >
        <div className="flex h-full flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Privacy tier mix
            </span>
            <Lock size={18} strokeWidth={1.75} className="text-violet-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-medium tracking-tight text-foreground">
              {stats.encryptedRatio}%
            </span>
            <span className="text-sm text-muted-foreground">encrypted</span>
          </div>
          {/* Stacked bar of tier mix */}
          <TierBar tierCounts={stats.tierCounts} total={stats.formsCount} />
          <div className="grid grid-cols-5 gap-1 text-[10px]">
            {tierLabels.map((t, i) => (
              <div key={t.label} className="flex flex-col items-center gap-0.5">
                <span className="text-foreground tabular-nums">
                  {stats.tierCounts[i] ?? 0}
                </span>
                <span className={cn("text-center", t.color)}>{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      </BentoTile>

      {/* Quick action — build new form (3×1) */}
      <BentoTile
        className="sm:col-span-5"
        delay={0.1}
        gradient="from-emerald-500/20 via-emerald-500/5 to-transparent"
      >
        <Link
          href="/forms/new"
          className="group flex h-full flex-col justify-between gap-4 p-6"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Quick action
            </span>
            <FileEdit
              size={18}
              strokeWidth={1.75}
              className="text-emerald-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-2xl font-medium tracking-tight text-foreground">
              Build a new form
            </span>
            <span className="text-sm text-muted-foreground">
              Drag-drop · 5 templates · ✨ AI generator
            </span>
          </div>
          <span className="inline-flex items-center gap-1 self-start rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background transition group-hover:gap-2">
            Open builder <ArrowRight size={14} />
          </span>
        </Link>
      </BentoTile>

      {/* Recent forms list (full-width) */}
      <BentoTile className="sm:col-span-12" delay={0.15}>
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Recent forms
            </span>
            <Link
              href="/forms"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              All forms <ArrowRight size={12} />
            </Link>
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {stats.recent.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <TierIcon tier={f.onChain.privacy_tier} />
                  <Link
                    href={`/forms/${f.id}/admin`}
                    className="truncate font-medium text-foreground hover:underline"
                  >
                    {f.title}
                  </Link>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {tierLabels[f.onChain.privacy_tier]?.label ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="tabular-nums text-foreground">
                    {f.onChain.submission_count}
                  </span>
                  <span>responses</span>
                  <Link
                    href={`/forms/${f.id}/admin`}
                    className="rounded-full border border-border px-3 py-1 text-foreground hover:bg-accent"
                  >
                    Open
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </BentoTile>

      {/* Insights CTA (3×1) */}
      <BentoTile
        className="sm:col-span-4"
        delay={0.2}
        gradient="from-amber-500/20 via-amber-500/5 to-transparent"
      >
        <Link
          href="/insights"
          className="group flex h-full flex-col justify-between gap-4 p-6"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Memwal RAG
            </span>
            <Brain size={18} strokeWidth={1.75} className="text-amber-400" />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xl font-medium tracking-tight text-foreground">
              Ask your forms
            </span>
            <span className="text-sm text-muted-foreground">
              &ldquo;What are the top 3 complaints this week?&rdquo;
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-foreground transition group-hover:gap-2">
            Open Insights <ArrowUpRight size={12} />
          </span>
        </Link>
      </BentoTile>

      {/* Reputation CTA (3×1) */}
      <BentoTile
        className="sm:col-span-4"
        delay={0.25}
        gradient="from-rose-500/20 via-rose-500/5 to-transparent"
      >
        <Link
          href="/reputation"
          className="group flex h-full flex-col justify-between gap-4 p-6"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Reputation
            </span>
            <ShieldCheck
              size={18}
              strokeWidth={1.75}
              className="text-rose-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xl font-medium tracking-tight text-foreground">
              Soulbound badges
            </span>
            <span className="text-sm text-muted-foreground">
              Issue credit tickets to top responders
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-xs text-foreground transition group-hover:gap-2">
            Open Reputation <ArrowUpRight size={12} />
          </span>
        </Link>
      </BentoTile>

      {/* Stack badge (3×1) */}
      <BentoTile
        className="sm:col-span-4"
        delay={0.3}
        gradient="from-cyan-500/20 via-cyan-500/5 to-transparent"
      >
        <div className="flex h-full flex-col justify-between gap-4 p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Stack
            </span>
            <Zap size={18} strokeWidth={1.75} className="text-cyan-400" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["Sui", "Walrus", "Seal", "Memwal", "Enoki"].map((s) => (
              <span
                key={s}
                className="rounded-full border border-border bg-background/40 px-2.5 py-1 text-[11px] font-medium text-foreground/80"
              >
                {s}
              </span>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            Built on five primitives, all working end-to-end on testnet.
          </span>
        </div>
      </BentoTile>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  Pieces
// ──────────────────────────────────────────────────────────────────────

function BentoTile({
  children,
  className,
  delay = 0,
  gradient,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  gradient?: string;
}) {
  return (
    <motion.div
      {...fadeIn}
      transition={{ ...fadeIn.transition, delay }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border bg-card transition hover:border-foreground/20",
        className,
      )}
    >
      {gradient && (
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60 transition group-hover:opacity-100",
            gradient,
          )}
          aria-hidden="true"
        />
      )}
      <div className="relative z-10 flex h-full flex-col">{children}</div>
    </motion.div>
  );
}

const tierLabels = [
  { label: "Public", color: "text-emerald-400" },
  { label: "Admin", color: "text-blue-400" },
  { label: "M-of-N", color: "text-violet-400" },
  { label: "Time", color: "text-amber-400" },
  { label: "Cond", color: "text-rose-400" },
];

const tierBarColors = [
  "bg-emerald-400",
  "bg-blue-400",
  "bg-violet-400",
  "bg-amber-400",
  "bg-rose-400",
];

function TierBar({
  tierCounts,
  total,
}: {
  tierCounts: Record<number, number>;
  total: number;
}) {
  if (total === 0) {
    return <div className="h-2 rounded-full bg-muted" />;
  }
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
      {[0, 1, 2, 3, 4].map((tier) => {
        const count = tierCounts[tier] ?? 0;
        const pct = (count / total) * 100;
        if (pct === 0) return null;
        return (
          <div
            key={tier}
            className={cn("h-full transition-all", tierBarColors[tier])}
            style={{ width: `${pct}%` }}
            title={`${tierLabels[tier]?.label}: ${count}`}
          />
        );
      })}
    </div>
  );
}

function TierIcon({ tier }: { tier: number }) {
  const Icon = [Globe, Lock, Users, Clock, ShieldCheck][tier] ?? Globe;
  const colorClass = tierLabels[tier]?.color ?? "text-foreground";
  return (
    <Icon size={16} strokeWidth={1.75} className={cn("shrink-0", colorClass)} />
  );
}

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
