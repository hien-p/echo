"use client";

/**
 * Cross-form triage dashboard.
 *
 * Aggregates submissions across every form the connected wallet (or demo
 * admin) holds a FormOwnerCap for. Lets the operator filter, tag, and
 * prioritize without needing to bounce between per-form admin pages.
 *
 * Status tags are stored client-side in localStorage keyed by submission id,
 * so they're per-browser, not synced across devices. That's intentional for
 * v0.3 — adding an on-chain or Walrus-blob status layer is a follow-up.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Sparkles, Download, Lock, ShieldCheck } from "lucide-react";
import { clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import {
  buildSealApproveTxBytes,
  getSealClient,
  listApprovals,
  PrivacyTier,
  readJsonViaAggregator,
  SessionKey,
  tierIdentity,
  type FormMetadata,
} from "@/lib/echo";
import { useDemoAdminMode } from "./DemoAdminToggle";
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
  threshold_n?: number;
  threshold_m?: number;
  status: number;
  submission_count: string;
  created_ms: string;
  unlock_ms?: string;
}

interface SubmissionEvent {
  form_id: string;
  submission_id: string;
  submitter: string;
  schema_version: string;
  anonymous: boolean;
}

interface SubmissionRefJson {
  payload_blob_id: string;
  submitted_ms: string;
  submitter: string;
  commitment: number[];
}

interface FormCard {
  id: string;
  title: string;
  onChain: OnChainForm;
}

interface SubmissionRow {
  formId: string;
  formTitle: string;
  formTier: number;
  submissionId: string;
  submitter: string;
  anonymous: boolean;
  submittedAt: string;
  payloadBlobId: string;
  encrypted: boolean;
}

const TIER_LABELS: Record<number, string> = {
  0: "Public",
  1: "Admin only",
  2: "Threshold",
  3: "Time-locked",
  4: "Conditional",
};

const STATUS_LABELS: Record<number, string> = {
  1: "open",
  2: "closed",
  3: "archived",
};

const STATUSES = [
  {
    value: "new",
    label: "New",
    chip: "bg-blue-100 text-blue-900 border-blue-300",
  },
  {
    value: "triaging",
    label: "Triaging",
    chip: "bg-amber-100 text-amber-900 border-amber-300",
  },
  {
    value: "replied",
    label: "Replied",
    chip: "bg-violet-100 text-violet-900 border-violet-300",
  },
  {
    value: "resolved",
    label: "Resolved",
    chip: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  {
    value: "archived",
    label: "Archived",
    chip: "bg-zinc-100 text-zinc-700 border-zinc-300",
  },
] as const;
type Status = (typeof STATUSES)[number]["value"];
const STATUS_VALUES: readonly Status[] = STATUSES.map((s) => s.value);

const STORAGE_PREFIX = "echo:status:";
const ADMIN_UNLOCK_KEY = "echo:dashboard-admin-unlocked";

function readAdminUnlockedFor(address: string | undefined): boolean {
  if (!address || typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(ADMIN_UNLOCK_KEY) === address;
  } catch {
    return false;
  }
}

function writeAdminUnlockedFor(address: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ADMIN_UNLOCK_KEY, address);
  } catch {
    /* sessionStorage unavailable */
  }
}

function clearAdminUnlocked() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ADMIN_UNLOCK_KEY);
  } catch {
    /* sessionStorage unavailable */
  }
}

function readStatus(submissionId: string): Status {
  if (typeof window === "undefined") return "new";
  try {
    const v = window.localStorage.getItem(STORAGE_PREFIX + submissionId);
    if (v && STATUS_VALUES.includes(v as Status)) return v as Status;
  } catch {
    /* localStorage unavailable */
  }
  return "new";
}

function writeStatus(submissionId: string, status: Status) {
  if (typeof window === "undefined") return;
  try {
    if (status === "new") {
      window.localStorage.removeItem(STORAGE_PREFIX + submissionId);
    } else {
      window.localStorage.setItem(STORAGE_PREFIX + submissionId, status);
    }
  } catch {
    /* localStorage unavailable */
  }
}

