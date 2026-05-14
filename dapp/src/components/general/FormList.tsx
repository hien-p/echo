"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Sparkles } from "lucide-react";
import { clientConfig } from "@/config/clientConfig";
import { readJsonViaAggregator, type FormMetadata } from "@/lib/echo";
import { useDemoAdminMode } from "./DemoAdminToggle";
import { TimeLockBadge } from "./TimeLockBadge";
import { SuiNSName } from "./SuiNSName";

interface OwnedCap {
  objectId: string;
  json: { form_id: string };
}

interface OnChainForm {
  schema_blob_id: string;
  metadata_blob_id: string;
  owner: string;
  privacy_tier: number;
  status: number;
  submission_count: string;
  created_ms: string;
  unlock_ms?: string;
}

const STATUS_LABELS: Record<number, string> = {
  1: "open",
  2: "closed",
  3: "archived",
};
const TIER_LABELS: Record<number, string> = {
  0: "Public",
  1: "Admin only",
  2: "Threshold",
  3: "Time-locked",
  4: "Conditional",
};

export const FormList = () => {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;
  const demoMode = useDemoAdminMode();
  const demoAddress = clientConfig.DEMO_ADMIN_ADDRESS;
  const ownerAddress = demoMode ? demoAddress : account?.address;

  const formsQuery = useQuery({
    queryKey: ["echo", "forms", "owned", ownerAddress, demoMode],
    queryFn: async () => {
      if (!ownerAddress) return [];
      const capType = `${packageId}::form::FormOwnerCap`;
      const owned = await suiClient.listOwnedObjects({
        owner: ownerAddress,
        type: capType,
        include: { json: true },
        limit: 100,
      });
      const caps = owned.objects as unknown as OwnedCap[];
      const formIds = caps
        .map((c) => c.json?.form_id)
        .filter((id): id is string => !!id);
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
      return items.filter((x): x is NonNullable<typeof x> => x !== null);
    },
    enabled: !!ownerAddress && packageId.startsWith("0x"),
  });

  if (!ownerAddress) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect a wallet to see your forms.
      </p>
    );
  }
  if (formsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (formsQuery.error) {
    return (
      <p className="text-sm text-destructive">
        {(formsQuery.error as Error).message}
      </p>
    );
  }
  const forms = formsQuery.data ?? [];
  if (forms.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No forms yet.{" "}
        <Link className="underline" href="/forms/new">
          Create one
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {demoMode && (
        <p className="inline-flex items-start gap-2 rounded-sm border border-foreground/40 bg-background px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/85">
          <Sparkles size={11} className="mt-0.5 shrink-0" />
          <span className="normal-case tracking-normal text-sm font-normal text-muted-foreground">
            Showing forms owned by the demo address (
            <code className="font-mono text-foreground">
              {demoAddress.slice(0, 10)}…{demoAddress.slice(-4)}
            </code>
            ). Server-side decrypt is enabled for these.
          </span>
        </p>
      )}
      <ul className="flex flex-col divide-y divide-foreground/10 border-y border-foreground/15">
        {forms.map((f) => (
          <li
            key={f.id}
            className="group flex flex-col gap-1.5 px-3 py-3 transition-colors hover:bg-foreground/[0.035]"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Link
                href={`/forms/${f.id}/admin`}
                className="text-base font-medium text-foreground hover:underline"
              >
                {f.title}
              </Link>
              <code className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                {f.id.slice(0, 10)}…
              </code>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <span>{TIER_LABELS[f.onChain.privacy_tier] ?? "?"}</span>
              <span aria-hidden>·</span>
              <span>{STATUS_LABELS[f.onChain.status] ?? "?"}</span>
              <span aria-hidden>·</span>
              <span className="tabular-nums">
                {f.onChain.submission_count} submissions
              </span>
              <span aria-hidden>·</span>
              <span className="normal-case tracking-normal">
                by <SuiNSName address={f.onChain.owner} />
              </span>
              {f.onChain.privacy_tier === 3 && f.onChain.unlock_ms && (
                <TimeLockBadge unlockMs={Number(f.onChain.unlock_ms)} />
              )}
              <span className="ml-auto normal-case tracking-normal">
                <Link
                  className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/55 hover:text-foreground hover:underline"
                  href={`/forms/${f.id}`}
                >
                  public link →
                </Link>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
