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

  return (
    <div className="flex flex-col gap-md">
      {!demoMode && (
        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900">
            <ShieldCheck size={12} /> Wallet admin mode · Seal-verified
          </span>
          <button
            type="button"
            onClick={lockOut}
            className="text-muted-foreground hover:text-foreground underline"
          >
            Lock
          </button>
        </div>
      )}
      {demoMode && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 inline-flex items-start gap-2">
          <Sparkles size={12} className="mt-0.5 shrink-0" />
          <span>
            Showing forms owned by the demo address (
            <code>
              {demoAddress.slice(0, 10)}…{demoAddress.slice(-4)}
            </code>
            ). Status tags are stored in your browser regardless of demo mode.
          </span>
        </p>
      )}

      {/* Roll-up tiles. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Tile label="Forms" value={String(formCards.length)} />
        <Tile label="Submissions" value={String(statusCounts.total)} />
        {STATUSES.map((s) => (
          <Tile
            key={s.value}
            label={s.label}
            value={String(statusCounts[s.value])}
            active={statusFilter === s.value}
            onClick={() =>
              setStatusFilter((c) => (c === s.value ? "all" : s.value))
            }
          />
        ))}
      </div>

      {/* Filter row. */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <input
          type="text"
          placeholder="Search submissions, addresses, blob ids…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border rounded px-2 py-1 flex-1 min-w-[200px]"
        />
        <select
          value={formFilter}
          onChange={(e) => setFormFilter(e.target.value)}
          className="border rounded px-2 py-1 max-w-[260px]"
          title="Filter by form"
        >
          <option value="all">All forms ({formCards.length})</option>
          {formCards.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title} ({TIER_LABELS[f.onChain.privacy_tier] ?? "?"})
            </option>
          ))}
        </select>
        <select
          value={submitterFilter}
          onChange={(e) =>
            setSubmitterFilter(e.target.value as typeof submitterFilter)
          }
          className="border rounded px-2 py-1"
        >
          <option value="all">Any submitter</option>
          <option value="named">Named only</option>
          <option value="anonymous">Anonymous only</option>
        </select>
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
        >
          <Download size={11} /> Export {visible.length} as CSV
        </button>
      </div>

      {/* Active-filter summary. */}
      {(statusFilter !== "all" ||
        formFilter !== "all" ||
        submitterFilter !== "all" ||
        searchTerm) && (
        <p className="text-xs text-muted-foreground">
          Showing {visible.length} of {statusCounts.total}.{" "}
          <button
            type="button"
            onClick={() => {
              setStatusFilter("all");
              setFormFilter("all");
              setSubmitterFilter("all");
              setSearchTerm("");
            }}
            className="underline"
          >
            Clear filters
          </button>
        </p>
      )}

      {/* The list. */}
      {submissionsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">
          Loading submissions across {formCards.length} form
          {formCards.length === 1 ? "" : "s"}…
        </p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {statusCounts.total === 0
            ? "No submissions yet on any of your forms."
            : "Nothing matches the current filters."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((r) => {
            const status = statusMap[r.submissionId] ?? "new";
            return (
              <li
                key={r.submissionId}
                className="border rounded p-3 flex flex-col gap-1 bg-card text-sm"
              >
                <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                  <Link
                    href={`/forms/${r.formId}/admin`}
                    className="underline text-foreground"
                    title={r.formId}
                  >
                    {r.formTitle}
                  </Link>
                  <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                    {TIER_LABELS[r.formTier] ?? "?"}
                  </span>
                  <span>·</span>
                  <code>{r.submissionId.slice(0, 10)}…</code>
                  <span>·</span>
                  <span>{r.submittedAt.replace("T", " ").slice(0, 16)}</span>
                  <span>·</span>
                  <span>
                    {r.anonymous ? (
                      "anonymous"
                    ) : (
                      <SuiNSName address={r.submitter} />
                    )}
                  </span>
                  {r.encrypted && (
                    <span className="ml-auto text-amber-700">🔒 encrypted</span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-wrap mt-1">
                  {STATUSES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setRowStatus(r.submissionId, s.value)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                        status === s.value
                          ? s.chip
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                  <Link
                    href={`/forms/${r.formId}/admin`}
                    className="ml-auto text-xs underline"
                  >
                    open in admin →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

function Tile({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const Comp: "button" | "div" = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "border rounded p-2 flex flex-col gap-0.5 text-left",
        active && "bg-foreground text-background",
        onClick && !active && "hover:bg-accent cursor-pointer",
      )}
    >
      <span className="text-[10px] uppercase tracking-wide opacity-70">
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums">{value}</span>
    </Comp>
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

function parseSealServers(raw: string): { objectId: string; weight: number }[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Array<{ objectId: string; weight?: number }>;
    return arr.map((s) => ({ objectId: s.objectId, weight: s.weight ?? 1 }));
  } catch {
    return [];
  }
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
