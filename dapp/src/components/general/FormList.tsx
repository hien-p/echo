"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { clientConfig } from "@/config/clientConfig";
import { getWalrusClient, readJsonBlob, type FormMetadata } from "@/lib/echo";

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

  const formsQuery = useQuery({
    queryKey: ["echo", "forms", "owned", account?.address],
    queryFn: async () => {
      if (!account) return [];
      const capType = `${packageId}::form::FormOwnerCap`;
      const owned = await suiClient.listOwnedObjects({
        owner: account.address,
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
      const walrus = getWalrusClient(suiClient, clientConfig.WALRUS_NETWORK);
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
            const meta = await readJsonBlob<FormMetadata>(
              walrus,
              fobj.json.metadata_blob_id,
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
    enabled: !!account?.address && packageId.startsWith("0x"),
  });

  if (!account) {
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
  );
};
