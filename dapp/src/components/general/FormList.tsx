"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { ArrowRight, Sparkles } from "lucide-react";
import { clientConfig } from "@/config/clientConfig";
import { readJsonViaAggregator, type FormMetadata } from "@/lib/echo";
import { useDemoAdminMode } from "./DemoAdminToggle";
import { TimeLockBadge } from "./TimeLockBadge";
import { SuiNSName } from "./SuiNSName";
import {
  AuroraPlate,
  BrutalistButton,
  Reveal,
  SuiDroplet,
  WalrusMascot,
} from "./FrameForms";

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
      <AuroraPlate pose="salute" className="min-h-[280px] p-8 sm:p-10">
        <div className="flex max-w-[440px] flex-col gap-4">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/70">
            <SuiDroplet size={10} /> Built on Sui
          </span>
          <h2 className="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
            Connect a wallet to see your forms.
          </h2>
          <p className="text-sm leading-relaxed text-foreground/70">
            Echo reads your FormOwnerCap holdings directly from chain. No
            account creation, no backend session.
          </p>
        </div>
      </AuroraPlate>
    );
  }
  if (formsQuery.isLoading) {
    return (
      <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-foreground"
        />
        Loading forms from chain…
      </div>
    );
  }
  if (formsQuery.error) {
    return (
      <p className="rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-destructive">
        {(formsQuery.error as Error).message}
      </p>
    );
  }
  const forms = formsQuery.data ?? [];
  if (forms.length === 0) {
    return (
      <AuroraPlate pose="peace" className="min-h-[320px] p-8 sm:p-10">
        <div className="flex max-w-[440px] flex-col gap-4">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/70">
            <Sparkles size={10} /> Brand new
          </span>
          <h2 className="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
            No forms yet — let&rsquo;s ship the first.
          </h2>
          <p className="text-sm leading-relaxed text-foreground/70">
            Walrus-native schema, Seal-encrypted submissions, gas sponsored.
            About 90 seconds end-to-end.
          </p>
          <div className="pt-2">
            <BrutalistButton href="/forms/new" aurora size="md">
              Create the first form
              <ArrowRight size={12} strokeWidth={2.5} />
            </BrutalistButton>
          </div>
        </div>
      </AuroraPlate>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {demoMode && (
        <Reveal>
          <div className="flex items-start gap-3 rounded-sm border border-foreground/40 bg-background px-4 py-3">
            <WalrusMascot pose="salute" size={36} className="-mt-0.5 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/85">
                Demo admin · server-side decrypt enabled
              </span>
              <span className="text-sm text-muted-foreground">
                Showing forms owned by{" "}
                <code className="font-mono text-foreground">
                  {demoAddress.slice(0, 10)}…{demoAddress.slice(-4)}
                </code>
                .
              </span>
            </div>
          </div>
        </Reveal>
      )}
      <ul className="flex flex-col divide-y divide-foreground/10 border-y border-foreground/15">
        {forms.map((f, idx) => (
          <motion.li
            key={f.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.45,
              delay: 0.04 * idx,
              ease: [0.22, 1, 0.36, 1],
            }}
            whileHover={{ x: 3 }}
            className="group relative flex flex-col gap-1.5 px-3 py-3 transition-colors hover:bg-foreground/[0.035]"
          >
            {/* Sui Sea Blue accent rail revealed on hover — the
                single brand-color moment per row. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-0 top-1/2 h-[60%] -translate-y-1/2 -translate-x-[3px] rounded-r-sm bg-[var(--ff-sui-sea)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{ width: 3 }}
            />
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Link
                href={`/forms/${f.id}/admin`}
                className="ff-focus rounded-sm text-base font-medium text-foreground hover:underline"
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
                  className="ff-focus inline-flex items-center gap-1 rounded-sm font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/55 transition-all hover:gap-2 hover:text-foreground"
                  href={`/forms/${f.id}`}
                >
                  public link <ArrowRight size={10} />
                </Link>
              </span>
            </div>
          </motion.li>
        ))}
      </ul>
      {/* Sticky brutalist "Create another" CTA — the on-chain commit
          moment for the /forms list. Walrus salute + aurora gradient
          on hover keep the brand active without crowding the list. */}
      <Reveal delay={120} className="pt-1">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-foreground/15 bg-card/40 px-4 py-4">
          <div className="flex items-center gap-3">
            <WalrusMascot pose="salute" size={44} bobble />
            <div className="flex flex-col">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-foreground/70">
                Need another?
              </span>
              <span className="text-sm text-foreground">
                Sign &amp; publish a new schema to Walrus in under a minute.
              </span>
            </div>
          </div>
          <BrutalistButton href="/forms/new" aurora>
            Create form
            <ArrowRight size={12} strokeWidth={2.5} />
          </BrutalistButton>
        </div>
      </Reveal>
    </div>
  );
};
