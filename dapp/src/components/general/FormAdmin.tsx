"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import Link from "next/link";
import {
  Download,
  Lock,
  Unlock,
  Archive,
  Unlock as UnlockIcon,
  Sparkles,
} from "lucide-react";
import { clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import {
  PrivacyTier,
  buildArchiveFormTx,
  buildCloseFormTx,
  buildIssueCreditTx,
  buildSealApproveTxBytes,
  getSealClient,
  readBytesViaAggregator,
  readJsonViaAggregator,
  SessionKey,
  tierIdentity,
  type FormMetadata,
  type FormSchema,
  type SubmissionPayload,
} from "@/lib/echo";
import { BountyPanel } from "./BountyPanel";
import { useDemoAdminMode } from "./DemoAdminToggle";
import { TimeLockBadge } from "./TimeLockBadge";
import { MarkdownView } from "./MarkdownView";

interface OnChainForm {
  schema_blob_id: string;
  schema_version: string;
  metadata_blob_id: string;
  owner: string;
  privacy_tier: number;
  status: number;
  submission_count: string;
  unlock_ms?: string;
}

interface OnChainSubmissionRef {
  form_id: string;
  payload_blob_id: string;
  schema_version: string;
  submitter: string;
  commitment: number[];
  submitted_ms: string;
}

interface SubmissionEvent {
  form_id: string;
  submission_id: string;
  submitter: string;
  schema_version: string;
  anonymous: boolean;
}

interface SubmissionRow {
  submissionId: string;
  submitter: string;
  anonymous: boolean;
  submittedAt: string;
  payloadBlobId: string;
  payload: SubmissionPayload | null;
  payloadError?: string;
  encrypted: boolean;
}

const STATUS_LABELS: Record<number, string> = {
  1: "open",
  2: "closed",
  3: "archived",
};

export const FormAdmin = ({ formId }: { formId: string }) => {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const queryClient = useQueryClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;
  const demoToggleOn = useDemoAdminMode();

  const formQuery = useQuery({
    queryKey: ["echo", "form-admin", formId],
    queryFn: async () => {
      const resp = await suiClient.getObject({
        objectId: formId,
        include: { json: true },
      });
      const onChain = resp.object.json as OnChainForm | null;
      if (!onChain) throw new Error("Form not found.");
      const network = clientConfig.WALRUS_NETWORK;
      const [schema, metadata] = await Promise.all([
        readJsonViaAggregator<FormSchema>(onChain.schema_blob_id, {
          network,
        }).catch(() => null),
        readJsonViaAggregator<FormMetadata>(onChain.metadata_blob_id, {
          network,
        }).catch(() => ({ title: "(metadata unavailable)" })),
      ]);
      return { onChain, schema, metadata };
    },
    enabled: formId.startsWith("0x"),
    // Form on-chain object is mostly stable (status flips rarely, schema
    // never changes via this page). Schema/metadata are content-addressed.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const ownerCapQuery = useQuery({
    queryKey: ["echo", "owner-cap", formId, account?.address],
    queryFn: async () => {
      if (!account) return null;
      const owned = await suiClient.listOwnedObjects({
        owner: account.address,
        type: `${packageId}::form::FormOwnerCap`,
        include: { json: true },
        limit: 100,
      });
      const match = (
        owned.objects as unknown as Array<{
          objectId: string;
          json: { form_id: string };
        }>
      ).find((c) => c.json?.form_id === formId);
      return match?.objectId ?? null;
    },
    enabled: !!account?.address && packageId.startsWith("0x"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // Stage A: events + on-chain submission objects (tier-independent — runs
  // in parallel with formQuery instead of waiting on it).
  const submissionEventsQuery = useQuery({
    queryKey: ["echo", "submissions-events", formId],
    queryFn: async (): Promise<
      Array<{
        submissionId: string;
        submitter: string;
        anonymous: boolean;
        submittedAt: string;
        payloadBlobId: string;
      }>
    > => {
      const eventType = `${packageId}::submission::SubmissionMade`;
      // Server-side filter by form_id when supported. Falls back to the
      // global type-only query and client-filters if the RPC doesn't
      // accept the All+MoveEventField shape.
      const events = await queryEventsByFormId(
        clientConfig.SUI_FULLNODE_URL,
        eventType,
        formId,
      );
      if (events.length === 0) return [];
      // Batch all submission getObject calls in one round-trip.
      const subObjs = await suiClient.getObjects({
        objectIds: events.map((e) => e.submission_id),
        include: { json: true },
      });
      const byId = new Map<string, OnChainSubmissionRef>();
      for (const obj of subObjs.objects as unknown as Array<{
        objectId: string;
        json?: OnChainSubmissionRef;
      }>) {
        if (obj.json) byId.set(obj.objectId, obj.json);
      }
      return events.map((e) => {
        const sub = byId.get(e.submission_id);
        return {
          submissionId: e.submission_id,
          submitter: e.submitter,
          anonymous: e.anonymous,
          submittedAt: sub
            ? new Date(Number(sub.submitted_ms)).toISOString()
            : "(unknown)",
          payloadBlobId: sub?.payload_blob_id ?? "",
        };
      });
    },
    enabled: packageId.startsWith("0x") && formId.startsWith("0x"),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Stage B: enrich rows with payload bytes for Public tier only. Splits off
  // so encrypted forms render rows immediately without waiting for any blob.
  const submissionsQuery = useQuery({
    queryKey: [
      "echo",
      "submissions",
      formId,
      formQuery.data?.onChain.privacy_tier,
      submissionEventsQuery.data?.length ?? 0,
    ],
    queryFn: async (): Promise<SubmissionRow[]> => {
      const baseRows = submissionEventsQuery.data ?? [];
      const isPublic = formQuery.data?.onChain.privacy_tier === 0;
      const network = clientConfig.WALRUS_NETWORK;
      if (!isPublic) {
        return baseRows.map((r) => ({
          ...r,
          payload: null,
          encrypted: true,
        }));
      }
      // Public — fetch payload bytes in parallel.
      return Promise.all(
        baseRows.map(async (r): Promise<SubmissionRow> => {
          let payload: SubmissionPayload | null = null;
          let payloadError: string | undefined;
          if (r.payloadBlobId) {
            try {
              payload = await readJsonViaAggregator<SubmissionPayload>(
                r.payloadBlobId,
                { network },
              );
            } catch (err) {
              payloadError = err instanceof Error ? err.message : String(err);
            }
          }
          return { ...r, payload, payloadError, encrypted: false };
        }),
      );
    },
    enabled:
      !!submissionEventsQuery.data &&
      !!formQuery.data &&
      packageId.startsWith("0x"),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!ownerCapQuery.data) throw new Error("Owner cap not found.");
      const tx = buildCloseFormTx({
        packageId,
        formOwnerCapId: ownerCapQuery.data,
        formId,
      });
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });
      if (result.$kind === "FailedTransaction")
        throw new Error("Close transaction failed");
      return result.Transaction.digest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["echo", "form-admin", formId],
      });
    },
  });

  // Per-row "+ reputation" — issues a CreditTicket of `scoreDelta` to the
  // submission's submitter address. Only the cap holder can issue, so we
  // gate the button on isOwner. Anonymous rows have submitter=@0x0 and are
  // explicitly excluded since the on-chain submitter is unknown.
  const [creditedIds, setCreditedIds] = useState<
    Record<string, { delta: number; digest: string }>
  >({});
  const issueCreditMutation = useMutation({
    mutationFn: async (args: {
      submissionId: string;
      recipient: string;
      delta: number;
    }) => {
      if (!ownerCapQuery.data)
        throw new Error("Owner cap required to issue credit.");
      const tx = buildIssueCreditTx({
        packageId,
        formOwnerCapId: ownerCapQuery.data,
        recipient: args.recipient,
        scoreDelta: args.delta,
      });
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });
      if (result.$kind === "FailedTransaction")
        throw new Error("issue_credit transaction failed.");
      return {
        submissionId: args.submissionId,
        delta: args.delta,
        digest: result.Transaction.digest,
      };
    },
    onSuccess: (out) => {
      setCreditedIds((curr) => ({
        ...curr,
        [out.submissionId]: { delta: out.delta, digest: out.digest },
      }));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      if (!ownerCapQuery.data) throw new Error("Owner cap not found.");
      const tx = buildArchiveFormTx({
        packageId,
        formOwnerCapId: ownerCapQuery.data,
        formId,
      });
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });
      if (result.$kind === "FailedTransaction")
        throw new Error("Archive transaction failed");
      return result.Transaction.digest;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["echo", "form-admin", formId],
      });
    },
  });

  const [indexProgress, setIndexProgress] = useState<{
    running: boolean;
    total: number;
    current: number;
    indexed: number;
    errors: string[];
  } | null>(null);

  // Cached decrypted payloads keyed by submissionId. Populated by either the
  // per-row Decrypt button or the bulk "Reveal all" button. Once populated,
  // SubmissionRowView renders the plaintext directly instead of showing a
  // Decrypt button — owner sees every answer with no extra clicks.
  const [revealedById, setRevealedById] = useState<
    Record<string, SubmissionPayload>
  >({});

  // Filter/sort state for the submissions list. Persisted in component
  // state only — could lift into URL params later if shareable views matter.
  const [searchTerm, setSearchTerm] = useState("");
  const [sortDir, setSortDir] = useState<"newest" | "oldest">("newest");
  const [submitterFilter, setSubmitterFilter] = useState<
    "all" | "named" | "anonymous"
  >("all");
  const [stateFilter, setStateFilter] = useState<
    "all" | "decrypted" | "encrypted"
  >("all");

  const revealAllMutation = useMutation({
    mutationFn: async () => {
      const onChain = formQuery.data?.onChain;
      if (!onChain) throw new Error("Form metadata not loaded.");
      const subs = submissionsQuery.data ?? [];
      const targets = subs.filter(
        (s) => s.encrypted && !revealedById[s.submissionId],
      );
      if (targets.length === 0) return { revealed: 0, errors: [] };

      // Demo mode: server decrypts each row, no wallet popup.
      if (demoToggleOn && onChain.owner.toLowerCase() === demoAdminAddr) {
        const results = await Promise.allSettled(
          targets.map(async (s) => {
            const resp = await fetch("/api/demo/admin/decrypt", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                formId,
                submissionId: s.submissionId,
                payloadBlobId: s.payloadBlobId,
              }),
            });
            const json = (await resp.json()) as {
              payload?: SubmissionPayload;
              error?: string;
            };
            if (!resp.ok || !json.payload) {
              throw new Error(json.error ?? `HTTP ${resp.status}`);
            }
            return { id: s.submissionId, payload: json.payload };
          }),
        );
        const next: Record<string, SubmissionPayload> = { ...revealedById };
        const errors: string[] = [];
        let revealed = 0;
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.status === "fulfilled") {
            next[r.value.id] = r.value.payload;
            revealed++;
          } else {
            errors.push(
              `${targets[i].submissionId.slice(0, 10)}: ${
                r.reason instanceof Error ? r.reason.message : String(r.reason)
              }`,
            );
          }
        }
        setRevealedById(next);
        return { revealed, errors };
      }

      // Owner path — one wallet popup, then parallel decrypt.
      if (!account) throw new Error("Connect a wallet first.");
      if (!ownerCapQuery.data) {
        throw new Error("You don't hold the FormOwnerCap.");
      }
      const sealServers = parseSealServers(clientConfig.SEAL_KEY_SERVERS);
      if (sealServers.length === 0) {
        throw new Error("NEXT_PUBLIC_SEAL_KEY_SERVERS not configured.");
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
        formId,
        tier: onChain.privacy_tier as PrivacyTier,
        unlockMs: onChain.unlock_ms ? BigInt(onChain.unlock_ms) : undefined,
      });
      const txBytes = await buildSealApproveTxBytes({
        packageId,
        formId,
        formOwnerCapId: ownerCapQuery.data,
        privacyTier: onChain.privacy_tier as PrivacyTier,
        identity,
        senderAddress: account.address,
        suiClient: suiClient as unknown as Parameters<
          typeof buildSealApproveTxBytes
        >[0]["suiClient"],
      });
      const idHex = bytesToHex(identity);
      const network = clientConfig.WALRUS_NETWORK;
      const threshold = onChain.privacy_tier === PrivacyTier.Threshold ? 1 : 1;
      // fetchKeys once — cached for all subsequent decrypts on the same id.
      await seal.fetchKeys({
        ids: [idHex],
        txBytes,
        sessionKey: session,
        threshold,
      });
      const results = await Promise.allSettled(
        targets.map(async (s) => {
          const cipher = await readBytesViaAggregator(s.payloadBlobId, {
            network,
          });
          const plain = await seal.decrypt({
            data: cipher,
            sessionKey: session,
            txBytes,
          });
          const payload = JSON.parse(
            new TextDecoder().decode(plain),
          ) as SubmissionPayload;
          return { id: s.submissionId, payload };
        }),
      );
      const next: Record<string, SubmissionPayload> = { ...revealedById };
      const errors: string[] = [];
      let revealed = 0;
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === "fulfilled") {
          next[r.value.id] = r.value.payload;
          revealed++;
        } else {
          errors.push(
            `${targets[i].submissionId.slice(0, 10)}: ${
              r.reason instanceof Error ? r.reason.message : String(r.reason)
            }`,
          );
        }
      }
      setRevealedById(next);
      return { revealed, errors };
    },
  });

  const indexAllMutation = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error("Connect a wallet first.");
      if (!ownerCapQuery.data && !demoToggleOn) {
        throw new Error(
          "Only the FormOwnerCap holder can index encrypted forms.",
        );
      }
      const onChain = formQuery.data?.onChain;
      if (!onChain) throw new Error("Form metadata not loaded.");
      const subs = submissionsQuery.data ?? [];
      if (subs.length === 0) {
        setIndexProgress({
          running: false,
          total: 0,
          current: 0,
          indexed: 0,
          errors: [],
        });
        return { indexed: 0, total: 0 };
      }

      const sealServers = parseSealServers(clientConfig.SEAL_KEY_SERVERS);
      if (sealServers.length === 0) {
        throw new Error(
          "NEXT_PUBLIC_SEAL_KEY_SERVERS not configured; can't decrypt.",
        );
      }
      const seal = getSealClient({
        suiClient: suiClient as unknown as Parameters<
          typeof getSealClient
        >[0]["suiClient"],
        serverConfigs: sealServers,
        verifyKeyServers: false,
      });

      // One SessionKey + one wallet popup for the whole batch.
      const session = await SessionKey.create({
        address: account.address,
        packageId,
        ttlMin: 30,
        suiClient: suiClient as unknown as Parameters<
          typeof SessionKey.create
        >[0]["suiClient"],
      });
      const personalMessage = session.getPersonalMessage();
      const sig = await dAppKit.signPersonalMessage({
        message: personalMessage,
      });
      await session.setPersonalMessageSignature(sig.signature);

      const identity = tierIdentity({
        formId,
        tier: onChain.privacy_tier as PrivacyTier,
        unlockMs: onChain.unlock_ms ? BigInt(onChain.unlock_ms) : undefined,
      });
      const txBytes = await buildSealApproveTxBytes({
        packageId,
        formId,
        formOwnerCapId: ownerCapQuery.data ?? undefined,
        privacyTier: onChain.privacy_tier as PrivacyTier,
        identity,
        senderAddress: account.address,
        suiClient: suiClient as unknown as Parameters<
          typeof buildSealApproveTxBytes
        >[0]["suiClient"],
      });
      const idHex = bytesToHex(identity);
      const network = clientConfig.WALRUS_NETWORK;
      const threshold = onChain.privacy_tier === PrivacyTier.Threshold ? 1 : 1;

      setIndexProgress({
        running: true,
        total: subs.length,
        current: 0,
        indexed: 0,
        errors: [],
      });

      let indexed = 0;
      const errors: string[] = [];
      for (let i = 0; i < subs.length; i++) {
        const s = subs[i];
        setIndexProgress((prev) => (prev ? { ...prev, current: i + 1 } : prev));
        try {
          const cipher = await readBytesViaAggregator(s.payloadBlobId, {
            network,
          });
          await seal.fetchKeys({
            ids: [idHex],
            txBytes,
            sessionKey: session,
            threshold,
          });
          const plainBytes = await seal.decrypt({
            data: cipher,
            sessionKey: session,
            txBytes,
          });
          const payload = JSON.parse(
            new TextDecoder().decode(plainBytes),
          ) as SubmissionPayload;
          const text = flattenAnswersToText(payload, s.submissionId);
          if (!text) continue;
          const resp = await fetch("/api/insights/index_one", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ formId, text }),
          });
          if (!resp.ok) {
            const j = (await resp.json().catch(() => ({}))) as {
              error?: string;
            };
            throw new Error(j.error ?? `HTTP ${resp.status}`);
          }
          indexed++;
          setIndexProgress((prev) => (prev ? { ...prev, indexed } : prev));
        } catch (e) {
          errors.push(
            `${s.submissionId.slice(0, 10)}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        }
      }

      setIndexProgress((prev) =>
        prev ? { ...prev, running: false, errors } : prev,
      );
      return { indexed, total: subs.length, errors };
    },
  });

  if (formQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (formQuery.error || !formQuery.data) {
    return (
      <p className="text-sm text-destructive">
        {(formQuery.error as Error | null)?.message ?? "Form not found."}
      </p>
    );
  }

  const { onChain, schema, metadata } = formQuery.data;
  const demoAdminAddr = clientConfig.DEMO_ADMIN_ADDRESS.toLowerCase();
  const demoMode =
    demoToggleOn &&
    !!demoAdminAddr &&
    onChain.owner.toLowerCase() === demoAdminAddr;
  if (!account && !demoMode) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect a wallet to view admin tools.
      </p>
    );
  }
  const isOwner = !!ownerCapQuery.data;
  const submissions = submissionsQuery.data ?? [];

  // Apply search + filter + sort to derive the visible row list. Search
  // matches against the submitter address and any decrypted-payload text;
  // submitterFilter splits anonymous vs named; stateFilter splits encrypted
  // vs decrypted (uses revealedById/payload to detect plaintext-available).
  const displayedSubmissions = (() => {
    const search = searchTerm.trim().toLowerCase();
    let rows = submissions.filter((s) => {
      const decrypted = revealedById[s.submissionId] ?? s.payload;
      const isDecryptedRow = !!decrypted;
      if (submitterFilter === "anonymous" && !s.anonymous) return false;
      if (submitterFilter === "named" && s.anonymous) return false;
      if (stateFilter === "decrypted" && !isDecryptedRow) return false;
      if (stateFilter === "encrypted" && isDecryptedRow) return false;
      if (!search) return true;
      const haystack = [
        s.submissionId,
        s.submitter,
        s.payloadBlobId,
        decrypted ? JSON.stringify(decrypted.answers) : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
    rows = [...rows].sort((a, b) => {
      const ta = Date.parse(a.submittedAt) || 0;
      const tb = Date.parse(b.submittedAt) || 0;
      return sortDir === "newest" ? tb - ta : ta - tb;
    });
    return rows;
  })();

  // Authority matrix per privacy tier — drives every "can the user click this"
  // decision so the UI never offers actions that fail with a cryptic SDK
  // error. Single source of truth for permission gating.
  const tier = onChain.privacy_tier;
  const isPublicTier = tier === 0;
  const isTimeLockedTier = tier === 3;
  const unlockMs = onChain.unlock_ms ? Number(onChain.unlock_ms) : 0;
  const isUnlocked = isTimeLockedTier && unlockMs > 0 && Date.now() >= unlockMs;
  // Decrypt eligibility:
  //   Public:                no decrypt needed
  //   TimeLocked + unlocked: anyone can decrypt (permissionless)
  //   TimeLocked locked:     nobody can decrypt yet
  //   AdminOnly/Threshold/Conditional:
  //     - cap holder (own wallet) ✓
  //     - demo mode (server signs as demo cap holder) ✓
  //     - anyone else ✗
  const canDecrypt =
    isPublicTier ||
    (isTimeLockedTier && isUnlocked) ||
    (!isTimeLockedTier && (isOwner || demoMode));
  const decryptDisabledReason = !canDecrypt
    ? isTimeLockedTier
      ? `Time-locked until ${new Date(unlockMs).toLocaleString()} — no one can decrypt yet.`
      : "You don't hold the FormOwnerCap. Toggle Demo admin (if available) or connect the owner wallet."
    : null;

  return (
    <div className="flex flex-col gap-md">
      <header className="flex flex-col gap-1">
        <Link href="/forms" className="text-xs underline text-muted-foreground">
          ← All forms
        </Link>
        <h1 className="text-2xl font-semibold">{metadata.title}</h1>
        <p className="text-xs text-muted-foreground inline-flex items-center gap-2 flex-wrap">
          <span>
            {STATUS_LABELS[onChain.status] ?? "?"} · {onChain.submission_count}{" "}
            submissions ·{" "}
            <Link href={`/forms/${formId}`} className="underline">
              public link
            </Link>
          </span>
          {isTimeLockedTier && unlockMs > 0 && (
            <TimeLockBadge unlockMs={unlockMs} />
          )}
        </p>
      </header>

      {demoMode && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 inline-flex items-start gap-2">
          <Sparkles size={14} className="mt-0.5 shrink-0" />
          <span>
            <strong>Demo admin mode.</strong> Reads happen server-side using a
            shared demo key. Treat this as a public showcase — never enable for
            forms that depend on the AdminOnly trust boundary.
          </span>
        </p>
      )}
      {!isOwner && !demoMode && (
        <p className="text-sm text-amber-700">
          You don&apos;t hold the FormOwnerCap. Close/Archive disabled.
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          disabled={!isOwner || onChain.status !== 1 || closeMutation.isPending}
          onClick={() => closeMutation.mutate()}
          className={cn(
            "border rounded px-3 py-1 text-sm flex items-center gap-1",
            isOwner && onChain.status === 1
              ? "hover:bg-accent"
              : "opacity-60 cursor-not-allowed",
          )}
        >
          <Lock size={14} /> Close
        </button>
        <button
          type="button"
          disabled={
            !isOwner || onChain.status === 3 || archiveMutation.isPending
          }
          onClick={() => archiveMutation.mutate()}
          className={cn(
            "border rounded px-3 py-1 text-sm flex items-center gap-1",
            isOwner && onChain.status !== 3
              ? "hover:bg-accent"
              : "opacity-60 cursor-not-allowed",
          )}
        >
          <Archive size={14} /> Archive
        </button>
        <button
          type="button"
          disabled={submissions.length === 0}
          onClick={() => exportCsv(submissions, schema, metadata.title)}
          className={cn(
            "border rounded px-3 py-1 text-sm flex items-center gap-1",
            submissions.length > 0
              ? "hover:bg-accent"
              : "opacity-60 cursor-not-allowed",
          )}
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {(closeMutation.error || archiveMutation.error) && (
        <p className="text-sm text-destructive">
          {(closeMutation.error || archiveMutation.error)?.message}
        </p>
      )}

      <section>
        <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Submissions ({displayedSubmissions.length}
            {displayedSubmissions.length !== submissions.length
              ? ` of ${submissions.length}`
              : ""}
            )
          </h2>
          {canDecrypt &&
            !isPublicTier &&
            submissions.some(
              (s) => s.encrypted && !revealedById[s.submissionId],
            ) && (
              <button
                type="button"
                onClick={() => revealAllMutation.mutate()}
                disabled={revealAllMutation.isPending}
                title={
                  demoMode
                    ? "Server decrypts every submission via the demo key — no wallet popup."
                    : "Sign one personal message; this dapp decrypts every encrypted row in parallel locally."
                }
                className={cn(
                  "border rounded px-3 py-1 text-xs flex items-center gap-1",
                  revealAllMutation.isPending
                    ? "opacity-60 cursor-not-allowed"
                    : "bg-foreground text-background hover:opacity-90",
                )}
              >
                <Unlock size={12} />
                {revealAllMutation.isPending
                  ? "Revealing…"
                  : `Reveal all (${
                      submissions.filter(
                        (s) => s.encrypted && !revealedById[s.submissionId],
                      ).length
                    })`}
              </button>
            )}
          {canDecrypt &&
            !isPublicTier &&
            !demoMode &&
            isOwner &&
            submissions.length > 0 && (
              <button
                type="button"
                onClick={() => indexAllMutation.mutate()}
                disabled={indexAllMutation.isPending}
                title="Decrypts each submission locally in your browser, then sends only the flattened text to Memwal. Server never sees ciphertext or session keys."
                className={cn(
                  "border rounded px-3 py-1 text-xs flex items-center gap-1",
                  indexAllMutation.isPending
                    ? "opacity-60 cursor-not-allowed"
                    : "hover:bg-accent",
                )}
              >
                <Sparkles size={12} />
                {indexAllMutation.isPending
                  ? indexProgress
                    ? `Indexing ${indexProgress.current}/${indexProgress.total}…`
                    : "Indexing…"
                  : "Index for Insights"}
              </button>
            )}
        </div>
        {indexProgress && !indexProgress.running && (
          <p className="text-xs text-muted-foreground mb-2">
            ✓ Indexed {indexProgress.indexed}/{indexProgress.total} via Memwal.
            {indexProgress.errors.length > 0 && (
              <>
                {" "}
                {indexProgress.errors.length} skipped:{" "}
                <code>{indexProgress.errors[0]}</code>
                {indexProgress.errors.length > 1 &&
                  ` (+${indexProgress.errors.length - 1} more)`}
              </>
            )}{" "}
            Ask questions on{" "}
            <Link href="/insights" className="underline">
              /insights
            </Link>
            .
          </p>
        )}
        {indexAllMutation.error instanceof Error && (
          <p className="text-xs text-destructive mb-2">
            {indexAllMutation.error.message}
          </p>
        )}
        {revealAllMutation.error instanceof Error && (
          <p className="text-xs text-destructive mb-2">
            {revealAllMutation.error.message}
          </p>
        )}
        {revealAllMutation.data && revealAllMutation.data.revealed > 0 && (
          <p className="text-xs text-emerald-700 mb-2">
            ✓ Revealed {revealAllMutation.data.revealed} submission
            {revealAllMutation.data.revealed === 1 ? "" : "s"}.
            {revealAllMutation.data.errors.length > 0 &&
              ` ${revealAllMutation.data.errors.length} failed.`}
          </p>
        )}
        {submissions.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
            <input
              type="text"
              placeholder="Search address, blob, or decrypted text…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border rounded px-2 py-1 flex-1 min-w-[220px]"
            />
            <select
              value={sortDir}
              onChange={(e) =>
                setSortDir(e.target.value as "newest" | "oldest")
              }
              className="border rounded px-2 py-1"
              title="Sort by submitted_ms"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <FilterChip
              label="All"
              active={submitterFilter === "all"}
              onClick={() => setSubmitterFilter("all")}
            />
            <FilterChip
              label="Named"
              active={submitterFilter === "named"}
              onClick={() => setSubmitterFilter("named")}
            />
            <FilterChip
              label="Anonymous"
              active={submitterFilter === "anonymous"}
              onClick={() => setSubmitterFilter("anonymous")}
            />
            {!isPublicTier && (
              <>
                <span className="text-muted-foreground px-1">·</span>
                <FilterChip
                  label="Any state"
                  active={stateFilter === "all"}
                  onClick={() => setStateFilter("all")}
                />
                <FilterChip
                  label="Decrypted"
                  active={stateFilter === "decrypted"}
                  onClick={() => setStateFilter("decrypted")}
                />
                <FilterChip
                  label="Encrypted"
                  active={stateFilter === "encrypted"}
                  onClick={() => setStateFilter("encrypted")}
                />
              </>
            )}
          </div>
        )}
        {submissionsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading submissions…</p>
        ) : submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : displayedSubmissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No submissions match the current filters.{" "}
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setSubmitterFilter("all");
                setStateFilter("all");
              }}
              className="underline"
            >
              Clear filters
            </button>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {displayedSubmissions.map((s) => (
              <SubmissionRowView
                key={s.submissionId}
                row={s}
                schema={schema}
                formId={formId}
                packageId={packageId}
                privacyTier={onChain.privacy_tier}
                unlockMs={onChain.unlock_ms ?? "0"}
                formOwnerCapId={ownerCapQuery.data ?? null}
                dAppKit={dAppKit}
                suiClient={suiClient}
                accountAddress={account?.address ?? ""}
                demoMode={demoMode}
                canDecrypt={canDecrypt}
                decryptDisabledReason={decryptDisabledReason}
                preDecrypted={revealedById[s.submissionId] ?? null}
                isOwner={isOwner}
                onIssueCredit={(delta) =>
                  issueCreditMutation.mutate({
                    submissionId: s.submissionId,
                    recipient: s.submitter,
                    delta,
                  })
                }
                issuingCredit={
                  issueCreditMutation.isPending &&
                  issueCreditMutation.variables?.submissionId === s.submissionId
                }
                credited={creditedIds[s.submissionId] ?? null}
              />
            ))}
          </ul>
        )}
      </section>

      {account && (
        <BountyPanel
          formId={formId}
          formOwnerCapId={ownerCapQuery.data ?? null}
          isOwner={isOwner}
          callerAddress={account.address}
        />
      )}

      {onChain.status === 2 && (
        <p className="text-sm text-amber-700 inline-flex items-center gap-1">
          <Unlock size={14} /> This form is closed. New submissions blocked on
          chain.
        </p>
      )}
    </div>
  );
};

function SubmissionRowView({
  row,
  schema,
  formId,
  packageId,
  privacyTier,
  unlockMs,
  formOwnerCapId,
  dAppKit,
  suiClient,
  accountAddress,
  demoMode,
  canDecrypt,
  decryptDisabledReason,
  preDecrypted,
  isOwner,
  onIssueCredit,
  issuingCredit,
  credited,
}: {
  row: SubmissionRow;
  schema: FormSchema | null;
  formId: string;
  packageId: string;
  privacyTier: number;
  unlockMs: string;
  formOwnerCapId: string | null;
  dAppKit: ReturnType<typeof useDAppKit>;
  suiClient: ReturnType<ReturnType<typeof useDAppKit>["getClient"]>;
  accountAddress: string;
  demoMode: boolean;
  canDecrypt: boolean;
  decryptDisabledReason: string | null;
  /** Set when "Reveal all" decrypted this row at the form level. */
  preDecrypted: SubmissionPayload | null;
  isOwner: boolean;
  onIssueCredit: (delta: number) => void;
  issuingCredit: boolean;
  credited: { delta: number; digest: string } | null;
}) {
  const [decrypted, setDecrypted] = useState<SubmissionPayload | null>(
    preDecrypted,
  );
  // Sync when bulk reveal updates the cache after we've mounted.
  if (preDecrypted && !decrypted) {
    // setState during render is fine when guarded — this only runs once per
    // bulk reveal completion since `decrypted` becomes truthy on the next
    // render and skips the branch.
    setDecrypted(preDecrypted);
  }
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);

  const decrypt = async () => {
    setDecryptError(null);
    setDecrypting(true);
    try {
      if (demoMode) {
        const resp = await fetch("/api/demo/admin/decrypt", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            formId,
            submissionId: row.submissionId,
            payloadBlobId: row.payloadBlobId,
          }),
        });
        const json = (await resp.json()) as {
          payload?: SubmissionPayload;
          error?: string;
        };
        if (!resp.ok) {
          throw new Error(json.error ?? `HTTP ${resp.status}`);
        }
        if (!json.payload) {
          throw new Error("Demo decrypt returned no payload.");
        }
        setDecrypted(json.payload);
        return;
      }
      const sealServers = parseSealServers(clientConfig.SEAL_KEY_SERVERS);
      if (sealServers.length === 0) {
        throw new Error(
          "NEXT_PUBLIC_SEAL_KEY_SERVERS not configured; can't fetch decryption shares.",
        );
      }
      const seal = getSealClient({
        suiClient: suiClient as unknown as Parameters<
          typeof getSealClient
        >[0]["suiClient"],
        serverConfigs: sealServers,
        verifyKeyServers: false,
      });

      // SessionKey requires the user to sign a personal message.
      const session = await SessionKey.create({
        address: accountAddress,
        packageId,
        ttlMin: 30,
        suiClient: suiClient as unknown as Parameters<
          typeof SessionKey.create
        >[0]["suiClient"],
      });
      const personalMessage = session.getPersonalMessage();
      const sig = await dAppKit.signPersonalMessage({
        message: personalMessage,
      });
      await session.setPersonalMessageSignature(sig.signature);

      // Build a seal_approve_* PTB for this form's tier.
      const identity = tierIdentity({
        formId,
        tier: privacyTier as PrivacyTier,
        unlockMs: unlockMs ? BigInt(unlockMs) : undefined,
      });
      const txBytes = await buildSealApproveTxBytes({
        packageId,
        formId,
        formOwnerCapId: formOwnerCapId ?? undefined,
        privacyTier: privacyTier as PrivacyTier,
        identity,
        senderAddress: accountAddress,
        suiClient: suiClient as unknown as Parameters<
          typeof buildSealApproveTxBytes
        >[0]["suiClient"],
      });

      // Fetch encrypted ciphertext bytes from Walrus aggregator (cached).
      const ciphertext = await readBytesViaAggregator(row.payloadBlobId, {
        network: clientConfig.WALRUS_NETWORK,
      });

      const threshold = privacyTier === PrivacyTier.Threshold ? 1 : 1; // form's own threshold; for now 1
      await seal.fetchKeys({
        ids: [bytesToHex(identity)],
        txBytes,
        sessionKey: session,
        threshold,
      });
      const plainBytes = await seal.decrypt({
        data: ciphertext,
        sessionKey: session,
        txBytes,
      });
      const json = JSON.parse(
        new TextDecoder().decode(plainBytes),
      ) as SubmissionPayload;
      setDecrypted(json);
    } catch (e) {
      setDecryptError(e instanceof Error ? e.message : String(e));
    } finally {
      setDecrypting(false);
    }
  };

  const canIssueCredit = isOwner && !row.anonymous && !demoMode;

  return (
    <li className="border rounded p-3 bg-card flex flex-col gap-1 text-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        <code>{row.submissionId.slice(0, 10)}…</code>
        <span>·</span>
        <span>{row.submittedAt}</span>
        <span>·</span>
        <span>
          {row.anonymous ? "anonymous" : `${row.submitter.slice(0, 10)}…`}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {canIssueCredit && !credited && (
            <button
              type="button"
              onClick={() => onIssueCredit(5)}
              disabled={issuingCredit}
              title="Issue +5 reputation to this submitter (mints a CreditTicket on chain)."
              className={cn(
                "border rounded px-2 py-0.5 text-xs flex items-center gap-1",
                issuingCredit
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:bg-accent",
              )}
            >
              {issuingCredit ? "Issuing…" : "+5 reputation"}
            </button>
          )}
          {credited && (
            <span
              className="text-xs text-emerald-700 inline-flex items-center gap-1"
              title={`tx ${credited.digest}`}
            >
              ✓ +{credited.delta} issued
            </span>
          )}
          {row.encrypted && !decrypted && (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <Lock size={12} /> encrypted
            </span>
          )}
          {decrypted && (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <UnlockIcon size={12} /> decrypted
            </span>
          )}
        </span>
      </div>

      {row.encrypted && !decrypted ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            Payload Walrus blob: <code>{row.payloadBlobId}</code>
          </p>
          <button
            type="button"
            onClick={() => void decrypt()}
            disabled={decrypting || !canDecrypt}
            title={decryptDisabledReason ?? undefined}
            className={cn(
              "border rounded px-3 py-1 text-xs w-fit",
              canDecrypt && !decrypting
                ? "hover:bg-accent"
                : "opacity-60 cursor-not-allowed",
            )}
          >
            {decrypting
              ? "Decrypting…"
              : !canDecrypt
                ? "🔒 No permission"
                : demoMode
                  ? "Decrypt (server, demo mode)"
                  : "Decrypt with Seal"}
          </button>
          {!canDecrypt && decryptDisabledReason && (
            <p className="text-xs text-muted-foreground">
              {decryptDisabledReason}
            </p>
          )}
          {decryptError && (
            <p className="text-xs text-destructive">{decryptError}</p>
          )}
        </div>
      ) : decrypted ? (
        <AnswerList payload={decrypted} schema={schema} />
      ) : row.payloadError ? (
        <p className="text-xs text-destructive">
          Failed to read Walrus payload: {row.payloadError}
        </p>
      ) : row.payload ? (
        <AnswerList payload={row.payload} schema={schema} />
      ) : (
        <p className="text-xs text-muted-foreground">No payload bytes.</p>
      )}
    </li>
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

/** Flatten a decrypted SubmissionPayload to a single text blob for indexing. */
function flattenAnswersToText(
  payload: SubmissionPayload,
  submissionId: string,
): string {
  const parts: string[] = [`[submission ${submissionId.slice(0, 10)}]`];
  for (const [fieldId, ans] of Object.entries(payload.answers)) {
    const text = stringifyAnswer(ans);
    if (text && text.trim() && !text.startsWith("[blob ")) {
      parts.push(`${fieldId}: ${text}`);
    }
  }
  return parts.length > 1 ? parts.join("\n") : "";
}

function AnswerList({
  payload,
  schema,
}: {
  payload: SubmissionPayload;
  schema: FormSchema | null;
}) {
  const fields = schema?.fields ?? [];
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {Object.entries(payload.answers).map(([fieldId, ans]) => {
        const field = fields.find((f) => f.id === fieldId);
        const isRichText = field?.type === "rich_text" && ans.kind === "text";
        return (
          <li key={fieldId} className="flex flex-col gap-0.5">
            <strong className="text-muted-foreground text-xs">
              {field?.label ?? fieldId}:
            </strong>
            {isRichText && ans.kind === "text" ? (
              <div className="border-l-2 border-border pl-3">
                <MarkdownView source={ans.value} />
              </div>
            ) : (
              <span>{stringifyAnswer(ans)}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function stringifyAnswer(ans: SubmissionPayload["answers"][string]): string {
  switch (ans.kind) {
    case "text":
      return ans.value;
    case "choice":
      return Array.isArray(ans.value) ? ans.value.join(", ") : ans.value;
    case "rating":
      return String(ans.value);
    case "checkbox":
      return ans.value ? "yes" : "no";
    case "date":
      return ans.value;
    case "blob":
      return `[blob ${ans.blobId.slice(0, 10)}…]`;
  }
}

async function jsonRpcQueryEvents(
  fullnodeUrl: string,
  moveEventType: string,
): Promise<SubmissionEvent[]> {
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
    .filter((p): p is SubmissionEvent => !!p);
}

/**
 * Fetch SubmissionMade events scoped to a single form. Uses the All+
 * MoveEventField filter so the RPC returns only matching rows — much
 * faster than the global 200-event scan when testnet has many other
 * forms emitting the same event type. Falls back to the global type-only
 * query if the RPC rejects the combined filter.
 */
async function queryEventsByFormId(
  fullnodeUrl: string,
  moveEventType: string,
  formId: string,
): Promise<SubmissionEvent[]> {
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
    // Some RPCs reject the All+MoveEventField combination — fall back.
    const all = await jsonRpcQueryEvents(fullnodeUrl, moveEventType);
    return all.filter((e) => e.form_id === formId);
  }
}

function exportCsv(
  rows: SubmissionRow[],
  schema: FormSchema | null,
  title: string,
) {
  const fields = schema?.fields ?? [];
  const header = [
    "submission_id",
    "submitter",
    "anonymous",
    "submitted_at",
    "payload_blob_id",
    ...fields.map((f) => f.label),
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const ansVals = fields.map((f) => {
      const a = r.payload?.answers?.[f.id];
      return a ? csvEscape(stringifyAnswer(a)) : "";
    });
    lines.push(
      [
        r.submissionId,
        r.anonymous ? "" : r.submitter,
        r.anonymous ? "yes" : "no",
        r.submittedAt,
        r.payloadBlobId,
        ...ansVals,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(title)}-submissions.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border rounded-full px-2 py-0.5",
        active
          ? "bg-foreground text-background"
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}
