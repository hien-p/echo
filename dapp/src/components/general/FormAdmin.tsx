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

  return (
    <div className="flex flex-col gap-md">
      <header className="flex flex-col gap-1">
        <Link href="/forms" className="text-xs underline text-muted-foreground">
          ← All forms
        </Link>
        <h1 className="text-2xl font-semibold">{metadata.title}</h1>
        <p className="text-xs text-muted-foreground">
          {STATUS_LABELS[onChain.status] ?? "?"} · {onChain.submission_count}{" "}
          submissions ·{" "}
          <Link href={`/forms/${formId}`} className="underline">
            public link
          </Link>
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
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Submissions ({submissions.length})
          </h2>
          {isOwner &&
            !demoMode &&
            onChain.privacy_tier !== 0 &&
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
        {submissionsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading submissions…</p>
        ) : submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {submissions.map((s) => (
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
}) {
  const [decrypted, setDecrypted] = useState<SubmissionPayload | null>(null);
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

  return (
    <li className="border rounded p-3 bg-card flex flex-col gap-1 text-sm">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <code>{row.submissionId.slice(0, 10)}…</code>
        <span>·</span>
        <span>{row.submittedAt}</span>
        <span>·</span>
        <span>
          {row.anonymous ? "anonymous" : `${row.submitter.slice(0, 10)}…`}
        </span>
        {row.encrypted && !decrypted && (
          <span className="ml-auto inline-flex items-center gap-1 text-amber-700">
            <Lock size={12} /> encrypted
          </span>
        )}
        {decrypted && (
          <span className="ml-auto inline-flex items-center gap-1 text-emerald-700">
            <UnlockIcon size={12} /> decrypted
          </span>
        )}
      </div>

      {row.encrypted && !decrypted ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            Payload Walrus blob: <code>{row.payloadBlobId}</code>
          </p>
          <button
            type="button"
            onClick={() => void decrypt()}
            disabled={decrypting}
            className="border rounded px-3 py-1 text-xs w-fit hover:bg-accent disabled:opacity-60"
          >
            {decrypting
              ? "Decrypting…"
              : demoMode
                ? "Decrypt (server, demo mode)"
                : "Decrypt with Seal"}
          </button>
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
    <ul className="flex flex-col gap-1 text-sm">
      {Object.entries(payload.answers).map(([fieldId, ans]) => {
        const field = fields.find((f) => f.id === fieldId);
        return (
          <li key={fieldId}>
            <strong className="text-muted-foreground text-xs">
              {field?.label ?? fieldId}:
            </strong>{" "}
            <span>{stringifyAnswer(ans)}</span>
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
