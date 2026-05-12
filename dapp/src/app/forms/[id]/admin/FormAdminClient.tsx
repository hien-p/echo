"use client";

import { useQuery } from "@tanstack/react-query";
import { useDAppKit } from "@mysten/dapp-kit-react";
import { FormAdmin as FormAdminInner } from "@/components/general/FormAdmin";
import { SynexHero } from "@/components/general/SynexHero";
import { BentoAdmin } from "@/components/general/BentoAdmin";
import { useResolvedFormId } from "@/lib/echo/useResolvedFormId";
import { getWebhookUrl } from "@/lib/echo/webhooks";
import { clientConfig } from "@/config/clientConfig";
import { readJsonViaAggregator, type FormMetadata } from "@/lib/echo";
import { useEffect, useState } from "react";

/**
 * Composition for /forms/[id]/admin:
 *
 *   1. SynexHero          — editorial hero w/ stones + mossy reveal
 *   2. BentoAdmin         — 8-tile status overview
 *   3. FormAdmin (inner)  — 2,031-line existing detail panel
 *
 * Resolves the form id (handles the Walrus Sites SPA-fallback case
 * where the prop is "_" but window.location has the real id), then
 * fetches the form once at this level for the hero + bento. FormAdmin's
 * own internal queries dedupe via TanStack Query cache, so we don't
 * double-fetch.
 *
 * Direct import — no nested dynamic({ssr:false}). See deep-solver
 * report (plans/reports/brainstorm-260512-...) for the
 * @cloudflare/next-on-pages async-chunk bug we hit when nesting them.
 */

interface OnChainForm {
  schema_blob_id: string;
  schema_version: string;
  metadata_blob_id: string;
  owner: string;
  privacy_tier: number;
  threshold_n: number;
  threshold_m: number;
  unlock_ms: string;
  conditional_policy_id: string;
  status: number;
  submission_count: string;
  created_ms: string;
}

export const FormAdmin = ({ formId }: { formId: string }) => {
  const resolved = useResolvedFormId(formId);
  if (!resolved) {
    return (
      <p className="p-md text-sm text-muted-foreground">Loading admin view…</p>
    );
  }
  return <FormAdminPanel formId={resolved} />;
};

function FormAdminPanel({ formId }: { formId: string }) {
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();

  const formQuery = useQuery({
    queryKey: ["echo", "form", formId],
    queryFn: async () => {
      const resp = await suiClient.getObject({
        objectId: formId,
        include: { json: true },
      });
      const onChain = resp.object.json as OnChainForm | null;
      if (!onChain) throw new Error("Form not found");
      const network = clientConfig.WALRUS_NETWORK;
      const metadata = await readJsonViaAggregator<FormMetadata>(
        onChain.metadata_blob_id,
        { network },
      ).catch(() => null);
      return { onChain, metadata };
    },
    enabled: formId.startsWith("0x"),
    retry: 1,
  });

  // Webhook config is admin-side localStorage only; hydrate once
  // after mount so SSR HTML and first paint match.
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  useEffect(() => {
    setWebhookUrl(getWebhookUrl(formId));
  }, [formId]);

  if (formQuery.isLoading) {
    return <p className="p-md text-sm text-muted-foreground">Loading form…</p>;
  }
  if (formQuery.error || !formQuery.data) {
    return (
      <p className="p-md text-sm text-destructive">
        Failed to load form: {(formQuery.error as Error)?.message ?? "unknown"}
      </p>
    );
  }

  const { onChain, metadata } = formQuery.data;
  const submissionCount = Number(onChain.submission_count ?? 0);

  return (
    <div className="flex flex-col gap-12">
      <SynexHero
        title={metadata?.title ?? formId.slice(0, 12) + "…"}
        description={metadata?.description}
        privacyTier={onChain.privacy_tier}
        formId={formId}
        submissionCount={submissionCount}
        status={
          onChain.status === 1
            ? "Open"
            : onChain.status === 2
              ? "Closed"
              : onChain.status === 3
                ? "Archived"
                : "Unknown"
        }
      />

      <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-8">
        <BentoAdmin
          formId={formId}
          submissionCount={submissionCount}
          decryptedCount={0}
          privacyTier={onChain.privacy_tier}
          status={onChain.status}
          thresholdN={onChain.threshold_n}
          thresholdM={onChain.threshold_m}
          unlockMs={onChain.unlock_ms}
          webhookUrl={webhookUrl}
          webhookLastFireOk={null}
        />
      </div>

      <div className="mx-auto w-full max-w-[960px] px-4 sm:px-8">
        <FormAdminInner formId={formId} />
      </div>
    </div>
  );
}
