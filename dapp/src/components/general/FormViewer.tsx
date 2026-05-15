"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import { FormFieldInput } from "./FormFieldInput";
import {
  PrivacyTier,
  buildSubmitAnonymousTx,
  buildSubmitTx,
  checkGating,
  deriveCommitment,
  encryptForTier,
  executeSponsored,
  getSealClient,
  readJsonViaAggregator,
  tierIdentity,
  uploadBytesViaPublisher,
  uploadJsonViaPublisher,
  type FormField,
  type FormMetadata,
  type FormSchema,
  type SubmissionAnswer,
  type SubmissionPayload,
} from "@/lib/echo";

interface OnChainForm {
  schema_blob_id: string;
  schema_version: string;
  metadata_blob_id: string;
  owner: string;
  privacy_tier: number;
  threshold_n: number;
  threshold_m: number;
  unlock_ms: string;
  conditional_policy_id: string;
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
  2: "Threshold reveal",
  3: "Time-locked",
  4: "Conditional",
};

export const FormViewer = ({ formId }: { formId: string }) => {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;

  const formQuery = useQuery({
    queryKey: ["echo", "form", formId],
    queryFn: async () => {
      const resp = await suiClient.getObject({
        objectId: formId,
        include: { json: true },
      });
      const onChain = resp.object.json as OnChainForm | null;
      if (!onChain) throw new Error("Form has no JSON content; bad object id?");
      const network = clientConfig.WALRUS_NETWORK;
      const [schema, metadata] = await Promise.all([
        readJsonViaAggregator<FormSchema>(onChain.schema_blob_id, { network }),
        readJsonViaAggregator<FormMetadata>(onChain.metadata_blob_id, {
          network,
        }),
      ]);
      return { onChain, schema, metadata };
    },
    enabled: formId.startsWith("0x"),
    retry: 1,
  });

  if (formQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading form…</p>;
  }
  if (formQuery.error) {
    return (
      <p className="text-sm text-destructive">
        Failed to load: {(formQuery.error as Error).message}
      </p>
    );
  }
  if (!formQuery.data) return null;

  const { onChain, schema, metadata } = formQuery.data;
  const isOpen = onChain.status === 1;

  return (
    <div className="flex flex-col gap-md">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{metadata.title}</h1>
        {metadata.description && (
          <p className="text-sm text-muted-foreground">
            {metadata.description}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {TIER_LABELS[onChain.privacy_tier] ?? "?"} ·{" "}
          {STATUS_LABELS[onChain.status] ?? "?"}
          {" · "}
          {onChain.submission_count} submission(s)
        </p>
      </header>

      {!isOpen ? (
        <p className="text-sm text-amber-700">
          This form is not accepting submissions (
          {STATUS_LABELS[onChain.status] ?? "unknown"}).
        </p>
      ) : (
        <GatedSubmit
          formId={formId}
          packageId={packageId}
          schema={schema}
          schemaVersion={Number(onChain.schema_version)}
          privacyTier={onChain.privacy_tier}
          unlockMs={onChain.unlock_ms}
          conditionalPolicyId={onChain.conditional_policy_id}
          thresholdN={onChain.threshold_n}
          dAppKit={dAppKit}
          suiClient={suiClient}
          accountAddress={account?.address}
        />
      )}
    </div>
  );
};

interface GatedSubmitProps {
  formId: string;
  packageId: string;
  schema: FormSchema;
  schemaVersion: number;
  privacyTier: number;
  unlockMs: string;
  conditionalPolicyId: string;
  thresholdN: number;
  dAppKit: ReturnType<typeof useDAppKit>;
  suiClient: ReturnType<ReturnType<typeof useDAppKit>["getClient"]>;
  accountAddress?: string;
}

function GatedSubmit(props: GatedSubmitProps) {
  const { schema, accountAddress, suiClient } = props;
  const gating = schema.gating;

  const gateQuery = useQuery({
    queryKey: ["echo", "gate", props.formId, accountAddress],
    queryFn: () =>
      checkGating(
        schema,
        accountAddress,
        suiClient as unknown as Parameters<typeof checkGating>[2],
      ),
    enabled: !!accountAddress && !!gating,
    staleTime: 30_000,
  });

  if (gating && accountAddress && gateQuery.data && !gateQuery.data.ok) {
    return (
      <div className="border rounded p-3 bg-amber-50 dark:bg-amber-950/30 flex flex-col gap-2">
        <p className="text-sm text-amber-800 dark:text-amber-300">
          🔒 {gateQuery.data.reason}
        </p>
        <button
          type="button"
          onClick={() => gateQuery.refetch()}
          disabled={gateQuery.isFetching}
          className={cn(
            "border rounded px-3 py-1 text-xs w-fit",
            gateQuery.isFetching ? "opacity-60" : "hover:bg-accent",
          )}
        >
          {gateQuery.isFetching ? "Checking…" : "Verify again"}
        </button>
      </div>
    );
  }

  return <SubmitForm {...props} />;
}

function SubmitForm({
  formId,
  packageId,
  schema,
  schemaVersion,
  privacyTier,
  unlockMs,
  conditionalPolicyId,
  thresholdN,
  dAppKit,
  suiClient,
  accountAddress,
}: GatedSubmitProps) {
  const [answers, setAnswers] = useState<Record<string, SubmissionAnswer>>({});
  const [anonymous, setAnonymous] = useState(false);
  const [pageIdx, setPageIdx] = useState(0);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "submitting"; step: string }
    | { kind: "submitted"; digest: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const pageNumbers = Array.from(
    new Set(schema.fields.map((f) => f.page ?? 0)),
  ).sort((a, b) => a - b);
  const currentPage = pageNumbers[pageIdx] ?? 0;
  const totalPages = pageNumbers.length;
  const isLastPage = pageIdx === totalPages - 1;

  const setAnswer = (id: string, value: SubmissionAnswer) =>
    setAnswers((curr) => ({ ...curr, [id]: value }));

  const validate = (): string | null => {
    for (const f of schema.fields) {
      if (!f.required) continue;
      const a = answers[f.id];
      if (!a) return `Field "${f.label}" is required.`;
      if (a.kind === "text" && !a.value.trim())
        return `Field "${f.label}" cannot be empty.`;
      if (
        a.kind === "choice" &&
        (!a.value || (Array.isArray(a.value) && a.value.length === 0))
      )
        return `Field "${f.label}" requires a selection.`;
      if (a.kind === "rating" && !a.value)
        return `Field "${f.label}" requires a rating.`;
    }
    return null;
  };

  const submit = async () => {
    setStatus({ kind: "idle" });
    if (!accountAddress) {
      setStatus({ kind: "error", message: "Connect a wallet first." });
      return;
    }
    const err = validate();
    if (err) {
      setStatus({ kind: "error", message: err });
      return;
    }
    try {
      const payload: SubmissionPayload = {
        schemaVersion,
        answers,
        submittedAt: new Date().toISOString(),
      };

      const isPublic = privacyTier === PrivacyTier.Public;
      const sealServers = parseSealServers(clientConfig.SEAL_KEY_SERVERS);
      const sealAvailable = !isPublic && sealServers.length > 0;

      let blobId: string;
      if (sealAvailable) {
        setStatus({ kind: "submitting", step: "Encrypting payload (Seal)…" });
        const seal = getSealClient({
          suiClient: suiClient as unknown as Parameters<
            typeof getSealClient
          >[0]["suiClient"],
          serverConfigs: sealServers,
          verifyKeyServers: false,
        });
        const id = tierIdentity({
          formId,
          tier: privacyTier as PrivacyTier,
          conditionalPolicyId: conditionalPolicyId || undefined,
          unlockMs: unlockMs ? BigInt(unlockMs) : undefined,
        });
        const threshold =
          privacyTier === PrivacyTier.Threshold ? thresholdN : 1;
        const data = new TextEncoder().encode(JSON.stringify(payload));
        const { ciphertext } = await encryptForTier({
          client: seal,
          packageId,
          identity: id,
          threshold,
          data,
        });
        setStatus({
          kind: "submitting",
          step: "Uploading ciphertext to Walrus (publisher)…",
        });
        const out = await uploadBytesViaPublisher(ciphertext);
        blobId = out.blobId;
      } else {
        if (!isPublic) {
          console.warn(
            "Echo: privacy tier !== Public but NEXT_PUBLIC_SEAL_KEY_SERVERS not set; uploading plaintext.",
          );
        }
        setStatus({
          kind: "submitting",
          step: "Uploading payload to Walrus (publisher)…",
        });
        const out = await uploadJsonViaPublisher(payload);
        blobId = out.blobId;
      }

      let commitment: Uint8Array | null = null;
      if (anonymous) {
        setStatus({
          kind: "submitting",
          step: "Deriving anonymous nullifier…",
        });
        commitment = await deriveCommitment({
          formId,
          walletAddress: accountAddress,
          signer: dAppKit as unknown as Parameters<
            typeof deriveCommitment
          >[0]["signer"],
        });
      }

      setStatus({
        kind: "submitting",
        step: "Submitting on chain (gas sponsored)…",
      });
      const tx = anonymous
        ? buildSubmitAnonymousTx({
            packageId,
            formId,
            payloadBlobId: blobId,
            commitment: commitment!,
            tierHint: privacyTier,
          })
        : buildSubmitTx({
            packageId,
            formId,
            payloadBlobId: blobId,
            tierHint: privacyTier,
          });

      const { digest } = await executeSponsored({
        tx,
        sender: accountAddress,
        suiClient,
        dAppKit,
      });
      setStatus({ kind: "submitted", digest });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      // Move's ECommitmentAlreadyUsed = 7 in echo::form. Surface a friendly
      // message instead of the raw "MoveAbort … 7" string.
      const friendly =
        /commitments_used|abort.*\b7\b|ECommitmentAlreadyUsed/i.test(raw)
          ? "You've already submitted to this form anonymously from this wallet. Each wallet can submit anonymously once per form."
          : raw;
      setStatus({ kind: "error", message: friendly });
    }
  };

  const visibleFields = schema.fields
    .filter((f) => (f.page ?? 0) === currentPage)
    .filter((f) => isFieldVisible(f, answers));

  return (
    <div className="flex flex-col gap-md">
      {totalPages > 1 && (
        <p className="text-xs text-muted-foreground">
          Page {pageIdx + 1} of {totalPages}
        </p>
      )}
      {visibleFields.map((field) => (
        <FormFieldInput
          key={field.id}
          field={field}
          value={answers[field.id]}
          onChange={(v) => setAnswer(field.id, v)}
        />
      ))}

      {isLastPage && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
            />
            Submit anonymously
          </span>
          {anonymous && (
            <span className="text-xs text-muted-foreground pl-6">
              Your wallet signs a one-time nullifier; only the 32-byte hash hits
              the chain — never your address. Each wallet can submit anonymously{" "}
              <strong>once</strong> per form (a second attempt from the same
              wallet is rejected on chain).
            </span>
          )}
        </label>
      )}

      <div className="flex gap-2">
        {pageIdx > 0 && (
          <button
            type="button"
            onClick={() => setPageIdx((i) => i - 1)}
            className="border rounded px-3 py-1 text-sm hover:bg-accent"
          >
            ← Previous
          </button>
        )}
        {!isLastPage ? (
          <button
            type="button"
            onClick={() => setPageIdx((i) => i + 1)}
            className="border rounded px-3 py-1 text-sm hover:bg-accent ml-auto"
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!accountAddress || status.kind === "submitting"}
            className={cn(
              "border rounded px-4 py-2 font-medium ml-auto",
              accountAddress && status.kind !== "submitting"
                ? "bg-foreground text-background hover:opacity-90"
                : "opacity-60 cursor-not-allowed",
            )}
          >
            {status.kind === "submitting"
              ? status.step
              : accountAddress
                ? "Submit"
                : "Connect wallet to submit"}
          </button>
        )}
      </div>

      {(status.kind === "submitting" || status.kind === "submitted") && (
        <SubmitStepper
          isPublic={privacyTier === PrivacyTier.Public}
          step={status.kind === "submitting" ? status.step : "done"}
          done={status.kind === "submitted"}
        />
      )}
      {status.kind === "error" && (
        <p className="text-sm text-destructive">{status.message}</p>
      )}
      {status.kind === "submitted" && (
        <p className="text-sm text-emerald-700">
          ✓ Submitted. Tx digest: <code>{status.digest.slice(0, 12)}…</code>
        </p>
      )}
    </div>
  );
}

