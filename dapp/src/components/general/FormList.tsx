"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Sparkles } from "lucide-react";
import { clientConfig } from "@/config/clientConfig";
import { readJsonViaAggregator, type FormMetadata } from "@/lib/echo";
import { useDemoAdminMode } from "./DemoAdminToggle";

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
    <div className="flex flex-col gap-2">
      {demoMode && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 inline-flex items-start gap-2">
          <Sparkles size={12} className="mt-0.5 shrink-0" />
          <span>
            Showing forms owned by the demo address (
            <code>
              {demoAddress.slice(0, 10)}…{demoAddress.slice(-4)}
            </code>
            ). Server-side decrypt is enabled for these.
          </span>
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {forms.map((f) => (
          <li
            key={f.id}
            className="border rounded p-3 flex flex-col gap-1 bg-card"
          >
            <div className="flex items-center justify-between gap-2">
              <Link
                href={`/forms/${f.id}/admin`}
                className="font-medium hover:underline"
              >
                {f.title}
              </Link>
              <span className="text-xs text-muted-foreground">
                {f.id.slice(0, 10)}…
              </span>
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span>{TIER_LABELS[f.onChain.privacy_tier] ?? "?"}</span>
              <span>·</span>
              <span>{STATUS_LABELS[f.onChain.status] ?? "?"}</span>
              <span>·</span>
              <span>{f.onChain.submission_count} submissions</span>
              <span className="ml-auto">
                <Link className="underline" href={`/forms/${f.id}`}>
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
