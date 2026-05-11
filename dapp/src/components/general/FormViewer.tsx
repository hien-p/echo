"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { ChevronDown, ChevronUp, Check, Lock } from "lucide-react";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import { MarkdownEditor } from "./MarkdownEditor";
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
    return (
      <div className="flex min-h-[calc(100dvh-0px)] items-center justify-center bg-zinc-950 text-zinc-500">
        Loading form…
      </div>
    );
  }
  if (formQuery.error) {
    return (
      <div className="flex min-h-[calc(100dvh-0px)] items-center justify-center bg-zinc-950 px-6 text-center text-sm text-rose-400">
        Failed to load: {(formQuery.error as Error).message}
      </div>
    );
  }
  if (!formQuery.data) return null;

  const { onChain, schema, metadata } = formQuery.data;
  const isOpen = onChain.status === 1;

  return (
    <TakeoverShell>
      {!isOpen ? (
        <ClosedNotice
          title={metadata.title}
          status={STATUS_LABELS[onChain.status] ?? "unknown"}
        />
      ) : (
        <GatedTakeover
          formId={formId}
          packageId={packageId}
          schema={schema}
          metadata={metadata}
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
    </TakeoverShell>
  );
};

function TakeoverShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-2xs -my-2xs relative min-h-[calc(100dvh-0px)] bg-zinc-950 text-zinc-100 antialiased">
      {children}
    </div>
  );
}

function ClosedNotice({ title, status }: { title: string; status: string }) {
  return (
    <div className="flex min-h-[calc(100dvh-0px)] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-zinc-100">{title}</h1>
        <p className="mt-3 text-sm text-zinc-400">
          This form isn&apos;t accepting submissions right now ({status}).
        </p>
      </div>
    </div>
  );
}

interface GatedProps {
  formId: string;
  packageId: string;
  schema: FormSchema;
  metadata: FormMetadata;
  schemaVersion: number;
  privacyTier: number;
  unlockMs: string;
  conditionalPolicyId: string;
  thresholdN: number;
  dAppKit: ReturnType<typeof useDAppKit>;
  suiClient: ReturnType<ReturnType<typeof useDAppKit>["getClient"]>;
  accountAddress?: string;
}

function GatedTakeover(props: GatedProps) {
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
      <div className="flex min-h-[calc(100dvh-0px)] items-center justify-center px-6">
        <div className="max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <Lock size={28} className="mx-auto text-amber-400" />
          <p className="mt-4 text-sm text-amber-100">{gateQuery.data.reason}</p>
          <button
            type="button"
            onClick={() => gateQuery.refetch()}
            disabled={gateQuery.isFetching}
            className="mt-5 rounded-full bg-amber-400 px-5 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-60"
          >
            {gateQuery.isFetching ? "Checking…" : "Verify again"}
          </button>
        </div>
      </div>
    );
  }

  return <Takeover {...props} />;
}

type SubmitStatus =
  | { kind: "idle" }
  | { kind: "submitting"; step: string }
  | { kind: "submitted"; digest: string }
  | { kind: "error"; message: string };

