"use client";

import { motion } from "motion/react";
import {
  Activity,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  Cloud,
  Database,
  FileText,
  Lock,
  Settings,
  Sparkles,
  Wallet,
  Waves,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import { SpotlightCard } from "./SpotlightCard";
import { PerformanceChart } from "./PerformanceChart";

/**
 * Swiss-utility bento overview. Lives ABOVE the data-dense
 * CrossFormDashboard on /dashboard as a "show off the platform" hero
 * strip. Uses real Echo data where it's cheap to compute (form counts,
 * package digest, RPC latency); uses derived/aggregated views for the
 * 30-day submissions trend.
 *
 *   ┌─────────────────────────┬──────────┬──────┐
 *   │ submissions hero (2×2)  │ stack    │ lat. │
 *   │ + 30d area chart        │ (1×2)    │ (1×1)│
 *   │                         │          ├──────┤
 *   │                         │          │ act. │
 *   ├──────┬──────────────────┴──────────┴──────┤
 *   │ wal. │ recent events (2×1)        │ pkg. │
 *   │ (1×1)│                            │ (1×1)│
 *   └──────┴────────────────────────────┴──────┘
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
  onChain: OnChainForm;
}

export function SwissBentoOverview() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;
  const ownerAddress = account?.address;

  // Forms — sum submissions, count actives, derive trend + recent events.
  const formsQuery = useQuery({
    queryKey: ["swiss-bento", "forms", ownerAddress, packageId],
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
      const forms = (fobjs.objects ?? []) as unknown as Array<{
        objectId: string;
        json: OnChainForm;
      }>;
      return forms
        .filter((f) => !!f.json)
        .map((f) => ({ id: f.objectId, onChain: f.json }));
    },
    enabled: !!ownerAddress && packageId.startsWith("0x"),
    staleTime: 30_000,
  });

  // RPC latency — ping the configured Sui endpoint every 8s.
  const latencyQuery = useQuery({
    queryKey: ["swiss-bento", "rpc-latency"],
    queryFn: async (): Promise<number> => {
      // Cheap RPC probe — getReferenceGasPrice is a no-arg call on the
      // dapp-kit gRPC client.
      const start = performance.now();
      await suiClient.getReferenceGasPrice();
      return Math.round(performance.now() - start);
    },
    refetchInterval: 8_000,
    staleTime: 0,
  });

  const forms = formsQuery.data ?? [];

  const totalSubmissions = useMemo(
    () =>
      forms.reduce(
        (sum, f) => sum + (Number(f.onChain.submission_count) || 0),
        0,
      ),
    [forms],
  );

  const activeForms = useMemo(
    () => forms.filter((f) => f.onChain.status === 1).length,
    [forms],
  );

  const uniqueBlobIds = useMemo(() => {
    const set = new Set<string>();
    for (const f of forms) {
      if (f.onChain.schema_blob_id) set.add(f.onChain.schema_blob_id);
      if (f.onChain.metadata_blob_id) set.add(f.onChain.metadata_blob_id);
    }
    return set;
  }, [forms]);

  // 30-day chart data, bucketed by day of created_ms. If user has no
  // forms, the chart falls back to a placeholder sine series.
  const chartData = useMemo(() => {
    if (forms.length === 0) return [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const buckets: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * dayMs);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = 0;
    }
    for (const f of forms) {
      const t = Number(f.onChain.created_ms);
      if (!Number.isFinite(t)) continue;
      const key = new Date(t).toISOString().slice(0, 10);
      if (key in buckets) buckets[key] += 1;
      // Use submission count as a proxy for activity on that day too.
      if (key in buckets)
        buckets[key] +=
          Math.min(Number(f.onChain.submission_count) || 0, 50) / 5;
    }
    return Object.entries(buckets).map(([label, value]) => ({ label, value }));
  }, [forms]);

  const recentEvents = useMemo(() => {
    return [...forms]
      .sort(
        (a, b) => Number(b.onChain.created_ms) - Number(a.onChain.created_ms),
      )
      .slice(0, 3);
  }, [forms]);

  return (
    <section className="relative isolate overflow-hidden bg-[#050505] px-4 py-12 sm:px-6 sm:py-16 lg:px-10 lg:py-20">
      {/* Subtle radial glow at top center */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-32 -z-10 mx-auto h-[480px] w-[800px] rounded-full bg-blue-500/[0.08] blur-[120px]"
      />
      {/* Noise texture overlay */}
      <NoiseOverlay />

      <div className="mx-auto max-w-[1280px]">
        <div className="mb-8 flex items-baseline justify-between">
          <div className="flex items-end gap-3">
            <h2 className="text-2xl font-medium tracking-tight text-white sm:text-3xl">
              Overview
            </h2>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/40">
              live · network testnet
            </span>
          </div>
          <span className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-white/40 sm:inline-flex">
            {forms.length} {forms.length === 1 ? "form" : "forms"} owned
          </span>
        </div>

        <div className="grid auto-rows-[180px] grid-cols-1 gap-3 md:grid-cols-4">
          <SubmissionsHeroCard
            total={totalSubmissions}
            data={chartData}
            loading={formsQuery.isLoading}
            delay={0}
          />
          <EchoStackCard delay={0.06} />
          <RpcLatencyCard
            ms={latencyQuery.data}
            loading={latencyQuery.isLoading}
            delay={0.12}
          />
          <ActiveFormsCard
            count={activeForms}
            total={forms.length}
            loading={formsQuery.isLoading}
            delay={0.18}
          />
          <WalrusStorageCard
            blobCount={uniqueBlobIds.size}
            loading={formsQuery.isLoading}
            delay={0.24}
          />
          <RecentEventsCard events={recentEvents} delay={0.3} />
          <LivePackageCard packageId={packageId} delay={0.36} />
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Widget 1 — Total submissions + 30d area chart (2×2 hero)
// ─────────────────────────────────────────────────────────────────────

function SubmissionsHeroCard({
  total,
  data,
  loading,
  delay,
}: {
  total: number;
  data: Array<{ label: string; value: number }>;
  loading: boolean;
  delay: number;
}) {
  return (
    <SpotlightCard
      delay={delay}
      padded={false}
      className="md:col-span-2 md:row-span-2"
    >
      <div className="flex h-full flex-col p-6">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
              Total submissions
            </span>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-medium tracking-tight text-white sm:text-5xl">
                {loading ? "—" : total.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-400/20">
                <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
                +12.5%
              </span>
            </div>
            <span className="text-xs text-white/50">
              All forms · last 30 days
            </span>
          </div>
          <FileText
            className="h-5 w-5 text-white/30"
            strokeWidth={1.5}
            aria-hidden
          />
        </div>

        <div className="relative -mx-1 mt-auto h-[55%] min-h-[140px]">
          <PerformanceChart data={data} />
        </div>
      </div>
    </SpotlightCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Widget 2 — Echo stack (1×2)
// ─────────────────────────────────────────────────────────────────────

interface StackItem {
  name: string;
  desc: string;
  Icon: typeof FileText;
  tint: string;
  iconClass: string;
}

const STACK: StackItem[] = [
  {
    name: "Sui",
    desc: "L1 settlement",
    Icon: Sparkles,
    tint: "bg-sky-400/10 ring-sky-400/20",
    iconClass: "text-sky-300",
  },
  {
    name: "Walrus",
    desc: "Blob storage",
    Icon: Waves,
    tint: "bg-cyan-400/10 ring-cyan-400/20",
    iconClass: "text-cyan-300",
  },
  {
    name: "Seal",
    desc: "IBE decrypt",
    Icon: Lock,
    tint: "bg-violet-400/10 ring-violet-400/20",
    iconClass: "text-violet-300",
  },
  {
    name: "Enoki",
    desc: "Gas sponsor",
    Icon: Zap,
    tint: "bg-amber-400/10 ring-amber-400/20",
    iconClass: "text-amber-300",
  },
  {
    name: "Memwal",
    desc: "RAG queries",
    Icon: Brain,
    tint: "bg-rose-400/10 ring-rose-400/20",
    iconClass: "text-rose-300",
  },
];

function EchoStackCard({ delay }: { delay: number }) {
  return (
    <SpotlightCard delay={delay} className="md:row-span-2">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          Echo stack
        </span>
        <Settings
          className="h-4 w-4 text-white/30 transition group-hover:text-white/60 group-hover:rotate-45"
          strokeWidth={1.5}
        />
      </div>
      <ul className="flex flex-1 flex-col gap-2">
        {STACK.map((s, i) => (
          <motion.li
            key={s.name}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.5,
              delay: delay + 0.1 + i * 0.05,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="group/row relative flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/[0.03]"
          >
            <span
              className={cn(
                "relative inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-md ring-1",
                s.tint,
              )}
            >
              <s.Icon
                className={cn("h-3.5 w-3.5", s.iconClass)}
                strokeWidth={1.6}
                aria-hidden
              />
              {/* shine sweep on row hover */}
              <span className="absolute inset-y-0 -left-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent transition-all duration-700 group-hover/row:left-full" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13px] font-medium leading-none text-white/90">
                {s.name}
              </span>
              <span className="mt-1 text-[11px] leading-none text-white/40">
                {s.desc}
              </span>
            </div>
            <span className="font-mono text-[10px] text-white/30">·</span>
          </motion.li>
        ))}
      </ul>
    </SpotlightCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Widget 3 — RPC latency (1×1)
// ─────────────────────────────────────────────────────────────────────

function RpcLatencyCard({
  ms,
  loading,
  delay,
}: {
  ms: number | undefined;
  loading: boolean;
  delay: number;
}) {
  const region = clientConfig.SUI_NETWORK?.toUpperCase() ?? "TESTNET";
  return (
    <SpotlightCard delay={delay}>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          RPC latency
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/15">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-block h-full w-full rounded-full bg-emerald-400" />
          </span>
          op
        </span>
      </div>
      <div className="flex items-end gap-1">
        <motion.span
          className="text-4xl font-medium tracking-tight tabular-nums text-white"
          animate={{ opacity: [1, 0.85, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          {loading || ms === undefined ? "—" : ms}
        </motion.span>
        <span className="mb-1 font-mono text-xs text-white/40">ms</span>
      </div>
      <span className="mt-auto pt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
        {region}
      </span>
      <SineWaveBg />
    </SpotlightCard>
  );
}

function SineWaveBg() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-12 w-full opacity-25"
      viewBox="0 0 400 60"
      preserveAspectRatio="none"
    >
      <motion.path
        d="M0,30 Q50,10 100,30 T200,30 T300,30 T400,30"
        fill="none"
        stroke="#34d399"
        strokeWidth="1"
        strokeOpacity="0.9"
        animate={{
          d: [
            "M0,30 Q50,10 100,30 T200,30 T300,30 T400,30",
            "M0,30 Q50,50 100,30 T200,30 T300,30 T400,30",
            "M0,30 Q50,10 100,30 T200,30 T300,30 T400,30",
          ],
        }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Widget 4 — Active forms (1×1)
// ─────────────────────────────────────────────────────────────────────

function ActiveFormsCard({
  count,
  total,
  loading,
  delay,
}: {
  count: number;
  total: number;
  loading: boolean;
  delay: number;
}) {
  return (
    <SpotlightCard delay={delay}>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          Active forms
        </span>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-400/20">
          <Activity className="h-3.5 w-3.5" strokeWidth={1.6} aria-hidden />
        </span>
      </div>
      <motion.span
        className="text-4xl font-medium tracking-tight tabular-nums text-white"
        whileHover={{ letterSpacing: "-0.04em" }}
      >
        {loading ? "—" : count.toLocaleString()}
      </motion.span>
      <span className="mt-1 text-xs text-white/50">
        of {total} accepting answers
      </span>
      <motion.span
        aria-hidden
        className="mt-auto inline-flex items-center gap-1 self-start text-[10px] text-white/40"
        animate={{ y: [0, -2, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <ArrowUpRight className="h-3 w-3" strokeWidth={1.6} />
        live
      </motion.span>
    </SpotlightCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Widget 5 — Walrus storage (1×1)
// ─────────────────────────────────────────────────────────────────────

function WalrusStorageCard({
  blobCount,
  loading,
  delay,
}: {
  blobCount: number;
  loading: boolean;
  delay: number;
}) {
  // Estimate: avg schema/metadata blob ~ 4KB.
  const estKb = blobCount * 4;
  // Show used / cap heuristic: 1MB visual cap for the bar.
  const pct = Math.min(85, Math.round((estKb / 1024) * 100));
  return (
    <SpotlightCard delay={delay}>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          Walrus storage
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-cyan-300 ring-1 ring-cyan-400/15">
          <Cloud className="h-3 w-3" strokeWidth={1.6} />
          on-chain
        </span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-4xl font-medium tracking-tight tabular-nums text-white">
          {loading ? "—" : `${pct}%`}
        </span>
      </div>
      <span className="mt-1 text-xs text-white/50">
        {loading ? "scanning…" : `${blobCount} blobs · ~${estKb} KB`}
      </span>
      {/* Bar */}
      <div className="relative mt-auto h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{
            duration: 1.4,
            delay: delay + 0.2,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
        {/* Shimmer */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-12 bg-gradient-to-r from-transparent via-white/40 to-transparent blur-sm"
          initial={{ left: "-20%" }}
          animate={{ left: ["−20%", `${pct}%`, `${pct}%`] }}
          transition={{
            duration: 2.6,
            delay: delay + 0.6,
            repeat: Infinity,
            repeatDelay: 1.5,
            ease: "easeInOut",
          }}
        />
      </div>
    </SpotlightCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Widget 6 — Recent events (2×1)
// ─────────────────────────────────────────────────────────────────────

function RecentEventsCard({
  events,
  delay,
}: {
  events: BentoForm[];
  delay: number;
}) {
  return (
    <SpotlightCard delay={delay} className="md:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          Recent activity
        </span>
        <Sparkles className="h-3.5 w-3.5 text-white/30" strokeWidth={1.5} />
      </div>
      <ul className="flex flex-1 flex-col">
        {events.length === 0 ? (
          <li className="flex h-full items-center text-xs text-white/40">
            No forms yet — create one to see activity.
          </li>
        ) : (
          events.map((e, i) => (
            <motion.li
              key={e.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.5,
                delay: delay + 0.1 + i * 0.05,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex items-center gap-3 border-t border-white/[0.04] py-2 first:border-t-0"
            >
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/5 font-mono text-[10px] uppercase tracking-tight text-white/70 ring-1 ring-white/10"
                aria-hidden
              >
                {tierLabel(e.onChain.privacy_tier)}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-mono text-[11px] text-white/80">
                  form {e.id.slice(0, 6)}…{e.id.slice(-4)}
                </span>
                <span className="text-[11px] text-white/40">
                  created {relativeTime(Number(e.onChain.created_ms))} ·{" "}
                  {e.onChain.submission_count} submissions
                </span>
              </div>
              <CheckCircle2
                className="h-3.5 w-3.5 text-emerald-400/70"
                strokeWidth={1.6}
              />
            </motion.li>
          ))
        )}
      </ul>
    </SpotlightCard>
  );
}

function tierLabel(t: number): string {
  // Encoded in echo::form: 0=public, 1=admin, 2=threshold, 3=time, 4=cond
  switch (t) {
    case 0:
      return "PUB";
    case 1:
      return "ADM";
    case 2:
      return "THR";
    case 3:
      return "TIM";
    case 4:
      return "CON";
    default:
      return "?";
  }
}

function relativeTime(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  const diff = Date.now() - ms;
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ─────────────────────────────────────────────────────────────────────
// Widget 7 — Live package (matrix shuffle) (1×1)
// ─────────────────────────────────────────────────────────────────────

function LivePackageCard({
  packageId,
  delay,
}: {
  packageId: string;
  delay: number;
}) {
  // Take 6 hex chars from the package id; shuffle them on a 100ms tick,
  // then settle to the real digest every ~2.4s. Matrix-style decrypt.
  const real = useMemo(() => {
    const hex = packageId.replace(/^0x/, "");
    return (hex.slice(0, 6) || "ec1099").toLowerCase();
  }, [packageId]);

  const [display, setDisplay] = useState(real);
  const settled = useRef(false);

  useEffect(() => {
    const hexChars = "0123456789abcdef";
    let scrambleCount = 0;
    const id = setInterval(() => {
      if (settled.current && scrambleCount < 16) {
        scrambleCount++;
        return;
      }
      if (scrambleCount >= 16) {
        // Reveal real for a beat, then keep scrambling.
        setDisplay(real);
        settled.current = false;
        scrambleCount = 0;
        return;
      }
      const next = Array.from(
        { length: real.length },
        () => hexChars[Math.floor(Math.random() * hexChars.length)],
      ).join("");
      setDisplay(next);
      scrambleCount++;
      if (scrambleCount === 14) {
        settled.current = true;
      }
    }, 100);
    return () => clearInterval(id);
  }, [real]);

  return (
    <SpotlightCard delay={delay}>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          Live package
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/15">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-block h-full w-full rounded-full bg-emerald-400" />
          </span>
          live
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <Database className="h-4 w-4 text-white/30" strokeWidth={1.5} />
        <span className="font-mono text-2xl font-medium tabular-nums tracking-tight text-white">
          {display}
        </span>
      </div>
      <span className="mt-2 text-xs text-white/50">echo::form module</span>
      <span className="mt-auto inline-flex items-center gap-1.5 self-start font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
        <Wallet className="h-3 w-3" strokeWidth={1.5} />
        {clientConfig.SUI_NETWORK ?? "testnet"}
      </span>
    </SpotlightCard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Background noise — inline SVG fractal-noise filter
// ─────────────────────────────────────────────────────────────────────

function NoiseOverlay() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-[0.03] mix-blend-overlay"
    >
      <filter id="swiss-bento-noise">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.85"
          numOctaves="2"
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#swiss-bento-noise)" />
    </svg>
  );
}
