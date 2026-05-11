"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import { FormFieldInput } from "./FormFieldInput";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  PrivacyTier,
  buildSubmitAnonymousTx,
  buildSubmitTx,
  checkGating,
  deriveCommitment,
  encryptForTier,
  executeSponsored,
  executeSponsoredWithKeypair,
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
    // Outer page surface — neutral background with vertical breathing room.
    // Form lives inside a centered card, Typeform/Google-Forms style.
    <div className="-mx-2xs -my-2xs min-h-[calc(100dvh-0px)] bg-muted/30 px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-[680px]">
        {/* Card surface — soft shadow, generous padding, accent stripe on top
            so the brand is felt without dragging the app chrome back in. */}
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-foreground to-emerald-500" />
          <div className="flex flex-col gap-8 p-6 sm:p-10">
            <header className="flex flex-col gap-3">
              <h1 className="text-3xl font-semibold tracking-tight leading-tight">
                {metadata.title}
              </h1>
              {metadata.description && (
                <p className="text-base text-muted-foreground leading-relaxed">
                  {metadata.description}
                </p>
              )}
              {/* Tier badge for non-Public — explicit trust signal so the
                  respondent knows what model they're submitting under. */}
              {onChain.privacy_tier !== 0 && (
                <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 w-fit font-medium">
                  🔒 {TIER_LABELS[onChain.privacy_tier] ?? "encrypted"} · Seal
                </span>
              )}
            </header>

            {!isOpen ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4 text-sm text-amber-800 dark:text-amber-200">
                This form isn&apos;t accepting submissions right now (
                {STATUS_LABELS[onChain.status] ?? "unknown"}).
              </div>
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
        </div>
        {/* Subtle attribution — respondents know what platform they're on
            without the full app chrome competing for attention. */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Powered by{" "}
          <Link href="/" className="font-medium underline hover:text-foreground">
            Echo
          </Link>{" "}
          · forms on Sui · Walrus · Seal
        </p>
      </div>
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

  // Walletless mode: when the respondent hasn't connected a wallet, we
  // generate a one-shot Ed25519 keypair locally, use it to sign the
  // sponsored tx, and discard it. The keypair never persists; its Sui
  // address is what shows up on chain as the submitter (or, for
  // anonymous submissions, the input to the nullifier hash). Only valid
  // for Public tier (Seal-tier submissions still encrypt to the form's
  // identity which doesn't depend on the submitter wallet, so there's
  // no fundamental block — but we keep the walletless path Public-only
  // for now to avoid surprising users about Seal trust assumptions).
  const submit = async (mode: "wallet" | "walletless" = "wallet") => {
    setStatus({ kind: "idle" });
    if (mode === "wallet" && !accountAddress) {
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

      // Spin up an ephemeral keypair for walletless mode. The submitter
      // address shown on chain is whatever this keypair derives to.
      const ephemeralKeypair =
        mode === "walletless" ? new Ed25519Keypair() : null;
      const ephemeralAddress = ephemeralKeypair
        ? ephemeralKeypair.getPublicKey().toSuiAddress()
        : null;

      let commitment: Uint8Array | null = null;
      if (anonymous) {
        setStatus({
          kind: "submitting",
          step: "Deriving anonymous nullifier…",
        });
        if (mode === "walletless" && ephemeralKeypair) {
          // Walletless anonymous: nullifier source is the ephemeral
          // key's signature over the canonical message. Each fresh
          // submission gets a different commitment — chain-level
          // dedupe doesn't apply, but for a Public tier walletless
          // form that's the expected demo behavior.
          const { canonicalMessage } = await import("@/lib/echo/nullifier");
          const msg = canonicalMessage(formId, ephemeralAddress!);
          const { signature } = await ephemeralKeypair.signPersonalMessage(
            new TextEncoder().encode(msg),
          );
          // SHA-256 of the base64 signature string — matches the shape
          // deriveCommitment uses for wallet-mode (it hashes the decoded
          // bytes; close enough for the demo since walletless commitments
          // can't be deduped across sessions anyway).
          const sigBytes = new TextEncoder().encode(signature);
          const hash = await crypto.subtle.digest("SHA-256", sigBytes);
          commitment = new Uint8Array(hash);
        } else {
          commitment = await deriveCommitment({
            formId,
            walletAddress: accountAddress!,
            signer: dAppKit as unknown as Parameters<
              typeof deriveCommitment
            >[0]["signer"],
          });
        }
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
          })
        : buildSubmitTx({
            packageId,
            formId,
            payloadBlobId: blobId,
          });

      const { digest } =
        mode === "walletless" && ephemeralKeypair
          ? await executeSponsoredWithKeypair({
              tx,
              keypair: ephemeralKeypair,
              suiClient,
            })
          : await executeSponsored({
              tx,
              sender: accountAddress!,
              suiClient,
              dAppKit,
            });
      void ephemeralAddress; // intentionally not surfaced to the UI
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

  // Celebratory full-card success state — replaces the form entirely.
  if (status.kind === "submitted") {
    return <SubmittedState digest={status.digest} onSubmitAnother={() => {
      setAnswers({});
      setAnonymous(false);
      setPageIdx(0);
      setStatus({ kind: "idle" });
    }} />;
  }

  return (
    <div className="flex flex-col gap-8">
      {totalPages > 1 && <PageProgress current={pageIdx} total={totalPages} />}

      <div className="flex flex-col gap-7">
        {visibleFields.map((field) => (
          <FormFieldInput
            key={field.id}
            field={field}
            value={answers[field.id]}
            onChange={(v) => setAnswer(field.id, v)}
          />
        ))}
      </div>

      {isLastPage && (
        <div className="rounded-xl border bg-muted/40 p-4 flex flex-col gap-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <span className="relative inline-flex shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
                className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-border bg-background transition-colors checked:bg-foreground checked:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/10 focus-visible:ring-offset-2"
              />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-background opacity-0 peer-checked:opacity-100">
                ✓
              </span>
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-sm font-medium">Submit anonymously</span>
              <span className="text-xs text-muted-foreground leading-relaxed">
                Your wallet signs a one-time nullifier; only the 32-byte hash
                hits the chain — never your address. Each wallet can submit
                anonymously <strong>once</strong> per form.
              </span>
            </span>
          </label>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        {pageIdx > 0 && (
          <button
            type="button"
            onClick={() => setPageIdx((i) => i - 1)}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-accent transition-colors"
          >
            ← Previous
          </button>
        )}
        {!isLastPage ? (
          <button
            type="button"
            onClick={() => setPageIdx((i) => i + 1)}
            className="ml-auto rounded-lg bg-foreground text-background px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity shadow-sm"
          >
            Next →
          </button>
        ) : (
          <div className="ml-auto flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              {/* Walletless path is only offered for Public tier today —
                  encrypted tiers still ask for a wallet so the Seal trust
                  model isn't surprising. */}
              {!accountAddress &&
                privacyTier === PrivacyTier.Public &&
                status.kind !== "submitting" && (
                  <button
                    type="button"
                    onClick={() => void submit("walletless")}
                    className="rounded-lg border px-4 py-2.5 text-sm hover:bg-accent transition-colors"
                    title="Echo generates a one-time keypair locally, signs the sponsored tx, and discards it. No wallet needed."
                  >
                    Submit without wallet
                  </button>
                )}
              <button
                type="button"
                onClick={() => void submit("wallet")}
                disabled={!accountAddress || status.kind === "submitting"}
                className={cn(
                  "rounded-lg px-6 py-2.5 text-sm font-medium transition-all shadow-sm",
                  accountAddress && status.kind !== "submitting"
                    ? "bg-foreground text-background hover:opacity-90"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
                )}
              >
                {status.kind === "submitting"
                  ? "Submitting…"
                  : accountAddress
                    ? "Submit"
                    : "Connect wallet to submit"}
              </button>
            </div>
            {!accountAddress && privacyTier === PrivacyTier.Public && (
              <p className="text-xs text-muted-foreground">
                Gas is sponsored by Enoki — you don&apos;t need any SUI.
              </p>
            )}
          </div>
        )}
      </div>

      {status.kind === "submitting" && (
        <SubmitStepper
          isPublic={privacyTier === PrivacyTier.Public}
          step={status.step}
          done={false}
        />
      )}
      {status.kind === "error" && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {status.message}
        </div>
      )}
    </div>
  );
}

/**
 * Page progress indicator at top of multi-page forms. Pill chip with
 * current/total counter + a thin filled-bar showing completion.
 */
function PageProgress({ current, total }: { current: number; total: number }) {
  const pct = ((current + 1) / total) * 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium uppercase tracking-wider text-muted-foreground">
          Step {current + 1} of {total}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {Math.round(pct)}%
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Friendly post-submit screen — replaces the form entirely. Big checkmark
 * + thanks copy + tx digest + two CTAs (submit another / view source).
 */
function SubmittedState({
  digest,
  onSubmitAnother,
}: {
  digest: string;
  onSubmitAnother: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          Thanks for submitting!
        </h2>
        <p className="text-sm text-muted-foreground max-w-[420px]">
          Your response is on chain. The form admin can decrypt it (or read
          plaintext for Public forms) at their convenience.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>tx</span>
        <code className="rounded bg-muted px-2 py-0.5 font-mono">
          {digest.slice(0, 10)}…{digest.slice(-6)}
        </code>
        <a
          href={`https://suiscan.xyz/testnet/tx/${digest}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          view on Suiscan ↗
        </a>
      </div>
      <button
        type="button"
        onClick={onSubmitAnother}
        className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
      >
        Submit another response
      </button>
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