function Takeover({
  formId,
  packageId,
  schema,
  metadata,
  schemaVersion,
  privacyTier,
  unlockMs,
  conditionalPolicyId,
  thresholdN,
  dAppKit,
  suiClient,
  accountAddress,
}: GatedProps) {
  const [answers, setAnswers] = useState<Record<string, SubmissionAnswer>>({});
  const [anonymous, setAnonymous] = useState(false);
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState<SubmitStatus>({ kind: "idle" });

  const visibleFields = useMemo(
    () => schema.fields.filter((f) => isFieldVisible(f, answers)),
    [schema.fields, answers],
  );

  // Steps = intro (0) + each visible question + review/submit. Intro is the
  // Typeform-style cover ("Press Enter to start") that anchors the brand
  // and tier badge before the first question. The total step count is
  // visibleFields.length + 2 (intro + review).
  const totalSteps = visibleFields.length + 2;
  const stepKind: "intro" | "question" | "review" =
    idx === 0 ? "intro" : idx <= visibleFields.length ? "question" : "review";
  const currentField =
    stepKind === "question" ? visibleFields[idx - 1] : undefined;

  const setAnswer = useCallback(
    (id: string, value: SubmissionAnswer) =>
      setAnswers((curr) => ({ ...curr, [id]: value })),
    [],
  );

  const isCurrentValid = useMemo(() => {
    if (stepKind !== "question" || !currentField) return true;
    const a = answers[currentField.id];
    if (!currentField.required) return true;
    if (!a) return false;
    if (a.kind === "text") return a.value.trim().length > 0;
    if (a.kind === "choice") {
      if (Array.isArray(a.value)) return a.value.length > 0;
      return Boolean(a.value);
    }
    if (a.kind === "rating") return Boolean(a.value);
    if (a.kind === "checkbox") return a.value === true;
    if (a.kind === "blob") return Boolean(a.blobId);
    if (a.kind === "date") return Boolean(a.value);
    return true;
  }, [stepKind, currentField, answers]);

  const goBack = useCallback(() => {
    setIdx((i) => Math.max(0, i - 1));
    setStatus({ kind: "idle" });
  }, []);

  const goNext = useCallback(() => {
    if (stepKind === "question" && !isCurrentValid) return;
    setIdx((i) => Math.min(totalSteps - 1, i + 1));
    setStatus({ kind: "idle" });
  }, [stepKind, isCurrentValid, totalSteps]);

  const validateAll = (): string | null => {
    for (const f of visibleFields) {
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

  const submit = async (mode: "wallet" | "walletless" = "wallet") => {
    setStatus({ kind: "idle" });
    if (mode === "wallet" && !accountAddress) {
      setStatus({ kind: "error", message: "Connect a wallet first." });
      return;
    }
    const err = validateAll();
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
          step: "Uploading ciphertext to Walrus…",
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
          step: "Uploading payload to Walrus…",
        });
        const out = await uploadJsonViaPublisher(payload);
        blobId = out.blobId;
      }

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
          const { canonicalMessage } = await import("@/lib/echo/nullifier");
          const msg = canonicalMessage(formId, ephemeralAddress!);
          const { signature } = await ephemeralKeypair.signPersonalMessage(
            new TextEncoder().encode(msg),
          );
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
      void ephemeralAddress;
      setStatus({ kind: "submitted", digest });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const friendly =
        /commitments_used|abort.*\b7\b|ECommitmentAlreadyUsed/i.test(raw)
          ? "You've already submitted to this form anonymously from this wallet. Each wallet can submit anonymously once per form."
          : raw;
      setStatus({ kind: "error", message: friendly });
    }
  };

  // Global keyboard nav. Handled at the document level so chevron
  // navigation works no matter which input is focused. Enter on the
  // current question advances; ArrowUp/ArrowDown jump backwards/forwards.
  useEffect(() => {
    const handler = (ev: globalThis.KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      const inEditable =
        target?.tagName === "TEXTAREA" ||
        (target?.tagName === "INPUT" &&
          (target as HTMLInputElement).type !== "checkbox") ||
        target?.isContentEditable;
      if (ev.key === "ArrowDown" && !inEditable) {
        ev.preventDefault();
        goNext();
      } else if (ev.key === "ArrowUp" && !inEditable) {
        ev.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goBack, goNext]);

  if (status.kind === "submitted") {
    return (
      <SubmittedTakeover
        digest={status.digest}
        onSubmitAnother={() => {
          setAnswers({});
          setAnonymous(false);
          setIdx(0);
          setStatus({ kind: "idle" });
        }}
      />
    );
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-0px)] flex-col">
      <ProgressBar
        current={idx}
        total={totalSteps - 1 /* intro doesn't count toward % */}
      />

      <div className="flex flex-1 items-center justify-center px-6 py-16 sm:px-12">
        <div className="w-full max-w-2xl">
          {stepKind === "intro" && (
            <IntroStep
              metadata={metadata}
              privacyTier={privacyTier}
              questionCount={visibleFields.length}
              onStart={goNext}
            />
          )}
          {stepKind === "question" && currentField && (
            <QuestionStep
              field={currentField}
              index={idx - 1}
              total={visibleFields.length}
              value={answers[currentField.id]}
              onChange={(v) => setAnswer(currentField.id, v)}
              onAdvance={goNext}
              isValid={isCurrentValid}
            />
          )}
          {stepKind === "review" && (
            <ReviewStep
              accountAddress={accountAddress}
              privacyTier={privacyTier}
              anonymous={anonymous}
              onAnonymousChange={setAnonymous}
              status={status}
              onSubmit={submit}
            />
          )}
        </div>
      </div>

      <FooterChrome
        canGoBack={idx > 0}
        canGoNext={
          idx < totalSteps - 1 && (stepKind !== "question" || isCurrentValid)
        }
        onBack={goBack}
        onNext={goNext}
      />
    </div>
  );
}