/**
 * Visible Seal → Walrus → Sui sequence rendered during submit. Mirrors
 * sui-stack-crm's "Commit & Encrypt" pattern — making the stack tangible
 * instead of hiding everything behind a single spinner. Public-tier
 * submissions skip the encrypt stage (greyed out).
 */
function SubmitStepper({
  isPublic,
  step,
  done,
}: {
  isPublic: boolean;
  step: string;
  done: boolean;
}) {
  // Classify the current step string into a stage so the stepper updates
  // without re-piping discrete enum values from the submit fn.
  const stage: "encrypt" | "upload" | "record" | "done" = done
    ? "done"
    : /encrypt/i.test(step)
      ? "encrypt"
      : /walrus|publisher/i.test(step)
        ? "upload"
        : /sui|chain|sponsor/i.test(step)
          ? "record"
          : "encrypt";

  const stages: Array<{
    id: "encrypt" | "upload" | "record";
    label: string;
    sub: string;
    skip?: boolean;
  }> = [
    {
      id: "encrypt",
      label: "Seal",
      sub: "encrypt locally",
      skip: isPublic,
    },
    { id: "upload", label: "Walrus", sub: "store ciphertext" },
    { id: "record", label: "Sui", sub: "anchor on chain" },
  ];

  const order: Array<"encrypt" | "upload" | "record"> = [
    "encrypt",
    "upload",
    "record",
  ];
  const currentIdx = stage === "done" ? 3 : order.indexOf(stage);

  return (
    <ol className="flex items-stretch gap-0 text-xs border rounded overflow-hidden">
      {stages.map((s, i) => {
        const skipped = !!s.skip;
        const isCurrent = !skipped && i === currentIdx;
        const isComplete = !skipped && i < currentIdx;
        return (
          <li
            key={s.id}
            className={cn(
              "flex-1 px-3 py-2 flex items-center gap-2 border-r last:border-r-0 transition",
              skipped && "opacity-40",
              isCurrent && "bg-amber-50 dark:bg-amber-950/30",
              isComplete && "bg-emerald-50 dark:bg-emerald-950/30",
            )}
          >
            <span
              className={cn(
                "inline-flex items-center justify-center w-5 h-5 rounded-full border text-[10px] font-medium tabular-nums",
                skipped && "border-border text-muted-foreground",
                isCurrent &&
                  "border-amber-400 bg-amber-100 text-amber-900 animate-pulse",
                isComplete &&
                  "border-emerald-400 bg-emerald-100 text-emerald-900",
                !skipped &&
                  !isCurrent &&
                  !isComplete &&
                  "border-border text-muted-foreground",
              )}
            >
              {skipped ? "—" : isComplete ? "✓" : i + 1}
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-semibold uppercase tracking-wide text-[10px]">
                {s.label}
              </span>
              <span className="text-muted-foreground text-[10px]">
                {skipped ? "skipped" : s.sub}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
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

function isFieldVisible(
  field: FormField,
  answers: Record<string, SubmissionAnswer>,
): boolean {
  const conds = field.showWhen ?? [];
  if (conds.length === 0) return true;
  return conds.every((cond) => {
    const a = answers[cond.fieldId];
    if (!a) return false;
    const value =
      a.kind === "checkbox"
        ? a.value
        : a.kind === "rating"
          ? a.value
          : a.kind === "text"
            ? a.value
            : a.kind === "choice"
              ? a.value
              : a.kind === "date"
                ? a.value
                : null;
    if (cond.equals !== undefined) {
      if (Array.isArray(value)) return value.includes(String(cond.equals));
      return value === cond.equals;
    }
    if (cond.oneOf) {
      const set = new Set<string | number>(cond.oneOf);
      if (Array.isArray(value)) return value.some((v) => set.has(v));
      return set.has(value as string | number);
    }
    return true;
  });
}
