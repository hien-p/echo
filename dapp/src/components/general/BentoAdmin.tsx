"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight,
  Database,
  Inbox,
  Lock,
  ShieldCheck,
  Sparkles,
  Webhook,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TIER_META } from "@/components/shell/TierChip";
import { MotionTile } from "@/components/shell";

/**
 * Apple-bento overview at the top of /forms/[id]/admin.
 *
 * Sits below SynexHero, above the existing FormAdmin scroll. Gives
 * the admin a one-screen status snapshot before they dive into the
 * detail of the submissions table:
 *
 *   ┌──────────────┬───────────────┬────────────┐
 *   │ HERO STAT    │ TIER STATE    │ SHARE LINK │
 *   │ (4×2)        │ (4×1)         │ (4×1)      │
 *   │              ├───────────────┼────────────┤
 *   │              │ APPROVALS     │ BOUNTY     │
 *   │              │ (4×1)         │ (4×1)      │
 *   ├──────────────┴───────┬───────┴────────────┤
 *   │ MEMWAL INDEX (6×1)   │ WEBHOOK (6×1)      │
 *   └──────────────────────┴────────────────────┘
 *
 * All data is passed in as props — this component is read-only and
 * doesn't run its own queries. Wires into FormAdmin's already-fetched
 * formQuery / approvalsQuery / indexAllMutation state via props.
 */

interface BentoAdminProps {
  formId: string;
  submissionCount: number;
  decryptedCount: number;
  privacyTier: number;
  status: number;
  // Tier-specific state
  thresholdN?: number;
  thresholdM?: number;
  approvalCount?: number;
  unlockMs?: string;
  // External state pulled from existing FormAdmin queries
  bountyPoolBalanceMist?: bigint;
  bountyPoolCount?: number;
  webhookUrl?: string | null;
  webhookLastFireOk?: boolean | null;
  indexedToMemwal?: boolean;
}

const STATUS_LABELS: Record<number, string> = {
  1: "Open",
  2: "Closed",
  3: "Archived",
};

