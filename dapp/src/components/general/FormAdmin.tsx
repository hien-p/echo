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
} from "lucide-react";
import { clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import {
  PrivacyTier,
  buildArchiveFormTx,
  buildCloseFormTx,
  buildSealApproveTxBytes,
  getSealClient,
  getWalrusClient,
  readBytesBlob,
  readJsonBlob,
  SessionKey,
  tierIdentity,
  type FormMetadata,
  type FormSchema,
  type SubmissionPayload,
} from "@/lib/echo";
import { BountyPanel } from "./BountyPanel";

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

  const formQuery = useQuery({
    queryKey: ["echo", "form-admin", formId],
    queryFn: async () => {
      const resp = await suiClient.getObject({
        objectId: formId,
        include: { json: true },
      });
      const onChain = resp.object.json as OnChainForm | null;
      if (!onChain) throw new Error("Form not found.");
      const walrus = getWalrusClient(suiClient, clientConfig.WALRUS_NETWORK);
      const [schema, metadata] = await Promise.all([
        readJsonBlob<FormSchema>(walrus, onChain.schema_blob_id).catch(
          () => null,
        ),
        readJsonBlob<FormMetadata>(walrus, onChain.metadata_blob_id).catch(
          () => ({ title: "(metadata unavailable)" }),
        ),
      ]);
      return { onChain, schema, metadata };
    },
    enabled: formId.startsWith("0x"),
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
  });

  const submissionsQuery = useQuery({
    queryKey: [
      "echo",
      "submissions",
      formId,
      formQuery.data?.onChain.privacy_tier,
    ],
    queryFn: async (): Promise<SubmissionRow[]> => {
      const eventType = `${packageId}::submission::SubmissionMade`;
      const events = await jsonRpcQueryEvents(
        clientConfig.SUI_FULLNODE_URL,
        eventType,
      );
      const rows = events.filter((e) => e.form_id === formId);
      const walrus = getWalrusClient(suiClient, clientConfig.WALRUS_NETWORK);

      const isPublic = formQuery.data?.onChain.privacy_tier === 0;

      return Promise.all(
        rows.map(async (e): Promise<SubmissionRow> => {
          const subResp = await suiClient.getObject({
            objectId: e.submission_id,
            include: { json: true },
          });
          const sub = subResp.object.json as OnChainSubmissionRef | null;
          const submittedAt = sub
            ? new Date(Number(sub.submitted_ms)).toISOString()
            : "(unknown)";
          const payloadBlobId = sub?.payload_blob_id ?? "";
          let payload: SubmissionPayload | null = null;
          let payloadError: string | undefined;
          if (isPublic && payloadBlobId) {
            try {
              payload = await readJsonBlob<SubmissionPayload>(
                walrus,
                payloadBlobId,
              );
            } catch (err) {
              payloadError = err instanceof Error ? err.message : String(err);
            }
          }
          return {
            submissionId: e.submission_id,
            submitter: e.submitter,
            anonymous: e.anonymous,
            submittedAt,
            payloadBlobId,
            payload,
            payloadError,
            encrypted: !isPublic,
          };
        }),
      );
    },
    enabled: !!formQuery.data && packageId.startsWith("0x"),
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

  if (!account) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect a wallet to view admin tools.
      </p>
    );
  }
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

      {!isOwner && (
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
        <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground mb-2">
          Submissions ({submissions.length})
        </h2>
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
                accountAddress={account.address}
              />
            ))}
          </ul>
        )}
      </section>

      <BountyPanel
        formId={formId}
        formOwnerCapId={ownerCapQuery.data ?? null}
        isOwner={isOwner}
        callerAddress={account.address}
      />

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
}) {
  const [decrypted, setDecrypted] = useState<SubmissionPayload | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);

  const decrypt = async () => {
    setDecryptError(null);
    setDecrypting(true);
    try {
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

      // Fetch encrypted ciphertext bytes from Walrus.
      const walrus = getWalrusClient(suiClient, clientConfig.WALRUS_NETWORK);
      const ciphertext = await readBytesBlob(walrus, row.payloadBlobId);

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
            {decrypting ? "Decrypting…" : "Decrypt with Seal"}
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