// ───────────────────────── Steps ─────────────────────────

function IntroStep({
  metadata,
  privacyTier,
  questionCount,
  onStart,
}: {
  metadata: FormMetadata;
  privacyTier: number;
  questionCount: number;
  onStart: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {privacyTier !== 0 && (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
          <Lock size={11} />
          {TIER_LABELS[privacyTier] ?? "encrypted"} · Seal
        </span>
      )}
      <h1 className="text-4xl font-semibold leading-tight tracking-tight text-zinc-50 sm:text-5xl">
        {metadata.title}
      </h1>
      {metadata.description && (
        <p className="text-base leading-relaxed text-zinc-400">
          {metadata.description}
        </p>
      )}
      <p className="text-xs text-zinc-500">
        {questionCount} question{questionCount === 1 ? "" : "s"} · gas sponsored
        by Enoki · answers stored on Walrus
      </p>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={onStart}
          className="rounded-full bg-blue-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-400"
        >
          Start
        </button>
        <span className="text-xs text-zinc-500">
          press <KeyHint>Enter ↵</KeyHint>
        </span>
      </div>
    </div>
  );
}

function QuestionStep({
  field,
  index,
  total,
  value,
  onChange,
  onAdvance,
  isValid,
}: {
  field: FormField;
  index: number;
  total: number;
  value?: SubmissionAnswer;
  onChange: (v: SubmissionAnswer) => void;
  onAdvance: () => void;
  isValid: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start gap-3">
        <span className="mt-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-xs font-semibold text-zinc-300">
          {index + 1}
        </span>
        <h2 className="text-2xl font-semibold leading-tight text-zinc-50 sm:text-3xl">
          {field.label}
          {field.required && (
            <span className="ml-1 text-rose-400" aria-label="required">
              *
            </span>
          )}
        </h2>
      </header>

      <TakeoverInput
        field={field}
        value={value}
        onChange={onChange}
        onAdvance={onAdvance}
      />

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onAdvance}
          disabled={!isValid}
          className={cn(
            "rounded-full px-6 py-2.5 text-sm font-semibold shadow-lg transition",
            isValid
              ? "bg-blue-500 text-white shadow-blue-500/20 hover:bg-blue-400"
              : "cursor-not-allowed bg-zinc-800 text-zinc-500 shadow-none",
          )}
        >
          OK
        </button>
        <span className="text-xs text-zinc-500">
          press <KeyHint>Enter ↵</KeyHint>
        </span>
        <span className="ml-auto text-[11px] uppercase tracking-wider text-zinc-600">
          {index + 1} / {total}
        </span>
      </div>
    </div>
  );
}

