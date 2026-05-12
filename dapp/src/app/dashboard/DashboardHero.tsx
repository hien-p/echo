"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import Link from "next/link";
import { ArrowRight, Lock, Inbox, Sparkles } from "lucide-react";
import { clientConfig } from "@/config/clientConfig";
import { EditorialHero } from "@/components/general/EditorialHero";
import { WalrusBlob } from "@/components/marketing/WalrusBlob";
import { CountUp } from "@/components/general/CountUp";
import { PrivacyTier } from "@/lib/echo";

/**
 * Dashboard onboarding hero — Echo's editorial intro that sits
 * full-bleed above the bento grid + triage queue.
 *
 * Differentiation from the Synex template:
 *   - WalrusBlob (SVG) instead of qclay's hosted stone PNGs
 *   - third "back" blob for added depth behind the headline
 *   - live preview card (real form counts, recent forms) rising
 *     centrally between the front blobs instead of a tiny CTA pill
 *   - Echo-specific copy naming the actual value props
 *   - CountUp odometer on the pill stats
 *
 * Shares the BentoDashboard query key so TanStack dedupes the
 * on-chain fetch — same forms list, no extra round-trip.
 */

interface OnChainForm {
  privacy_tier: number;
  status: number;
  submission_count: string;
  created_ms?: string;
}

interface BentoForm {
  id: string;
  json: OnChainForm;
}

export function DashboardHero() {
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
      return fobjs.objects.map((obj) => {
        const o = obj as unknown as { objectId: string; json: OnChainForm };
        return { id: o.objectId, json: o.json };
      });
    },
    enabled: !!ownerAddress && packageId.startsWith("0x"),
    staleTime: 30_000,
  });

  const forms = formsQuery.data ?? [];

  const stats = useMemo(() => {
    let subs = 0;
    let open = 0;
    let encrypted = 0;
    for (const f of forms) {
      subs += Number(f.json.submission_count ?? 0);
      if (f.json.status === 1) open += 1;
      if (f.json.privacy_tier !== PrivacyTier.Public) encrypted += 1;
    }
    return {
      formsCount: forms.length,
      totalSubs: subs,
      openForms: open,
      encryptedForms: encrypted,
    };
  }, [forms]);

  const pill = !ownerAddress ? (
    <>
      <span>Connect a wallet</span>
      <span style={{ color: "rgba(0,0,0,0.30)" }}>·</span>
      <span style={{ color: "rgba(0,0,0,0.40)" }}>to unseal your forms</span>
    </>
  ) : forms.length === 0 ? (
    <>
      <span>0 forms yet</span>
      <span style={{ color: "rgba(0,0,0,0.30)" }}>·</span>
      <span style={{ color: "rgba(0,0,0,0.40)" }}>
        create your first below
      </span>
    </>
  ) : (
    <>
      <span>
        <CountUp to={stats.formsCount} delay={0.6} /> form
        {stats.formsCount === 1 ? "" : "s"}
      </span>
      <span style={{ color: "rgba(0,0,0,0.30)" }}>·</span>
      <span>
        <CountUp to={stats.totalSubs} delay={0.7} /> submission
        {stats.totalSubs === 1 ? "" : "s"}
      </span>
      {stats.openForms > 0 && (
        <>
          <span style={{ color: "rgba(0,0,0,0.30)" }}>·</span>
          <span style={{ color: "rgba(0,0,0,0.40)" }}>
            <CountUp to={stats.openForms} delay={0.8} /> open
          </span>
        </>
      )}
    </>
  );

  const previewCard = (
    <LivePreviewCard
      formsCount={stats.formsCount}
      totalSubs={stats.totalSubs}
      encryptedForms={stats.encryptedForms}
      hasWallet={!!ownerAddress}
    />
  );

  return (
    <EditorialHero
      eyebrow="Walrus-native · Sui dApp · Seal-encrypted"
      ghostLine="Zero gas to submit."
      solidLine="Sealed end-to-end."
      description="Onchain form ownership, Walrus-native storage, walletless option. Triage, decrypt, and export every response."
      pill={pill}
      cta={previewCard}
      scrollLabel="Scroll to dashboard"
      leftDecoration={<WalrusBlob side="left" delay={0.5} />}
      rightDecoration={<WalrusBlob side="right" delay={0.5} />}
      backDecoration={<WalrusBlob side="center" variant="back" delay={0.7} />}
    />
  );
}

/**
 * The card that rises centrally between the two front blobs. Shows
 * three live stats + a deep-link to the bento below. Replaces the
 * Synex template's Dashboard.png screenshot beat with real Echo
 * data — that's the whole point of putting this *here* instead of
 * leaving the middle empty.
 */
function LivePreviewCard({
  formsCount,
  totalSubs,
  encryptedForms,
  hasWallet,
}: {
  formsCount: number;
  totalSubs: number;
  encryptedForms: number;
  hasWallet: boolean;
}) {
  return (
    <div
      className="flex w-[min(90vw,560px)] flex-col gap-4 rounded-2xl bg-white p-5 shadow-xl"
      style={{
        color: "#05050C",
        boxShadow:
          "0 -8px 80px rgba(0,0,0,0.12), 0 40px 120px rgba(0,0,0,0.16)",
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-black/50">
          <span
            className="inline-flex h-2 w-2 rounded-full"
            style={{ backgroundColor: "#16a34a" }}
            aria-hidden="true"
          />
          Live overview
        </div>
        <Link
          href="#bento"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-black/65 hover:text-black"
        >
          Open dashboard <ArrowRight size={12} />
        </Link>
      </div>

      {/* 3-stat row */}
      <div className="grid grid-cols-3 gap-3 border-t border-black/5 pt-4">
        <PreviewStat
          icon={<Inbox size={14} strokeWidth={1.5} />}
          label="Forms"
          value={hasWallet ? formsCount : null}
        />
        <PreviewStat
          icon={<Sparkles size={14} strokeWidth={1.5} />}
          label="Submissions"
          value={hasWallet ? totalSubs : null}
        />
        <PreviewStat
          icon={<Lock size={14} strokeWidth={1.5} />}
          label="Encrypted"
          value={hasWallet ? encryptedForms : null}
        />
      </div>
    </div>
  );
}

function PreviewStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-black/50">
        {icon}
        {label}
      </div>
      <div
        className="text-[28px] font-medium tabular-nums leading-none"
        style={{ letterSpacing: "-0.5px" }}
      >
        {value === null ? (
          <span className="text-black/30">—</span>
        ) : (
          <CountUp to={value} delay={0.9} duration={1.6} />
        )}
      </div>
    </div>
  );
}
