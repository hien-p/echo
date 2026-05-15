"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Database,
  Download,
  Globe,
  Lock,
  Unlock,
  Archive,
  ShieldCheck,
  Unlock as UnlockIcon,
  Sparkles,
} from "lucide-react";
import { apiUrl, clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import {
  PrivacyTier,
  buildArchiveFormTx,
  buildCloseFormTx,
  buildIssueCreditTx,
  buildPostApprovalTx,
  buildSealApproveThresholdMofNTxBytes,
  buildSealApproveTxBytes,
  checkDecryptCondition,
  getSealClient,
  listApprovals,
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
import { SuiNSName } from "./SuiNSName";
import { WalrusBlobLink } from "./WalrusBlobLink";
import {
  dispatchWebhook,
  getWebhookUrl,
  setWebhookUrl,
  type WebhookPayload,
} from "@/lib/echo/webhooks";

interface OnChainForm {
  schema_blob_id: string;
  schema_version: string;
  metadata_blob_id: string;
  owner: string;
  privacy_tier: number;
  threshold_n: number; // required approvals (k)
  threshold_m: number; // total admins (n)
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
  // Deep-link: /forms/[id]/admin?focus=<submissionId> scrolls the matching
  // row into view and pulses a Sui-sea ring. Set by dashboard triage rows.
  const searchParams = useSearchParams();
  const focusSubmissionId = searchParams?.get("focus") ?? null;

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

  // Conditional-tier decrypt predicate. Lifted to component top so the
  // hook order stays stable across renders (rules-of-hooks). The query
  // pulls schema from formQuery — gated by `enabled` so it only fires
  // once we have the schema and the form is actually Conditional with
  // a decryptCondition set.
  const decryptCondQuery = useQuery({
    queryKey: [
      "echo",
      "decrypt-cond",
      formId,
      account?.address,
      formQuery.data?.onChain.privacy_tier,
    ],
    queryFn: () =>
      checkDecryptCondition(
        formQuery.data?.schema ?? null,
        account?.address,
        suiClient as unknown as Parameters<typeof checkDecryptCondition>[2],
      ),
    enabled:
      formQuery.data?.onChain.privacy_tier === 4 &&
      !!formQuery.data?.schema?.decryptCondition &&
      !!account?.address,
    staleTime: 30_000,
  });

  // ---- Real m-of-n threshold (ApprovalWitness) -------------------------
  // Polls every 8s while the form is unrevealed so the "k/n approvals"
  // status updates as other admins post their witnesses.
  const isRealThreshold =
    formQuery.data?.onChain.privacy_tier === PrivacyTier.Threshold &&
    (formQuery.data?.onChain.threshold_n ?? 1) >= 2;
  const approvalsQuery = useQuery({
    queryKey: ["echo", "approvals", formId],
    queryFn: () =>
      listApprovals({
        fullnodeUrl: clientConfig.SUI_FULLNODE_URL,
        packageId,
        formId,
      }),
    enabled: isRealThreshold,
    refetchInterval: 8_000,
    staleTime: 4_000,
  });

  const postApprovalMutation = useMutation({
    mutationFn: async () => {
      if (!account) throw new Error("Connect a wallet first.");
      if (!ownerCapQuery.data) {
        throw new Error("You don't hold a FormOwnerCap for this form.");
      }
      const onChain = formQuery.data?.onChain;
      if (!onChain) throw new Error("Form metadata not loaded.");
      const identity = tierIdentity({
        formId,
        tier: onChain.privacy_tier as PrivacyTier,
      });
      const tx = buildPostApprovalTx({
        packageId,
        formOwnerCapId: ownerCapQuery.data,
        formId,
        identity,
      });
      const result = await dAppKit.signAndExecuteTransaction({
        transaction: tx,
      });
      if (result.$kind === "FailedTransaction") {
        throw new Error("post_approval transaction failed.");
      }
      return result.Transaction.digest;
    },
    onSuccess: () => {
      // Re-poll approvals immediately so the UI flips from "0/k" to "1/k".
      void approvalsQuery.refetch();
    },
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
            const resp = await fetch(apiUrl("/api/demo/admin/decrypt"), {
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
      const requiredKForGuard = onChain.threshold_n || 1;
      const isMofN =
        onChain.privacy_tier === PrivacyTier.Threshold &&
        requiredKForGuard >= 2;
      // For m-of-n with k≥2, anyone (not just cap holders) can finalize
      // decrypt once k witnesses exist on chain. For other tiers a cap is
      // still required by the corresponding seal_approve_* predicate.
      if (!isMofN && !ownerCapQuery.data) {
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
      const requiredK = onChain.threshold_n || 1;
      const useMofN =
        onChain.privacy_tier === PrivacyTier.Threshold && requiredK >= 2;
      let txBytes: Uint8Array;
      if (useMofN) {
        const approvals = approvalsQuery.data ?? [];
        if (approvals.length < requiredK) {
          throw new Error(
            `Need ${requiredK} approvals; ${approvals.length} on chain so far. Ask the other admin(s) to click "Approve decrypt".`,
          );
        }
        txBytes = await buildSealApproveThresholdMofNTxBytes({
          packageId,
          formId,
          identity,
          witnessIds: approvals.slice(0, requiredK).map((a) => a.witnessId),
          senderAddress: account.address,
          suiClient: suiClient as unknown as Parameters<
            typeof buildSealApproveThresholdMofNTxBytes
          >[0]["suiClient"],
        });
      } else {
        txBytes = await buildSealApproveTxBytes({
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
      }
      const idHex = bytesToHex(identity);
      const network = clientConfig.WALRUS_NETWORK;
      // Seal threshold = number of key servers needed to release shares.
      // For Threshold tier we encrypted with form.threshold_n; mirror that
      // here so fetchKeys aligns. For other tiers a single share suffices.
      const threshold =
        onChain.privacy_tier === PrivacyTier.Threshold
          ? onChain.threshold_n || 1
          : 1;
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
      const requiredKIdx = onChain.threshold_n || 1;
      const useMofNIdx =
        onChain.privacy_tier === PrivacyTier.Threshold && requiredKIdx >= 2;
      let txBytes: Uint8Array;
      if (useMofNIdx) {
        const approvals = approvalsQuery.data ?? [];
        if (approvals.length < requiredKIdx) {
          throw new Error(
            `Indexing requires ${requiredKIdx} approvals; ${approvals.length} on chain so far.`,
          );
        }
        txBytes = await buildSealApproveThresholdMofNTxBytes({
          packageId,
          formId,
          identity,
          witnessIds: approvals.slice(0, requiredKIdx).map((a) => a.witnessId),
          senderAddress: account.address,
          suiClient: suiClient as unknown as Parameters<
            typeof buildSealApproveThresholdMofNTxBytes
          >[0]["suiClient"],
        });
      } else {
        txBytes = await buildSealApproveTxBytes({
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
      }
      const idHex = bytesToHex(identity);
      const network = clientConfig.WALRUS_NETWORK;
      // Seal threshold = number of key servers needed to release shares.
      // For Threshold tier we encrypted with form.threshold_n; mirror that
      // here so fetchKeys aligns. For other tiers a single share suffices.
      const threshold =
        onChain.privacy_tier === PrivacyTier.Threshold
          ? onChain.threshold_n || 1
          : 1;

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
          const resp = await fetch(apiUrl("/api/insights/index_one"), {
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
  // Real m-of-n: once k witnesses exist, anyone can finalize decrypt
  // (analogous to TimeLocked permissionless reveal, gated on votes-to-release
  // instead of clock).
  const requiredK = onChain.threshold_n || 1;
  const isMofNTier = tier === PrivacyTier.Threshold && requiredK >= 2;
  const approvalsCount = approvalsQuery.data?.length ?? 0;
  const isMofNUnlocked = isMofNTier && approvalsCount >= requiredK;
  const youAlreadyApproved =
    isMofNTier &&
    !!account &&
    (approvalsQuery.data ?? []).some(
      (a) => a.signer.toLowerCase() === account.address.toLowerCase(),
    );
  // Decrypt eligibility:
  //   Public:                no decrypt needed
  //   TimeLocked + unlocked: anyone can decrypt (permissionless)
  //   m-of-n (k>=2) once k approvals: anyone can decrypt (permissionless)
  //   AdminOnly/Threshold(k=1)/Conditional:
  //     - cap holder ✓ · demo mode ✓ · anyone else ✗
  const isConditionalTier = tier === 4;
  const baseCanDecrypt =
    isPublicTier ||
    (isTimeLockedTier && isUnlocked) ||
    (isMofNTier && isMofNUnlocked) ||
    (!isTimeLockedTier && !isMofNTier && (isOwner || demoMode)) ||
    // m-of-n cap holder can also use the cap-only path while waiting for
    // peers, but only if approvals are already satisfied — otherwise the
    // m-of-n PTB path applies above. Falls through to unlocked check.
    false;

  // Conditional tier overlays the gating predicate on top of the base
  // capability check. demoMode bypass intentionally sticks (server-decrypt
  // pretends to be the cap holder; UX of "demo mode but blocked by
  // condition" would be confusing for the showcase).
  const condBlocked =
    isConditionalTier &&
    !demoMode &&
    schema?.decryptCondition &&
    decryptCondQuery.data &&
    !decryptCondQuery.data.ok;

  const canDecrypt = baseCanDecrypt && !condBlocked;
  const decryptDisabledReason = !canDecrypt
    ? isTimeLockedTier && !isUnlocked
      ? `Time-locked until ${new Date(unlockMs).toLocaleString()} — no one can decrypt yet.`
      : isMofNTier && !isMofNUnlocked
        ? `Multi-admin threshold · ${approvalsCount}/${requiredK} approvals on chain. Need ${requiredK - approvalsCount} more co-admin(s) to click "Approve decrypt".`
        : condBlocked
          ? `Conditional tier · ${decryptCondQuery.data?.reason ?? "predicate failed"}`
          : "You don't hold the FormOwnerCap. Toggle Demo admin (if available) or connect the owner wallet."
    : null;

  const revealCopy = isTimeLockedTier
    ? isUnlocked
      ? `Unlocked ${new Date(unlockMs).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} — submissions are now decryptable`
      : `Unlocks ${new Date(unlockMs).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} — sealed until then`
    : isMofNTier
      ? `${requiredK}-admin threshold to reveal · ${approvalsCount}/${requiredK} on chain`
      : isConditionalTier
        ? "Reveals when the decrypt predicate passes"
        : "Admin can reveal anytime";

  return (
    <div className="flex flex-col gap-md">
      <header className="flex flex-col gap-2">
        <Link href="/forms" className="text-xs underline text-muted-foreground">
          ← All forms
        </Link>
        <h1 className="text-2xl font-semibold">{metadata.title}</h1>

        {/* G3 — outcome subtitle: the reveal story in one line. */}
        <p className="text-sm text-foreground/85">{revealCopy}</p>

        {/* G2 — trust hero strip: the pitch that judges register in 1s. */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-foreground/80">
            <Lock size={11} className="opacity-70" />
            End-to-end encrypted
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-foreground/80">
            <ShieldCheck size={11} className="opacity-70" />
            Sealed by Seal
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-foreground/80">
            <Database size={11} className="opacity-70" />
            Stored on Walrus
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-foreground/80">
            <Globe size={11} className="opacity-70" />
            Settled on Sui
          </span>
        </div>

        {/* G8 — Walrus artifact chips: brand-forward, hash hidden in tooltip. */}
        <div className="flex flex-wrap items-center gap-2 mt-0.5">
          <WalrusBlobLink
            variant="pill"
            label="Schema"
            blobId={onChain.schema_blob_id}
          />
          <WalrusBlobLink
            variant="pill"
            label="Metadata"
            blobId={onChain.metadata_blob_id}
          />
        </div>

        {/* Operator info kept compact below the pitch. */}
        <p className="text-xs text-muted-foreground inline-flex items-center gap-2 flex-wrap mt-1">
          <span>
            {STATUS_LABELS[onChain.status] ?? "?"} · {onChain.submission_count}{" "}
            submissions · by <SuiNSName address={onChain.owner} /> ·{" "}
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
        <p className="text-sm text-foreground/80 bg-muted/40 border border-border rounded p-2 inline-flex items-start gap-2">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-amber-500" />
          <span>
            <strong>Demo mode.</strong> This admin view is intentionally public
            for the showcase — reads decrypt via a shared demo key. Production
            forms gate this page to the form owner&apos;s wallet.
          </span>
        </p>
      )}
      {!isOwner && !demoMode && (
        <p className="text-sm text-amber-700">
          You don&apos;t hold the FormOwnerCap. Close/Archive disabled.
        </p>
      )}

      {isMofNTier && (
        <div
          className={cn(
            "border rounded p-3 flex flex-col sm:flex-row sm:items-center gap-2 text-sm",
            isMofNUnlocked
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-amber-50 border-amber-200 text-amber-900",
          )}
        >
          <span className="flex-1">
            <strong>
              Multi-admin threshold · {approvalsCount}/{requiredK} approvals
            </strong>
            {isMofNUnlocked ? (
              <> · data is decryptable by anyone holding the witness IDs.</>
            ) : (
              <>
                {" "}
                · waiting for {requiredK - approvalsCount} more co-admin
                {requiredK - approvalsCount === 1 ? "" : "s"}.
              </>
            )}
          </span>
          {isOwner &&
            !youAlreadyApproved &&
            !isMofNUnlocked &&
            account &&
            !demoMode && (
              <button
                type="button"
                onClick={() => postApprovalMutation.mutate()}
                disabled={postApprovalMutation.isPending}
                className={cn(
                  "border rounded px-3 py-1 text-sm flex items-center gap-1 bg-foreground text-background",
                  postApprovalMutation.isPending
                    ? "opacity-60 cursor-not-allowed"
                    : "hover:opacity-90",
                )}
              >
                <Unlock size={12} />
                {postApprovalMutation.isPending
                  ? "Posting…"
                  : "Approve decrypt"}
              </button>
            )}
          {youAlreadyApproved && !isMofNUnlocked && (
            <span className="text-xs text-emerald-700 inline-flex items-center gap-1">
              ✓ you approved
            </span>
          )}
        </div>
      )}
      {postApprovalMutation.error instanceof Error && (
        <p className="text-xs text-destructive -mt-1">
          {postApprovalMutation.error.message}
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
              placeholder="Search…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border rounded px-2 py-1 flex-1 min-w-[140px] sm:min-w-[220px]"
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
                focused={focusSubmissionId === s.submissionId}
                schema={schema}
                formId={formId}
                packageId={packageId}
                privacyTier={onChain.privacy_tier}
                thresholdN={onChain.threshold_n ?? 0}
                witnessIds={(approvalsQuery.data ?? []).map((a) => a.witnessId)}
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

      {/* G4 — Owner-facing wiring lives below the data, collapsed by
          default so judges see submissions + actions first. */}
      <details className="mt-md border-t border-border pt-md">
        <summary className="cursor-pointer text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground w-fit">
          Setup &amp; integrations
        </summary>
        <div className="mt-3 flex flex-col gap-2">
          <BrandedShareLink formId={formId} />
          <WebhookConfig formId={formId} />
        </div>
      </details>
    </div>
  );
};

function SubmissionRowView({
  row,
  focused = false,
  schema,
  formId,
  packageId,
  privacyTier,
  thresholdN,
  witnessIds,
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
  /** True when this row matches the `?focus=<submissionId>` deep-link. */
  focused?: boolean;
  schema: FormSchema | null;
  formId: string;
  packageId: string;
  privacyTier: number;
  /** form.threshold_n (= required-approvals k) for Threshold tier; 0 otherwise. */
  thresholdN: number;
  /** Witness object IDs collected for this form's threshold identity.
   *  Empty for non-Threshold or k=1 forms. */
  witnessIds: string[];
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

  // Deep-link focus: scroll into view + pulse a Sui-sea ring for 1.5s.
  const rowRef = useRef<HTMLLIElement | null>(null);
  const [pulseFocus, setPulseFocus] = useState(false);
  useEffect(() => {
    if (!focused || !rowRef.current) return;
    rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    setPulseFocus(true);
    const t = window.setTimeout(() => setPulseFocus(false), 1500);
    return () => window.clearTimeout(t);
  }, [focused]);

  const decrypt = async () => {
    setDecryptError(null);
    setDecrypting(true);
    try {
      if (demoMode) {
        const resp = await fetch(apiUrl("/api/demo/admin/decrypt"), {
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
      const useMofN = privacyTier === PrivacyTier.Threshold && thresholdN >= 2;
      let txBytes: Uint8Array;
      if (useMofN) {
        if (witnessIds.length < thresholdN) {
          throw new Error(
            `Need ${thresholdN} approvals; ${witnessIds.length} on chain so far.`,
          );
        }
        txBytes = await buildSealApproveThresholdMofNTxBytes({
          packageId,
          formId,
          identity,
          witnessIds: witnessIds.slice(0, thresholdN),
          senderAddress: accountAddress,
          suiClient: suiClient as unknown as Parameters<
            typeof buildSealApproveThresholdMofNTxBytes
          >[0]["suiClient"],
        });
      } else {
        txBytes = await buildSealApproveTxBytes({
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
      }

      // Fetch encrypted ciphertext bytes from Walrus aggregator (cached).
      const ciphertext = await readBytesViaAggregator(row.payloadBlobId, {
        network: clientConfig.WALRUS_NETWORK,
      });

      const threshold =
        privacyTier === PrivacyTier.Threshold ? thresholdN || 1 : 1;
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
    <li
      ref={rowRef}
      id={`sub-${row.submissionId}`}
      className="border rounded p-3 bg-card flex flex-col gap-1 text-sm"
      style={{
        transition: "box-shadow 600ms ease-out",
        boxShadow: pulseFocus ? "0 0 0 3px var(--echo-sui-sea)" : undefined,
      }}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        <code>{row.submissionId.slice(0, 10)}…</code>
        <span>·</span>
        <span>{row.submittedAt}</span>
        <span>·</span>
        <span>
          {row.anonymous ? "anonymous" : <SuiNSName address={row.submitter} />}
        </span>
        {row.payloadBlobId && (
          <>
            <span>·</span>
            <WalrusBlobLink blobId={row.payloadBlobId} />
          </>
        )}
        <span className="sm:ml-auto flex items-center gap-2 flex-wrap">
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
              {issuingCredit ? "Issuing…" : "+5 rep"}
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
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 flex-wrap">
            Encrypted payload on Walrus:{" "}
            <WalrusBlobLink blobId={row.payloadBlobId} />
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

/**
 * Tiny <details> expander on the FormAdmin header that helps the owner
 * generate a SuiNS-branded share URL. The share URL itself is generated
 * client-side; the SuiNS user_data update has to happen on the SuiNS
 * dashboard (we link to it).
 */
function BrandedShareLink({ formId }: { formId: string }) {
  const [name, setName] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const slug = name
    .replace(/\.sui$/i, "")
    .trim()
    .toLowerCase();
  const fullName = slug ? `${slug}.sui` : "";
  const url =
    typeof window !== "undefined" && slug
      ? `${window.location.origin}/s/${fullName}`
      : "";

  const copy = (text: string) => {
    if (!navigator.clipboard) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground underline w-fit">
        🔗 Branded share link (SuiNS)
      </summary>
      <div className="mt-2 border rounded p-3 bg-card flex flex-col gap-2">
        <p className="text-muted-foreground">
          Set a SuiNS NameRecord user_data key <code>app:echo:form_id</code> =
          this form id, then share <code>/s/&lt;name&gt;.sui</code> instead of
          the long object id. Visiting the branded URL 302-redirects to this
          form.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="alice  (or alice.sui)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded px-2 py-1 font-mono"
          />
          {url && (
            <>
              <code className="text-muted-foreground">{url}</code>
              <button
                type="button"
                onClick={() => copy(url)}
                className="border rounded px-2 py-0.5 hover:bg-accent"
              >
                {copied === url ? "✓ copied" : "copy URL"}
              </button>
            </>
          )}
        </div>
        <div className="flex flex-col gap-1 text-muted-foreground">
          <p className="font-medium text-foreground">One-time setup steps:</p>
          <ol className="list-decimal pl-5 space-y-0.5">
            <li>
              Open{" "}
              <a
                href="https://testnet.suins.io"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                testnet.suins.io
              </a>{" "}
              and register / select <code>{fullName || "<name>.sui"}</code>.
            </li>
            <li>
              In the name&apos;s <strong>Custom user data</strong> section, add
              key <code>app:echo:form_id</code> with value:
              <button
                type="button"
                onClick={() => copy(formId)}
                className="ml-1 border rounded px-1 py-0.5 hover:bg-accent text-[10px]"
                title="Copy form id"
              >
                {copied === formId ? "✓ copied" : "copy form id"}
              </button>
              <br />
              <code className="text-[10px] break-all">{formId}</code>
            </li>
            <li>
              Save. Share the <code>/s/...</code> URL above.
            </li>
          </ol>
        </div>
      </div>
    </details>
  );
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

/**
 * Per-form webhook URL editor + Test button. Persists to localStorage
 * (admin-side only). New submissions trigger a POST from whichever
 * admin tab is open with this URL configured — see CrossFormDashboard
 * for the dispatch site. v0 limitation: webhook only fires while at
 * least one admin tab watches the dashboard. Production v1 should
 * store the URL on-chain on Form and tail submission events server-side.
 */
function WebhookConfig({ formId }: { formId: string }) {
  const [url, setUrl] = useState("");
  const [testStatus, setTestStatus] = useState<
    | { kind: "idle" }
    | { kind: "testing" }
    | { kind: "ok"; status: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const saved = getWebhookUrl(formId);
    if (saved) setUrl(saved);
  }, [formId]);

  // Persist on change (debounced via plain useEffect — webhook URL
  // changes are rare, so don't bother with a delay).
  useEffect(() => {
    setWebhookUrl(formId, url);
  }, [formId, url]);

  const test = async () => {
    if (!url.trim()) return;
    setTestStatus({ kind: "testing" });
    const payload: WebhookPayload = {
      event: "submission.test",
      form_id: formId,
      submission_id: "0x" + "0".repeat(64),
      payload_blob_id: "test-blob-id",
      submitter: null,
      anonymous: true,
      ts: Date.now(),
    };
    const res = await dispatchWebhook(url.trim(), payload);
    if (res.ok) {
      setTestStatus({ kind: "ok", status: res.status ?? 200 });
    } else {
      setTestStatus({
        kind: "error",
        message: res.error ?? `HTTP ${res.status}`,
      });
    }
  };

  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-muted-foreground underline w-fit">
        🪝 Webhook on submit
      </summary>
      <div className="mt-2 border rounded p-3 bg-card flex flex-col gap-2">
        <p className="text-muted-foreground">
          POSTs a JSON payload to this URL on every new submission. Pipes
          straight into Slack, Discord, Linear, Zapier, or your own backend.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="url"
            placeholder="https://hooks.slack.com/services/…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setTestStatus({ kind: "idle" });
            }}
            className="border rounded px-2 py-1 font-mono flex-1 min-w-[280px]"
          />
          <button
            type="button"
            disabled={!url.trim() || testStatus.kind === "testing"}
            onClick={() => void test()}
            className={cn(
              "border rounded px-3 py-1",
              !url.trim() || testStatus.kind === "testing"
                ? "opacity-60 cursor-not-allowed"
                : "hover:bg-accent",
            )}
          >
            {testStatus.kind === "testing" ? "Testing…" : "Test"}
          </button>
        </div>
        {testStatus.kind === "ok" && (
          <p className="text-emerald-700 dark:text-emerald-400">
            ✓ Webhook responded HTTP {testStatus.status}.
          </p>
        )}
        {testStatus.kind === "error" && (
          <p className="text-destructive">✗ {testStatus.message}</p>
        )}
        <details className="text-muted-foreground">
          <summary className="cursor-pointer underline w-fit">
            Payload shape
          </summary>
          <pre className="mt-1 bg-muted/40 border rounded p-2 overflow-x-auto text-[10px]">{`{
  "event": "submission.created",
  "form_id": "0x...",
  "submission_id": "0x...",
  "payload_blob_id": "<walrus blob id>",
  "submitter": "0x..." | null,
  "anonymous": false,
  "ts": 1778500000000
}`}</pre>
        </details>
      </div>
    </details>
  );
}