function ReviewStep({
  accountAddress,
  privacyTier,
  anonymous,
  onAnonymousChange,
  status,
  onSubmit,
}: {
  accountAddress?: string;
  privacyTier: number;
  anonymous: boolean;
  onAnonymousChange: (v: boolean) => void;
  status: SubmitStatus;
  onSubmit: (mode?: "wallet" | "walletless") => void;
}) {
  const submitting = status.kind === "submitting";
  const canWalletless =
    !accountAddress && privacyTier === PrivacyTier.Public && !submitting;
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
        Ready to submit?
      </h2>
      <p className="text-sm leading-relaxed text-zinc-400">
        Your answers are bundled into a single payload, uploaded to Walrus, and
        a SubmissionRef is anchored on Sui. Gas is sponsored by Enoki — you
        don&apos;t need any SUI in your wallet.
      </p>

      <button
        type="button"
        onClick={() => onAnonymousChange(!anonymous)}
        className={cn(
          "flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition",
          anonymous
            ? "border-blue-500/60 bg-blue-500/10"
            : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700",
        )}
      >
        <span
          className={cn(
            "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
            anonymous
              ? "border-blue-400 bg-blue-500 text-white"
              : "border-zinc-700 bg-zinc-950",
          )}
        >
          {anonymous && <Check size={14} strokeWidth={3} />}
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-100">
            Submit anonymously
          </span>
          <span className="text-xs leading-relaxed text-zinc-500">
            Your wallet signs a one-time nullifier; only the 32-byte hash hits
            the chain — never your address. Each wallet can submit anonymously{" "}
            <strong className="text-zinc-300">once</strong> per form.
          </span>
        </span>
      </button>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        {canWalletless && (
          <button
            type="button"
            onClick={() => onSubmit("walletless")}
            className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800"
            title="Echo generates a one-time keypair locally, signs the sponsored tx, and discards it. No wallet needed."
          >
            Submit without wallet
          </button>
        )}
        <button
          type="button"
          onClick={() => onSubmit("wallet")}
          disabled={!accountAddress || submitting}
          className={cn(
            "rounded-full px-6 py-2.5 text-sm font-semibold shadow-lg transition",
            accountAddress && !submitting
              ? "bg-blue-500 text-white shadow-blue-500/20 hover:bg-blue-400"
              : "cursor-not-allowed bg-zinc-800 text-zinc-500 shadow-none",
          )}
        >
          {submitting
            ? "Submitting…"
            : accountAddress
              ? "Submit"
              : "Connect wallet to submit"}
        </button>
      </div>

      {submitting && (
        <p className="text-xs text-zinc-500">
          {status.kind === "submitting" ? status.step : ""}
        </p>
      )}
      {status.kind === "error" && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">
          {status.message}
        </div>
      )}
    </div>
  );
}