export function BentoAdmin({
  formId,
  submissionCount,
  decryptedCount,
  privacyTier,
  status,
  thresholdN,
  thresholdM,
  approvalCount,
  unlockMs,
  bountyPoolBalanceMist,
  bountyPoolCount = 0,
  webhookUrl,
  webhookLastFireOk,
  indexedToMemwal,
}: BentoAdminProps) {
  const tierMeta = TIER_META[privacyTier] ?? TIER_META[0];
  const StatusIcon = tierMeta.icon;

  const decryptedPct =
    submissionCount > 0
      ? Math.round((decryptedCount / submissionCount) * 100)
      : 0;

  const SCALE = BigInt(1_000_000_000);
  const bountyTotalSui =
    bountyPoolBalanceMist !== undefined
      ? Number(bountyPoolBalanceMist / SCALE) +
        Number(bountyPoolBalanceMist % SCALE) / 1e9
      : 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
      {/* === Hero stat: total submissions (col-span 7, row-span 2) === */}
      <MotionTile
        className="sm:col-span-7 sm:row-span-2"
        delay={0}
        gradient="from-blue-500/15 via-blue-500/5 to-transparent"
      >
        <div className="flex h-full flex-col justify-between gap-6 p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Total submissions
              </span>
              <span className="text-sm text-muted-foreground">
                across this form
              </span>
            </div>
            <Inbox size={28} strokeWidth={1.5} className="text-foreground/40" />
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-[clamp(4rem,10vw,8rem)] font-medium leading-none tracking-tight tabular-nums text-foreground">
              {submissionCount.toLocaleString()}
            </span>
            {decryptedCount > 0 && (
              <span className="text-sm text-muted-foreground">
                · <span className="text-emerald-500">{decryptedCount}</span>{" "}
                decrypted ({decryptedPct}%)
              </span>
            )}
          </div>
          <div className="flex items-end justify-between gap-4">
            <span className="text-sm text-muted-foreground">
              status ·{" "}
              <span className="text-foreground">
                {STATUS_LABELS[status] ?? "unknown"}
              </span>
            </span>
            <Link
              href={`/forms/${formId}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground/10 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-foreground/20"
            >
              View live form <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </MotionTile>

      {/* === Tier state (col-span 5) === */}
      <MotionTile
        className="sm:col-span-5"
        delay={0.05}
        gradient="from-violet-500/15 via-violet-500/5 to-transparent"
      >
        <div className="flex h-full flex-col justify-between gap-3 p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Privacy tier
            </span>
            <StatusIcon
              size={18}
              strokeWidth={1.75}
              className={tierMeta.color}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-2xl font-medium tracking-tight text-foreground">
              {tierMeta.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {tierDescription(privacyTier)}
            </span>
          </div>
          {privacyTier === 3 && unlockMs && (
            <UnlockCountdown unlockMs={unlockMs} />
          )}
        </div>
      </MotionTile>

      {/* === Approvals (col-span 5) — only relevant for Threshold === */}
      <MotionTile
        className="sm:col-span-5"
        delay={0.1}
        gradient="from-amber-500/15 via-amber-500/5 to-transparent"
      >
        <div className="flex h-full flex-col justify-between gap-3 p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {privacyTier === 2 ? "Threshold approvals" : "Decrypt state"}
            </span>
            <ShieldCheck
              size={18}
              strokeWidth={1.75}
              className="text-amber-500"
            />
          </div>
          {privacyTier === 2 &&
          thresholdN !== undefined &&
          thresholdM !== undefined ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-medium tracking-tight tabular-nums text-foreground">
                  {approvalCount ?? 0}
                </span>
                <span className="text-base text-muted-foreground">
                  / {thresholdN} approvals needed
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{
                    width: `${Math.min(100, ((approvalCount ?? 0) / thresholdN) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {(approvalCount ?? 0) >= thresholdN
                  ? "✓ Threshold met — anyone can decrypt"
                  : `${thresholdN - (approvalCount ?? 0)} more cap holders need to approve`}
              </p>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {tierDescription(privacyTier)}
            </p>
          )}
        </div>
      </MotionTile>

      {/* === Bounty pool (col-span 4) === */}
      <MotionTile
        className="sm:col-span-4"
        delay={0.15}
        gradient="from-emerald-500/15 via-emerald-500/5 to-transparent"
      >
        <div className="flex h-full flex-col justify-between gap-3 p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Bounty TVL
            </span>
            <Sparkles
              size={18}
              strokeWidth={1.75}
              className="text-emerald-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-3xl font-medium tracking-tight tabular-nums text-foreground">
              {bountyTotalSui.toFixed(2)}{" "}
              <span className="text-base text-muted-foreground">SUI</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {bountyPoolCount} pool{bountyPoolCount === 1 ? "" : "s"} active
            </span>
          </div>
        </div>
      </MotionTile>

      {/* === Share link (col-span 4) === */}
      <MotionTile
        className="sm:col-span-4"
        delay={0.2}
        gradient="from-cyan-500/15 via-cyan-500/5 to-transparent"
      >
        <div className="flex h-full flex-col justify-between gap-3 p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Share link
            </span>
            <Link
              href={`/forms/${formId}`}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowRight size={16} />
            </Link>
          </div>
          <code className="block truncate rounded bg-muted px-2 py-1.5 font-mono text-[11px] text-foreground">
            /forms/{formId.slice(0, 8)}…
          </code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(
                `${window.location.origin}/forms/${formId}`,
              );
            }}
            className="self-start text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Copy public URL
          </button>
        </div>
      </MotionTile>

      {/* === Memwal index state (col-span 4) === */}
      <MotionTile
        className="sm:col-span-4"
        delay={0.25}
        gradient="from-rose-500/15 via-rose-500/5 to-transparent"
      >
        <div className="flex h-full flex-col justify-between gap-3 p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Memwal index
            </span>
            <Database size={18} strokeWidth={1.75} className="text-rose-500" />
          </div>
          <div className="flex flex-col gap-1">
            <span
              className={cn(
                "text-2xl font-medium tracking-tight",
                indexedToMemwal ? "text-emerald-500" : "text-muted-foreground",
              )}
            >
              {indexedToMemwal ? "Ready" : "Not indexed"}
            </span>
            <span className="text-xs text-muted-foreground">
              {indexedToMemwal
                ? "Available to /insights RAG queries"
                : "Click ‘Index all’ below to enable Insights"}
            </span>
          </div>
        </div>
      </MotionTile>

      {/* === Webhook state (col-span 12) === */}
      <MotionTile className="sm:col-span-12" delay={0.3}>
        <div className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-3">
            <Webhook
              size={18}
              strokeWidth={1.75}
              className="text-foreground/60"
            />
            <div className="flex flex-col">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Webhook
              </span>
              <span className="text-sm text-foreground">
                {webhookUrl ? (
                  <>
                    <span className="font-mono text-xs">
                      {webhookUrl.replace(/^https?:\/\//, "").slice(0, 48)}
                      {webhookUrl.length > 48 ? "…" : ""}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Not configured — fire on every new submission
                  </span>
                )}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {webhookUrl && webhookLastFireOk !== null && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                  webhookLastFireOk
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-rose-500/10 text-rose-500",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    webhookLastFireOk ? "bg-emerald-500" : "bg-rose-500",
                  )}
                />
                {webhookLastFireOk ? "last fire ok" : "last fire failed"}
              </span>
            )}
            <Link
              href="#webhook"
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              {webhookUrl ? "edit" : "set up"}
            </Link>
          </div>
        </div>
      </MotionTile>
    </div>
  );
}

function tierDescription(tier: number): string {
  switch (tier) {
    case 0:
      return "Plaintext on Walrus — anyone can read.";
    case 1:
      return "Seal-encrypted; only the cap holder decrypts.";
    case 2:
      return "Threshold m-of-n decrypt via on-chain ApprovalWitness.";
    case 3:
      return "Time-locked — Seal blocks signing until unlock.";
    case 4:
      return "Decrypt gated by an on-chain Move predicate.";
    default:
      return "";
  }
}

function UnlockCountdown({ unlockMs }: { unlockMs: string }) {
  const ms = Number(unlockMs);
  const nowMs = Date.now();
  const diff = ms - nowMs;
  if (Number.isNaN(ms) || diff <= 0) {
    return (
      <p className="text-xs text-emerald-500">
        ✓ Unlocked — anyone can decrypt
      </p>
    );
  }
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return (
    <p className="text-xs text-muted-foreground">
      Unlocks in{" "}
      <span className="font-medium text-foreground">
        {days > 0 ? `${days}d ` : ""}
        {hours}h {mins}m
      </span>
    </p>
  );
}
