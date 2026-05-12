"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import Link from "next/link";
import { clientConfig } from "@/config/clientConfig";
import { EditorialHero } from "@/components/general/EditorialHero";

/**
 * Dashboard onboarding hero — Synex-style editorial intro that sits
 * full-bleed above the bento grid + triage queue.
 *
 * Shares the exact same query key as BentoDashboard
 * ("echo", "bento-forms", ownerAddress, packageId) so TanStack Query
 * dedupes the actual on-chain fetch — we get the aggregate counts for
 * the pill without a second network round-trip.
 *
 * Empty / no-wallet states gracefully fall through to a neutral pill
 * so the hero animation still plays.
 */

interface OnChainForm {
  privacy_tier: number;
  status: number;
  submission_count: string;
}

export function DashboardHero() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;
  const ownerAddress = account?.address;

  const formsQuery = useQuery({
    queryKey: ["echo", "bento-forms", ownerAddress, packageId],
    queryFn: async () => {
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
      return fobjs.objects.map(
        (obj) => (obj as unknown as { json: OnChainForm }).json,
      );
    },
    enabled: !!ownerAddress && packageId.startsWith("0x"),
    staleTime: 30_000,
  });

  const forms = formsQuery.data ?? [];

  const { totalSubs, openForms } = useMemo(() => {
    let subs = 0;
    let open = 0;
    for (const f of forms) {
      subs += Number(f.submission_count ?? 0);
      if (f.status === 1) open += 1;
    }
    return { totalSubs: subs, openForms: open };
  }, [forms]);

  const pill = !ownerAddress
    ? (
      <>
        <span>Connect a wallet</span>
        <span style={{ color: "rgba(0,0,0,0.30)" }}>·</span>
        <span style={{ color: "rgba(0,0,0,0.40)" }}>
          to load your forms
        </span>
      </>
    )
    : forms.length === 0
      ? (
        <>
          <span>0 forms yet</span>
          <span style={{ color: "rgba(0,0,0,0.30)" }}>·</span>
          <span style={{ color: "rgba(0,0,0,0.40)" }}>
            create your first below
          </span>
        </>
      )
      : (
        <>
          <span>
            {forms.length} form{forms.length === 1 ? "" : "s"}
          </span>
          <span style={{ color: "rgba(0,0,0,0.30)" }}>·</span>
          <span>
            {totalSubs} submission{totalSubs === 1 ? "" : "s"}
          </span>
          {openForms > 0 && (
            <>
              <span style={{ color: "rgba(0,0,0,0.30)" }}>·</span>
              <span style={{ color: "rgba(0,0,0,0.40)" }}>
                {openForms} open
              </span>
            </>
          )}
        </>
      );

  const cta = (
    <Link
      href="#bento"
      className="inline-flex items-center gap-3 rounded-2xl bg-white px-5 py-3 text-sm font-medium shadow-xl"
      style={{
        color: "#05050C",
        boxShadow:
          "0 -8px 80px rgba(0,0,0,0.12), 0 40px 120px rgba(0,0,0,0.10)",
      }}
    >
      <span
        className="inline-flex h-2 w-2 rounded-full"
        style={{ backgroundColor: "#16a34a" }}
        aria-hidden="true"
      />
      Open your dashboard
      <span aria-hidden="true">→</span>
    </Link>
  );

  return (
    <EditorialHero
      eyebrow="Overview · Cross-form admin"
      ghostLine="Decrypt, triage,"
      solidLine="steward every response."
      description="Bento overview · cross-form triage queue · jump into any form to decrypt or tag. Walrus-native, encrypted by default."
      pill={pill}
      cta={cta}
    />
  );
}