export const CrossFormDashboard = () => {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;
  const demoMode = useDemoAdminMode();
  const demoAddress = clientConfig.DEMO_ADMIN_ADDRESS;
  const ownerAddress = demoMode ? demoAddress : account?.address;

  // Admin-mode gate. Demo mode bypasses (matches the rest of the app);
  // wallet users must explicitly unlock via Seal SessionKey + cap proof.
  // State is sessionStorage-keyed by address so switching wallets re-locks.
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  useEffect(() => {
    if (demoMode) return; // demo path is always "unlocked"
    setAdminUnlocked(readAdminUnlockedFor(account?.address));
  }, [account?.address, demoMode]);
  const [unlockState, setUnlockState] = useState<{
    status: "idle" | "running" | "error";
    message?: string;
  }>({ status: "idle" });

  // 1) Owned forms.
  const formsQuery = useQuery({
    queryKey: ["echo", "dashboard-forms", ownerAddress, demoMode],
    queryFn: async (): Promise<FormCard[]> => {
      if (!ownerAddress) return [];
      const capType = `${packageId}::form::FormOwnerCap`;
      const owned = await suiClient.listOwnedObjects({
        owner: ownerAddress,
        type: capType,
        include: { json: true },
        limit: 200,
      });
      const caps = owned.objects as unknown as OwnedCap[];
      const formIds = Array.from(
        new Set(
          caps.map((c) => c.json?.form_id).filter((id): id is string => !!id),
        ),
      );
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
      return items.filter((x): x is FormCard => x !== null);
    },
    enabled: !!ownerAddress && packageId.startsWith("0x"),
    staleTime: 30_000,
  });

  // 2) Submissions across every owned form (one event query per form,
  //    parallel). Uses the same MoveEventField filter we use in FormAdmin.
  const formCards = formsQuery.data ?? [];
  const formIdsKey = formCards.map((f) => f.id).join(",");
  const submissionsQuery = useQuery({
    queryKey: ["echo", "dashboard-submissions", formIdsKey],
    queryFn: async (): Promise<SubmissionRow[]> => {
      if (formCards.length === 0) return [];
      const eventType = `${packageId}::submission::SubmissionMade`;
      const fullnodeUrl = clientConfig.SUI_FULLNODE_URL;

      const perForm = await Promise.all(
        formCards.map(async (form) => {
          const events = await queryEventsByFormId(
            fullnodeUrl,
            eventType,
            form.id,
          );
          if (events.length === 0) return [] as SubmissionRow[];
          // Batch the SubmissionRef getObject calls so we get submitted_ms
          // and payload_blob_id without N round-trips.
          const subObjs = await suiClient.getObjects({
            objectIds: events.map((e) => e.submission_id),
            include: { json: true },
          });
          const byId = new Map<string, SubmissionRefJson>();
          for (const obj of subObjs.objects as unknown as Array<{
            objectId: string;
            json?: SubmissionRefJson;
          }>) {
            if (obj.json) byId.set(obj.objectId, obj.json);
          }
          return events.map((e): SubmissionRow => {
            const ref = byId.get(e.submission_id);
            return {
              formId: form.id,
              formTitle: form.title,
              formTier: form.onChain.privacy_tier,
              submissionId: e.submission_id,
              submitter: e.submitter,
              anonymous: e.anonymous,
              submittedAt: ref
                ? new Date(Number(ref.submitted_ms)).toISOString()
                : "(unknown)",
              payloadBlobId: ref?.payload_blob_id ?? "",
              encrypted: form.onChain.privacy_tier !== 0,
            };
          });
        }),
      );
      // Flatten + sort newest first by default.
      const flat = perForm.flat();
      flat.sort((a, b) => {
        const ta = Date.parse(a.submittedAt) || 0;
        const tb = Date.parse(b.submittedAt) || 0;
        return tb - ta;
      });
      return flat;
    },
    enabled: formCards.length > 0,
    staleTime: 15_000,
  });

  // 3) Members per form (every wallet that holds a FormOwnerCap). Pure
  //    on-chain read: we look up each form's FormCreated event, fetch the
  //    creating tx with objectChanges, and collect every AddressOwner that
  //    received a FormOwnerCap inside that tx. No localStorage/server.
  const membersQuery = useQuery({
    queryKey: ["echo", "dashboard-members", packageId, formIdsKey],
    queryFn: async (): Promise<Record<string, string[]>> => {
      if (formCards.length === 0) return {};
      const fullnodeUrl = clientConfig.SUI_FULLNODE_URL;
      const eventType = `${packageId}::form::FormCreated`;
      const capType = `${packageId}::form::FormOwnerCap`;
      const out: Record<string, string[]> = {};
      await Promise.all(
        formCards.map(async (form) => {
          const ev = await queryFirstEventByFormId(
            fullnodeUrl,
            eventType,
            form.id,
          );
          if (!ev) return;
          const tx = await getTransactionBlock(fullnodeUrl, ev.txDigest);
          const recipients = new Set<string>();
          for (const c of tx.objectChanges ?? []) {
            if (
              c.type === "created" &&
              c.objectType === capType &&
              c.owner &&
              typeof c.owner === "object" &&
              "AddressOwner" in c.owner
            ) {
              recipients.add(c.owner.AddressOwner as string);
            }
          }
          out[form.id] = Array.from(recipients);
        }),
      );
      return out;
    },
    enabled: formCards.length > 0 && packageId.startsWith("0x"),
    staleTime: 5 * 60_000, // members rarely change (caps are owner-bound)
  });

  // Bounty TVL — sum SUI locked across all BountyPool objects whose
  // form_id matches one of the user's owned forms. We page through
  // shared BountyPool objects via a getOwnedObjects on the package's
  // bounty type (no owner filter — pools are shared) and reduce by
  // form_id membership. Cheap because BountyPool count tracks form
  // count, not submission count.
  const bountyTotalsQuery = useQuery({
    queryKey: ["echo", "dashboard-bounties", packageId, formIdsKey],
    queryFn: async (): Promise<{ totalMist: bigint; pools: number }> => {
      if (formCards.length === 0) return { totalMist: BigInt(0), pools: 0 };
      const formIdSet = new Set(formCards.map((f) => f.id));
      // Use raw RPC since the GRPC client doesn't expose a typed
      // queryEvents helper for the BountyOpened event we want to
      // window-scan. The fullnode REST endpoint is fine for a one-shot
      // dashboard sum.
      const fullnodeUrl = clientConfig.SUI_FULLNODE_URL;
      const eventType = `${packageId}::bounty::BountyOpened`;
      const resp = await fetch(fullnodeUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "suix_queryEvents",
          params: [{ MoveEventType: eventType }, null, 200, true],
        }),
      });
      if (!resp.ok) return { totalMist: BigInt(0), pools: 0 };
      const json = (await resp.json()) as {
        result?: {
          data?: Array<{
            parsedJson?: { pool_id?: string; form_id?: string };
          }>;
        };
      };
      const events = json.result?.data ?? [];
      const ownedPoolIds = events
        .filter(
          (e) => e.parsedJson?.form_id && formIdSet.has(e.parsedJson.form_id),
        )
        .map((e) => e.parsedJson!.pool_id!)
        .filter(Boolean);
      if (ownedPoolIds.length === 0) return { totalMist: BigInt(0), pools: 0 };
      const pools = await suiClient.getObjects({
        objectIds: ownedPoolIds,
        include: { json: true },
      });
      let totalMist = BigInt(0);
      for (const p of pools.objects as unknown as Array<{
        json?: { funds?: string | { value?: string } };
      }>) {
        const funds = p.json?.funds;
        const raw =
          typeof funds === "string"
            ? funds
            : typeof funds === "object" && funds && "value" in funds
              ? funds.value
              : "0";
        try {
          totalMist += BigInt(raw ?? "0");
        } catch {
          /* skip malformed */
        }
      }
      return { totalMist, pools: ownedPoolIds.length };
    },
    enabled: formCards.length > 0 && packageId.startsWith("0x"),
    staleTime: 30_000,
  });

  // 4) Approvals per Threshold form. Calls the existing on-chain index
  //    (ApprovalPosted events) once per Threshold form with k≥2.
  const approvalsByFormQuery = useQuery({
    queryKey: ["echo", "dashboard-approvals", packageId, formIdsKey],
    queryFn: async (): Promise<Record<string, number>> => {
      const out: Record<string, number> = {};
      const targets = formCards.filter(
        (f) =>
          f.onChain.privacy_tier === PrivacyTier.Threshold &&
          (f.onChain.threshold_n ?? 1) >= 2,
      );
      if (targets.length === 0) return out;
      const fullnodeUrl = clientConfig.SUI_FULLNODE_URL;
      await Promise.all(
        targets.map(async (form) => {
          const approvals = await listApprovals({
            fullnodeUrl,
            packageId,
            formId: form.id,
          });
          out[form.id] = approvals.length;
        }),
      );
      return out;
    },
    enabled: formCards.length > 0 && packageId.startsWith("0x"),
    staleTime: 8_000,
    refetchInterval: 8_000,
  });

  // ---- Filter/sort state ------------------------------------------------
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [formFilter, setFormFilter] = useState<string>("all"); // form id or "all"
  const [submitterFilter, setSubmitterFilter] = useState<
    "all" | "named" | "anonymous"
  >("all");

  // Status state — persisted per submission. We mirror localStorage into
  // a React Map so the UI updates synchronously when the user changes a
  // tag without waiting for a re-render of the whole list.
  const [statusMap, setStatusMap] = useState<Record<string, Status>>({});
  // Hydrate once submissions arrive: read each row's persisted status.
  useEffect(() => {
    const rows = submissionsQuery.data ?? [];
    if (rows.length === 0) return;
    setStatusMap((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        if (!(r.submissionId in next)) {
          next[r.submissionId] = readStatus(r.submissionId);
        }
      }
      return next;
    });
  }, [submissionsQuery.data]);

  const setRowStatus = (submissionId: string, status: Status) => {
    writeStatus(submissionId, status);
    setStatusMap((prev) => ({ ...prev, [submissionId]: status }));
  };

  const visible: SubmissionRow[] = useMemo(() => {
    const rows = submissionsQuery.data ?? [];
    const search = searchTerm.trim().toLowerCase();
    return rows.filter((r) => {
      if (formFilter !== "all" && r.formId !== formFilter) return false;
      const status = statusMap[r.submissionId] ?? "new";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (submitterFilter === "anonymous" && !r.anonymous) return false;
      if (submitterFilter === "named" && r.anonymous) return false;
      if (!search) return true;
      const haystack = [
        r.submissionId,
        r.submitter,
        r.payloadBlobId,
        r.formTitle,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }, [
    submissionsQuery.data,
    formFilter,
    statusFilter,
    submitterFilter,
    searchTerm,
    statusMap,
  ]);

  // Status counts for the chip row.
  const statusCounts = useMemo(() => {
    const counts: Record<Status | "total", number> = {
      total: 0,
      new: 0,
      triaging: 0,
      replied: 0,
      resolved: 0,
      archived: 0,
    };
    for (const r of submissionsQuery.data ?? []) {
      counts.total++;
      const s = statusMap[r.submissionId] ?? "new";
      counts[s]++;
    }
    return counts;
  }, [submissionsQuery.data, statusMap]);

  // ---- Unlock handler ---------------------------------------------------
  // Picks the first owned form whose privacy_tier > Public and runs the
  // standard Seal SessionKey + fetchKeys ceremony against its
  // seal_approve_*. Fetching shares only succeeds if the wallet holds a
  // matching FormOwnerCap, so a clean fetchKeys IS proof of admin status.
  // Public-only owners get a wallet-signature-fallback explanation.
  const runUnlock = async () => {
    if (!account?.address) {
      setUnlockState({
        status: "error",
        message: "Connect a wallet first.",
      });
      return;
    }
    setUnlockState({ status: "running" });
    try {
      const encryptedForm = formCards.find(
        (f) => f.onChain.privacy_tier !== PrivacyTier.Public,
      );
      if (!encryptedForm) {
        throw new Error(
          "Seal admin mode needs at least one encrypted form (AdminOnly, Threshold, TimeLocked, or Conditional). All your forms are Public — create one with an encrypted tier to unlock.",
        );
      }
      const sealServers = parseSealServers(clientConfig.SEAL_KEY_SERVERS);
      if (sealServers.length === 0) {
        throw new Error("NEXT_PUBLIC_SEAL_KEY_SERVERS not configured.");
      }
      // Find this user's cap object id for the chosen form.
      const owned = await suiClient.listOwnedObjects({
        owner: account.address,
        type: `${packageId}::form::FormOwnerCap`,
        include: { json: true },
        limit: 200,
      });
      const cap = (
        owned.objects as unknown as Array<{
          objectId: string;
          json?: { form_id?: string };
        }>
      ).find((c) => c.json?.form_id === encryptedForm.id);
      if (!cap) {
        throw new Error(
          "FormOwnerCap missing for the chosen form — did the wallet change?",
        );
      }
      const seal = getSealClient({
        suiClient: suiClient as unknown as Parameters<
          typeof getSealClient
        >[0]["suiClient"],
        serverConfigs: sealServers,
        verifyKeyServers: false,
      });
      const session = await SessionKey.create({
        address: account.address,
        packageId,
        ttlMin: 30,
        suiClient: suiClient as unknown as Parameters<
          typeof SessionKey.create
        >[0]["suiClient"],
      });
      const sig = await dAppKit.signPersonalMessage({
        message: session.getPersonalMessage(),
      });
      await session.setPersonalMessageSignature(sig.signature);
      const identity = tierIdentity({
        formId: encryptedForm.id,
        tier: encryptedForm.onChain.privacy_tier as PrivacyTier,
        unlockMs: encryptedForm.onChain.unlock_ms
          ? BigInt(encryptedForm.onChain.unlock_ms)
          : undefined,
      });
      const txBytes = await buildSealApproveTxBytes({
        packageId,
        formId: encryptedForm.id,
        formOwnerCapId: cap.objectId,
        privacyTier: encryptedForm.onChain.privacy_tier as PrivacyTier,
        identity,
        senderAddress: account.address,
        suiClient: suiClient as unknown as Parameters<
          typeof buildSealApproveTxBytes
        >[0]["suiClient"],
      });
      // fetchKeys throws if seal_approve aborts → exact gate we want.
      await seal.fetchKeys({
        ids: [bytesToHex(identity)],
        txBytes,
        sessionKey: session,
        threshold:
          encryptedForm.onChain.privacy_tier === PrivacyTier.Threshold
            ? encryptedForm.onChain.threshold_n || 1
            : 1,
      });
      writeAdminUnlockedFor(account.address);
      setAdminUnlocked(true);
      setUnlockState({ status: "idle" });
    } catch (e) {
      setUnlockState({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const lockOut = () => {
    clearAdminUnlocked();
    setAdminUnlocked(false);
  };

  if (!ownerAddress) {
    return (
      <LockedShell
        title="Connect your wallet"
        message="The dashboard is gated to wallets that hold at least one FormOwnerCap. Connect first, then unlock with Seal."
      />
    );
  }
  if (formsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading forms…</p>;
  }
  if (formsQuery.error) {
    return (
      <p className="text-sm text-destructive">
        {(formsQuery.error as Error).message}
      </p>
    );
  }
  if (formCards.length === 0) {
    return (
      <LockedShell
        title="No forms yet"
        message="The dashboard is gated to FormOwnerCap holders. Create your first form to enter."
        cta={{ href: "/forms/new", label: "Create a form →" }}
      />
    );
  }

  // Wallet-mode admin gate. Demo mode bypasses (server signs SessionKey
  // for the demo address). Otherwise the user must have proven cap
  // ownership via Seal in this session before any submission rows render.
  if (!demoMode && !adminUnlocked) {
    const hasEncryptedForm = formCards.some(
      (f) => f.onChain.privacy_tier !== PrivacyTier.Public,
    );
    return (
      <LockedShell
        icon="lock"
        title="Wallet admin mode required"
        message={
          hasEncryptedForm
            ? "The dashboard reveals submission addresses, blob ids, and your private triage tags. Unlock by signing one Seal SessionKey — the key servers verify you hold a FormOwnerCap before they release shares."
            : "Seal-backed unlock needs at least one encrypted form (AdminOnly / Threshold / TimeLocked / Conditional). All your forms are Public. Switch one to AdminOnly to enable Seal admin mode."
        }
        cta={
          hasEncryptedForm
            ? {
                onClick: runUnlock,
                label:
                  unlockState.status === "running"
                    ? "Unlocking…"
                    : "Unlock with Seal",
                disabled: unlockState.status === "running",
              }
            : { href: "/forms/new", label: "Create an encrypted form →" }
        }
        error={unlockState.status === "error" ? unlockState.message : undefined}
      />
    );
  }

  // Currently scoped form (sidebar selection or filter dropdown). When set,
  // we render a detail panel above the submissions list.
  const selectedForm =
    formFilter === "all"
      ? null
      : (formCards.find((f) => f.id === formFilter) ?? null);

  const filtersActive =
    statusFilter !== "all" ||
    formFilter !== "all" ||
    submitterFilter !== "all" ||
    !!searchTerm;
  const clearAllFilters = () => {
    setStatusFilter("all");
    setFormFilter("all");
    setSubmitterFilter("all");
    setSearchTerm("");
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Compact header — title + admin chip + search + export + lock,
          all on one row. Demo address pill replaces the verbose banner. */}
      <div className="flex items-center justify-between gap-2 flex-wrap border-b pb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold tracking-tight">Triage</h1>
          {!demoMode && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
              <ShieldCheck size={10} /> Seal-verified
            </span>
          )}
          {demoMode && (
            <span
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-800 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200"
              title={`Demo address ${demoAddress}`}
            >
              <Sparkles size={10} /> Demo · {demoAddress.slice(0, 6)}…
              {demoAddress.slice(-4)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <input
            type="text"
            placeholder="Search submissions, addresses, blob ids…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border rounded px-2 py-1 w-[200px] sm:w-[260px]"
          />
          <button
            type="button"
            onClick={() => exportCsv(visible)}
            disabled={visible.length === 0}
            className={cn(
              "border rounded px-2 py-1 inline-flex items-center gap-1",
              visible.length > 0
                ? "hover:bg-accent"
                : "opacity-60 cursor-not-allowed",
            )}
            title="Export visible submissions as CSV"
          >
            <Download size={11} /> CSV ({visible.length})
          </button>
          {!demoMode && (
            <button
              type="button"
              onClick={lockOut}
              className="text-muted-foreground hover:text-foreground underline"
              title="Re-lock dashboard for this tab"
            >
              Lock
            </button>
          )}
        </div>
      </div>

      {/* Inline metric strip — no boxes; click status to scope the list. */}
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 text-sm">
        <Metric value={formCards.length} label="forms" />
        <Metric value={statusCounts.total} label="submissions" />
        {bountyTotalsQuery.data && bountyTotalsQuery.data.pools > 0 && (
          <Metric
            value={`${formatSui(bountyTotalsQuery.data.totalMist)} SUI`}
            label={`bounty TVL (${bountyTotalsQuery.data.pools} pool${bountyTotalsQuery.data.pools === 1 ? "" : "s"})`}
          />
        )}
        <Link
          href="/insights"
          className="text-xs text-muted-foreground underline hover:text-foreground"
          title="Ask questions across every form's submissions (Memwal RAG)"
        >
          Insights →
        </Link>
        <span className="text-border" aria-hidden>
          |
        </span>
        {STATUSES.map((s) => (
          <Metric
            key={s.value}
            value={statusCounts[s.value]}
            label={s.label.toLowerCase()}
            active={statusFilter === s.value}
            onClick={() =>
              setStatusFilter((c) => (c === s.value ? "all" : s.value))
            }
          />
        ))}
        {filtersActive && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="text-xs text-muted-foreground underline ml-auto"
          >
            clear filters ({visible.length}/{statusCounts.total})
          </button>
        )}
      </div>

      {/* Sidebar (forms) + main (submissions). Stacks on mobile. */}
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4">
        {/* Forms sidebar — grouped by privacy tier. Click any to scope
            the right pane to that form; click again or "All forms" to
            clear. The active row has a filled background. */}
        <aside className="flex flex-col gap-3 lg:border-r lg:pr-4 lg:max-h-[80vh] lg:overflow-auto">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Forms
            </h2>
            <Link
              href="/forms/new"
              className="text-xs underline text-muted-foreground hover:text-foreground"
            >
              + new
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setFormFilter("all")}
            className={cn(
              "text-left text-sm rounded px-2 py-1.5 -mx-1 flex items-center justify-between gap-2 transition",
              formFilter === "all"
                ? "bg-accent font-medium"
                : "hover:bg-accent/60",
            )}
          >
            <span>All forms</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {statusCounts.total}
            </span>
          </button>
          {/* Group by tier so the sidebar tells a story. */}
          {([0, 1, 2, 3, 4] as const).map((tier) => {
            const group = formCards.filter(
              (f) => f.onChain.privacy_tier === tier,
            );
            if (group.length === 0) return null;
            return (
              <div key={tier} className="flex flex-col gap-0.5">
                <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mt-1 px-1">
                  {TIER_LABELS[tier]} ({group.length})
                </h3>
                {group.map((f) => {
                  const subCount =
                    submissionsQuery.data?.filter((s) => s.formId === f.id)
                      .length ?? 0;
                  const isActive = formFilter === f.id;
                  const k = f.onChain.threshold_n ?? 0;
                  const n = f.onChain.threshold_m ?? 0;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFormFilter(isActive ? "all" : f.id)}
                      className={cn(
                        "text-left text-sm rounded px-2 py-1.5 -mx-1 flex items-center justify-between gap-2 transition",
                        isActive
                          ? "bg-accent font-medium"
                          : "hover:bg-accent/60",
                      )}
                      title={f.id}
                    >
                      <span className="truncate flex-1 min-w-0">
                        {f.title}
                        {tier === PrivacyTier.Threshold && k > 0 && n > 0 && (
                          <span className="text-[10px] text-muted-foreground ml-1">
                            {k}/{n}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {subCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </aside>

        {/* Main pane: form detail (when scoped) + filter chips +
            submissions table. */}
        <main className="flex flex-col gap-3 min-w-0">
          {selectedForm && (
            <FormDetailPanel
              form={selectedForm}
              members={membersQuery.data?.[selectedForm.id] ?? []}
              membersLoading={membersQuery.isLoading}
              approvalsCount={approvalsByFormQuery.data?.[selectedForm.id] ?? 0}
              recentSubs={
                submissionsQuery.data
                  ?.filter((s) => s.formId === selectedForm.id)
                  .slice(0, 3) ?? []
              }
            />
          )}

          {/* Submitter pill row — small, only meaningful filters here.
              Status filtering happens via the metric strip above. */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">
              Submitter:
            </span>
            {(["all", "named", "anonymous"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setSubmitterFilter(opt)}
                className={cn(
                  "rounded-full border px-2 py-0.5 capitalize",
                  submitterFilter === opt
                    ? "bg-foreground text-background border-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {opt === "all" ? "any" : opt}
              </button>
            ))}
          </div>

          {/* Submissions table — one row per submission. Status pill
              cycles through STATUSES on click; click row to open in
              per-form admin. */}
          {submissionsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded">
              Loading submissions across {formCards.length} form
              {formCards.length === 1 ? "" : "s"}…
            </p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded">
              {statusCounts.total === 0
                ? "No submissions yet on any of your forms."
                : "Nothing matches the current filters."}
            </p>
          ) : (
            <ul className="flex flex-col divide-y border rounded">
              {visible.map((r) => {
                const status = statusMap[r.submissionId] ?? "new";
                const statusDef =
                  STATUSES.find((s) => s.value === status) ?? STATUSES[0];
                return (
                  <li
                    key={r.submissionId}
                    className="px-3 py-2 flex items-center gap-3 hover:bg-accent/30 text-sm"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        const idx = STATUSES.findIndex(
                          (s) => s.value === status,
                        );
                        const next = STATUSES[(idx + 1) % STATUSES.length];
                        setRowStatus(r.submissionId, next.value);
                      }}
                      title={`Status: ${statusDef.label} · click to cycle`}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide shrink-0 w-[78px] text-center",
                        statusDef.chip,
                      )}
                    >
                      {statusDef.label}
                    </button>
                    {!selectedForm && (
                      <Link
                        href={`/forms/${r.formId}/admin`}
                        className="text-xs underline text-muted-foreground truncate max-w-[180px] shrink-0 hidden sm:inline"
                        title={r.formTitle}
                      >
                        {r.formTitle}
                      </Link>
                    )}
                    <span className="truncate flex-1 min-w-0">
                      {r.anonymous ? (
                        <em className="text-muted-foreground">anonymous</em>
                      ) : (
                        <SuiNSName address={r.submitter} />
                      )}
                    </span>
                    {r.encrypted && (
                      <Lock
                        size={11}
                        className="text-amber-700 shrink-0"
                        aria-label="encrypted"
                      />
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0 hidden sm:inline">
                      {r.submittedAt.replace("T", " ").slice(0, 16)}
                    </span>
                    <Link
                      href={`/forms/${r.formId}/admin`}
                      className="text-xs underline shrink-0"
                      aria-label="open in admin"
                    >
                      →
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </main>
      </div>
    </div>
  );
};

/**
 * Inline metric — large tabular number + small label, no card chrome.
 * Optional active/click state lets the strip double as a status filter.
 */
function Metric({
  value,
  label,
  active,
  onClick,
}: {
  value: number | string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const Comp: "button" | "div" = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "inline-flex items-baseline gap-1.5",
        onClick && "cursor-pointer hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "text-base font-semibold tabular-nums",
          active && "underline underline-offset-4 decoration-2",
        )}
      >
        {value}
      </span>
      <span className="text-xs uppercase tracking-wide">{label}</span>
    </Comp>
  );
}

/**
 * Detail panel rendered when the user scopes the dashboard to a single
 * form. Shows everything that's not visible in the sidebar row: members
 * (Sui ACL), m-of-n approvals, recent activity, plus the on-chain id and
 * deep links. Pure on-chain reads — same data the per-form admin uses,
 * just summarized.
 */
function FormDetailPanel({
  form,
  members,
  membersLoading,
  approvalsCount,
  recentSubs,
}: {
  form: FormCard;
  members: string[];
  membersLoading: boolean;
  approvalsCount: number;
  recentSubs: SubmissionRow[];
}) {
  const tier = form.onChain.privacy_tier;
  const isThreshold = tier === PrivacyTier.Threshold;
  const isTimeLocked = tier === PrivacyTier.TimeLocked;
  const k = form.onChain.threshold_n ?? 0;
  const n = form.onChain.threshold_m ?? 0;
  const isMofN = isThreshold && k >= 2;
  const isMofNUnlocked = isMofN && approvalsCount >= k;
  const coAdmins = members.filter(
    (a) => a.toLowerCase() !== form.onChain.owner.toLowerCase(),
  );
  return (
    <div className="border rounded-lg p-4 bg-card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex flex-col gap-1 min-w-0">
          <h2 className="text-base font-semibold truncate" title={form.title}>
            {form.title}
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <span>{STATUS_LABELS[form.onChain.status] ?? "?"}</span>
            <span>·</span>
            <span>{form.onChain.submission_count} submissions on chain</span>
            <span>·</span>
            <code title={form.id}>
              {form.id.slice(0, 10)}…{form.id.slice(-4)}
            </code>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
              tier === PrivacyTier.Public &&
                "bg-zinc-100 text-zinc-700 border-zinc-300",
              tier === PrivacyTier.AdminOnly &&
                "bg-blue-100 text-blue-900 border-blue-300",
              isThreshold && "bg-violet-100 text-violet-900 border-violet-300",
              isTimeLocked && "bg-amber-100 text-amber-900 border-amber-300",
              tier === PrivacyTier.Conditional &&
                "bg-emerald-100 text-emerald-900 border-emerald-300",
            )}
          >
            {TIER_LABELS[tier] ?? "?"}
            {isThreshold && k > 0 && n > 0 && ` ${k}/${n}`}
          </span>
          {isMofN && (
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                isMofNUnlocked
                  ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                  : "bg-amber-100 text-amber-900 border-amber-300",
              )}
              title="On-chain ApprovalPosted events for this form"
            >
              {approvalsCount}/{k} approvals
              {isMofNUnlocked ? " · unlocked" : " · waiting"}
            </span>
          )}
          {isTimeLocked &&
            form.onChain.unlock_ms &&
            Number(form.onChain.unlock_ms) > 0 && (
              <span
                className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide bg-amber-50 text-amber-900 border-amber-200"
                title={`unlock_ms = ${form.onChain.unlock_ms}`}
              >
                unlocks{" "}
                {new Date(Number(form.onChain.unlock_ms))
                  .toISOString()
                  .replace("T", " ")
                  .slice(0, 16)}
                Z
              </span>
            )}
        </div>
      </div>

      {/* Members ACL — owner + co-admins. Always shows owner; adds
          co-admin chips as the on-chain query resolves. */}
      <div className="flex items-center gap-1.5 text-xs flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mr-1">
          Members
        </span>
        <MemberChip address={form.onChain.owner} role="owner" />
        {coAdmins.map((addr) => (
          <MemberChip key={addr} address={addr} role="co-admin" />
        ))}
        {membersLoading && coAdmins.length === 0 && (
          <span className="text-muted-foreground">…</span>
        )}
      </div>

      {/* Recent activity — last 3 SubmissionMade events (on chain). */}
      {recentSubs.length > 0 && (
        <div className="flex flex-col gap-0.5 text-xs border-t border-dashed pt-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5">
            Recent activity
          </span>
          {recentSubs.map((s) => (
            <div
              key={s.submissionId}
              className="flex items-center gap-2 px-1 py-0.5"
            >
              <span className="text-muted-foreground tabular-nums">
                {s.submittedAt.replace("T", " ").slice(0, 16)}
              </span>
              <span>·</span>
              <span className="truncate flex-1 min-w-0">
                {s.anonymous ? (
                  <em className="text-muted-foreground">anonymous</em>
                ) : (
                  <SuiNSName address={s.submitter} />
                )}
              </span>
              <code className="text-muted-foreground">
                {s.submissionId.slice(0, 8)}…
              </code>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs">
        <Link
          href={`/forms/${form.id}`}
          className="underline text-muted-foreground hover:text-foreground"
        >
          public link →
        </Link>
        <Link
          href={`/forms/${form.id}/admin`}
          className="underline font-medium"
        >
          open in admin →
        </Link>
      </div>
    </div>
  );
}

/**
 * Empty/locked state shell. Shared by every "you can't see anything yet"
 * branch so the lock UX feels intentional instead of like a blank page.
 */
function LockedShell({
  title,
  message,
  cta,
  error,
  icon = "shield",
}: {
  title: string;
  message: string;
  cta?:
    | { href: string; label: string }
    | { onClick: () => void; label: string; disabled?: boolean };
  error?: string;
  icon?: "lock" | "shield";
}) {
  const Icon = icon === "lock" ? Lock : ShieldCheck;
  return (
    <div className="border rounded-lg p-md flex flex-col gap-3 bg-card max-w-[640px]">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <Icon size={16} />
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {cta &&
        ("href" in cta ? (
          <Link
            href={cta.href}
            className="border rounded px-3 py-1.5 text-sm w-fit bg-foreground text-background hover:opacity-90"
          >
            {cta.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={cta.onClick}
            disabled={cta.disabled}
            className={cn(
              "border rounded px-3 py-1.5 text-sm w-fit bg-foreground text-background",
              cta.disabled
                ? "opacity-60 cursor-not-allowed"
                : "hover:opacity-90",
            )}
          >
            {cta.label}
          </button>
        ))}
    </div>
  );
}

/**
 * Member chip with SuiNS resolution. Compact, color-coded by role.
 */
function MemberChip({
  address,
  role,
}: {
  address: string;
  role: "owner" | "co-admin";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-mono",
        role === "owner"
          ? "bg-foreground/5 border-foreground/20"
          : "bg-card border-border",
      )}
      title={`${address} · ${role}`}
    >
      <span className="text-[9px] uppercase tracking-wide opacity-60">
        {role === "owner" ? "★" : "●"}
      </span>
      <SuiNSName address={address} />
    </span>
  );
}

interface FirstEventResult {
  txDigest: string;
}

async function queryFirstEventByFormId(
  fullnodeUrl: string,
  moveEventType: string,
  formId: string,
): Promise<FirstEventResult | null> {
  // Targeted server-side filter; falls back to type-only scan if RPC
  // rejects the All+MoveEventField combination.
  try {
    const resp = await fetch(fullnodeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_queryEvents",
        params: [
          {
            All: [
              { MoveEventType: moveEventType },
              { MoveEventField: { path: "/form_id", value: formId } },
            ],
          },
          null,
          1,
          true,
        ],
      }),
    });
    const data = (await resp.json()) as {
      result?: {
        data?: Array<{ id?: { txDigest?: string }; parsedJson?: unknown }>;
      };
      error?: unknown;
    };
    if (data.error) throw new Error(JSON.stringify(data.error));
    const first = data.result?.data?.[0];
    const digest = first?.id?.txDigest;
    return digest ? { txDigest: digest } : null;
  } catch {
    const resp = await fetch(fullnodeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_queryEvents",
        params: [{ MoveEventType: moveEventType }, null, 200, true],
      }),
    });
    const data = (await resp.json()) as {
      result?: {
        data?: Array<{
          id?: { txDigest?: string };
          parsedJson?: { form_id?: string };
        }>;
      };
    };
    const first = (data.result?.data ?? []).find(
      (e) => e.parsedJson?.form_id === formId,
    );
    const digest = first?.id?.txDigest;
    return digest ? { txDigest: digest } : null;
  }
}

interface TxBlock {
  objectChanges?: Array<{
    type: string;
    objectType?: string;
    owner?:
      | { AddressOwner?: string }
      | { ObjectOwner?: string }
      | { Shared?: unknown }
      | string;
  }>;
}

async function getTransactionBlock(
  fullnodeUrl: string,
  digest: string,
): Promise<TxBlock> {
  const resp = await fetch(fullnodeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sui_getTransactionBlock",
      params: [digest, { showObjectChanges: true }],
    }),
  });
  const data = (await resp.json()) as { result?: TxBlock };
  return data.result ?? {};
}

function parseSealServers(raw: string): { objectId: string; weight: number }[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Array<{ objectId: string; weight?: number }>;
    return arr.map((s) => ({ objectId: s.objectId, weight: s.weight ?? 1 }));
  } catch {
    return [];
  }
}

/**
 * Format a SUI amount in MIST (1 SUI = 10^9 MIST) as a short decimal
 * string with at most 3 fractional digits, trimming trailing zeros.
 * Used by the dashboard's bounty TVL metric.
 */
function formatSui(mist: bigint): string {
  const SCALE = BigInt(1_000_000_000);
  const whole = mist / SCALE;
  const frac = mist % SCALE;
  if (frac === BigInt(0)) return whole.toString();
  // 9 decimal digits of fraction, padded with leading zeros
  const fracStr = frac.toString().padStart(9, "0").slice(0, 3);
  const trimmed = fracStr.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole.toString();
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

// ---- helpers --------------------------------------------------------------

async function queryEventsByFormId(
  fullnodeUrl: string,
  moveEventType: string,
  formId: string,
): Promise<SubmissionEvent[]> {
  // Try the targeted server-side filter first; fall back to type-only
  // global scan if the RPC rejects the All+MoveEventField combination.
  try {
    const resp = await fetch(fullnodeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_queryEvents",
        params: [
          {
            All: [
              { MoveEventType: moveEventType },
              { MoveEventField: { path: "/form_id", value: formId } },
            ],
          },
          null,
          200,
          true,
        ],
      }),
    });
    const data = (await resp.json()) as {
      result?: { data?: Array<{ parsedJson?: SubmissionEvent }> };
      error?: unknown;
    };
    if (data.error) throw new Error(JSON.stringify(data.error));
    return (data.result?.data ?? [])
      .map((e) => e.parsedJson)
      .filter((p): p is SubmissionEvent => !!p);
  } catch {
    const resp = await fetch(fullnodeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "suix_queryEvents",
        params: [{ MoveEventType: moveEventType }, null, 200, true],
      }),
    });
    const data = (await resp.json()) as {
      result?: { data?: Array<{ parsedJson?: SubmissionEvent }> };
    };
    return (data.result?.data ?? [])
      .map((e) => e.parsedJson)
      .filter((p): p is SubmissionEvent => !!p && p.form_id === formId);
  }
}

function exportCsv(rows: SubmissionRow[]) {
  const header = [
    "form_id",
    "form_title",
    "tier",
    "submission_id",
    "submitter",
    "anonymous",
    "submitted_at",
    "payload_blob_id",
    "encrypted",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.formId,
        csvEscape(r.formTitle),
        TIER_LABELS[r.formTier] ?? String(r.formTier),
        r.submissionId,
        r.anonymous ? "" : r.submitter,
        r.anonymous ? "yes" : "no",
        r.submittedAt,
        r.payloadBlobId,
        r.encrypted ? "yes" : "no",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `echo-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