function SubmittedTakeover({
  digest,
  onSubmitAnother,
}: {
  digest: string;
  onSubmitAnother: () => void;
}) {
  return (
    <div className="-mx-2xs -my-2xs flex min-h-[calc(100dvh-0px)] items-center justify-center bg-zinc-950 px-6 text-center">
      <div className="flex max-w-md flex-col items-center gap-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
          <Check size={36} strokeWidth={2.5} />
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-50">
            Thanks for submitting!
          </h2>
          <p className="text-sm text-zinc-400">
            Your response is on chain. The form admin can decrypt it (or read
            plaintext for Public forms) at their convenience.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>tx</span>
          <code className="rounded-md bg-zinc-900 px-2 py-1 font-mono text-zinc-300">
            {digest.slice(0, 10)}…{digest.slice(-6)}
          </code>
          <a
            href={`https://suiscan.xyz/testnet/tx/${digest}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 underline hover:text-blue-300"
          >
            view on Suiscan ↗
          </a>
        </div>
        <button
          type="button"
          onClick={onSubmitAnother}
          className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800"
        >
          Submit another response
        </button>
        <p className="mt-4 text-[11px] text-zinc-600">
          Powered by{" "}
          <Link
            href="/"
            className="text-zinc-400 underline hover:text-zinc-200"
          >
            Echo
          </Link>{" "}
          · forms on Sui · Walrus · Seal
        </p>
      </div>
    </div>
  );
}

// ───────────────────────── Inputs (takeover variants) ─────────────────────────

function TakeoverInput({
  field,
  value,
  onChange,
  onAdvance,
}: {
  field: FormField;
  value?: SubmissionAnswer;
  onChange: (v: SubmissionAnswer) => void;
  onAdvance: () => void;
}) {
  const onTextKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onAdvance();
    }
  };
  const onTextareaKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter advances long-text — plain Enter inserts newline.
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onAdvance();
    }
  };

  switch (field.type) {
    case "short_text":
    case "url":
      return (
        <AutoFocusInput
          type={field.type === "url" ? "url" : "text"}
          placeholder="Type your answer here…"
          value={value?.kind === "text" ? value.value : ""}
          onChange={(v) => onChange({ kind: "text", value: v })}
          onKeyDown={onTextKey}
        />
      );
    case "long_text":
      return (
        <AutoFocusTextarea
          placeholder="Type your answer here… (⌘ + Enter to continue)"
          value={value?.kind === "text" ? value.value : ""}
          onChange={(v) => onChange({ kind: "text", value: v })}
          onKeyDown={onTextareaKey}
        />
      );
    case "rich_text":
      return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
          <MarkdownEditor
            value={value?.kind === "text" ? value.value : ""}
            onChange={(next) => onChange({ kind: "text", value: next })}
          />
        </div>
      );
    case "single_select":
    case "dropdown":
      return (
        <ChoiceList
          options={field.options}
          selected={
            value?.kind === "choice" && typeof value.value === "string"
              ? [value.value]
              : []
          }
          multi={false}
          onToggle={(v) => {
            onChange({ kind: "choice", value: v });
            // Auto-advance for single-select — feels like Typeform.
            setTimeout(onAdvance, 180);
          }}
        />
      );
    case "multi_select": {
      const arr =
        value?.kind === "choice" && Array.isArray(value.value)
          ? value.value
          : [];
      return (
        <ChoiceList
          options={field.options}
          selected={arr}
          multi
          onToggle={(v) => {
            const next = arr.includes(v)
              ? arr.filter((x) => x !== v)
              : [...arr, v];
            onChange({ kind: "choice", value: next });
          }}
        />
      );
    }
    case "checkbox":
      return (
        <ChoiceList
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
          selected={
            value?.kind === "checkbox" ? (value.value ? ["yes"] : ["no"]) : []
          }
          multi={false}
          onToggle={(v) => {
            onChange({ kind: "checkbox", value: v === "yes" });
            setTimeout(onAdvance, 180);
          }}
        />
      );
    case "rating": {
      const scale = field.scale ?? 5;
      const current = value?.kind === "rating" ? value.value : 0;
      return (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: scale }, (_, i) => i + 1).map((n) => {
            const active = n <= current;
            return (
              <button
                key={n}
                type="button"
                onClick={() => {
                  onChange({ kind: "rating", value: n });
                  setTimeout(onAdvance, 180);
                }}
                className={cn(
                  "h-12 w-12 rounded-lg border text-base font-semibold transition",
                  active
                    ? "border-blue-400 bg-blue-500 text-white"
                    : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800",
                )}
              >
                {n}
              </button>
            );
          })}
        </div>
      );
    }
    case "date":
    case "time":
      return (
        <AutoFocusInput
          type={field.type}
          value={value?.kind === "date" ? value.value : ""}
          onChange={(v) => onChange({ kind: "date", value: v })}
          onKeyDown={onTextKey}
        />
      );
    case "file_upload":
    case "screenshot":
    case "video":
      return (
        <FileTakeover
          field={field}
          value={value?.kind === "blob" ? value : undefined}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}

function AutoFocusInput({
  type,
  placeholder,
  value,
  onChange,
  onKeyDown,
}: {
  type: "text" | "url" | "date" | "time";
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <input
      ref={ref}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className="w-full border-0 border-b border-zinc-700 bg-transparent pb-3 text-2xl text-zinc-50 placeholder:text-zinc-600 focus:border-blue-400 focus:outline-none focus:ring-0 sm:text-3xl"
    />
  );
}

function AutoFocusTextarea({
  placeholder,
  value,
  onChange,
  onKeyDown,
}: {
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      rows={4}
      className="w-full resize-y border-0 border-b border-zinc-700 bg-transparent pb-3 text-xl leading-relaxed text-zinc-50 placeholder:text-zinc-600 focus:border-blue-400 focus:outline-none focus:ring-0 sm:text-2xl"
    />
  );
}

function ChoiceList({
  options,
  selected,
  multi,
  onToggle,
}: {
  options: Array<{ value: string; label: string }>;
  selected: string[];
  multi: boolean;
  onToggle: (v: string) => void;
}) {
  // Letter shortcut: A, B, C… up to 26. Press to toggle.
  useEffect(() => {
    const handler = (ev: globalThis.KeyboardEvent) => {
      const target = ev.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      )
        return;
      const code = ev.key.toUpperCase().charCodeAt(0);
      const idx = code - 65;
      if (idx < 0 || idx >= options.length) return;
      ev.preventDefault();
      onToggle(options[idx].value);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [options, onToggle]);

  return (
    <div className="flex flex-col gap-2.5">
      {options.map((opt, i) => {
        const isSelected = selected.includes(opt.value);
        const letter = String.fromCharCode(65 + i);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={cn(
              "group flex items-center gap-3 rounded-full border px-4 py-3 text-left text-base transition",
              isSelected
                ? "border-blue-400/70 bg-blue-500/15 text-zinc-50"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-200 hover:border-zinc-700 hover:bg-zinc-900",
            )}
          >
            <span
              className={cn(
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold uppercase tracking-wider",
                isSelected
                  ? "bg-blue-500 text-white"
                  : "bg-zinc-800 text-zinc-300 group-hover:bg-zinc-700",
              )}
            >
              {letter}
            </span>
            <span className="flex-1">{opt.label}</span>
            {multi && isSelected && (
              <Check size={16} className="text-blue-300" />
            )}
          </button>
        );
      })}
      {multi && (
        <p className="mt-1 text-[11px] uppercase tracking-wider text-zinc-600">
          Select all that apply
        </p>
      )}
    </div>
  );
}

function FileTakeover({
  field,
  value,
  onChange,
}: {
  field: FormField & { type: "file_upload" | "screenshot" | "video" };
  value?: Extract<SubmissionAnswer, { kind: "blob" }>;
  onChange: (v: SubmissionAnswer) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const accept =
    "accept" in field && field.accept
      ? field.accept
      : field.type === "screenshot"
        ? "image/*"
        : field.type === "video"
          ? "video/*"
          : undefined;

  const upload = async (file: File) => {
    setError(null);
    setUploading(true);
    setPendingName(file.name);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const out = await uploadBytesViaPublisher(bytes);
      onChange({
        kind: "blob",
        blobId: out.blobId,
        mimeType: file.type || undefined,
        bytes: file.size,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <Check size={18} className="text-emerald-400" />
        <code className="flex-1 text-sm text-zinc-300">
          {value.blobId.slice(0, 18)}…
        </code>
        <button
          type="button"
          onClick={() => onChange({ kind: "blob", blobId: "", bytes: 0 })}
          className="text-xs text-zinc-500 underline hover:text-zinc-300"
        >
          replace
        </button>
      </div>
    );
  }

  return (
    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-zinc-700 bg-zinc-900/20 px-6 py-10 text-center transition hover:border-zinc-600 hover:bg-zinc-900/40">
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <span className="text-sm font-medium text-zinc-200">
        {uploading
          ? `Uploading ${pendingName ?? "…"}`
          : `Click to upload ${
              field.type === "screenshot"
                ? "an image"
                : field.type === "video"
                  ? "a video"
                  : "a file"
            }`}
      </span>
      {accept && (
        <span className="text-xs text-zinc-500">
          Accepts <code>{accept}</code>
        </span>
      )}
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </label>
  );
}

// ───────────────────────── Chrome ─────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  return (
    <div className="absolute left-0 right-0 top-0 h-[3px] bg-zinc-900">
      <div
        className="h-full bg-blue-500 transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function FooterChrome({
  canGoBack,
  canGoNext,
  onBack,
  onNext,
}: {
  canGoBack: boolean;
  canGoNext: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 flex items-end justify-between gap-3 px-4 pb-4 sm:px-6 sm:pb-6">
      <Link
        href="/"
        className="pointer-events-auto rounded-full bg-zinc-900/80 px-3 py-1.5 text-[11px] font-medium text-zinc-400 backdrop-blur transition hover:bg-zinc-800 hover:text-zinc-200"
      >
        Powered by <span className="text-zinc-200">Echo</span>
      </Link>
      <div className="pointer-events-auto flex overflow-hidden rounded-full bg-blue-500 shadow-lg shadow-blue-500/20">
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          className="px-3 py-2 text-white transition hover:bg-blue-400 disabled:opacity-40"
          aria-label="Previous question"
        >
          <ChevronUp size={18} />
        </button>
        <span className="w-px bg-blue-400/40" />
        <button
          type="button"
          onClick={onNext}
          disabled={!canGoNext}
          className="px-3 py-2 text-white transition hover:bg-blue-400 disabled:opacity-40"
          aria-label="Next question"
        >
          <ChevronDown size={18} />
        </button>
      </div>
    </div>
  );
}

function KeyHint({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
      {children}
    </kbd>
  );
}

// ───────────────────────── Helpers ─────────────────────────

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
