"use client";

import dynamic from "next/dynamic";
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
import { ArrowDown, ArrowUp, Check, Lock } from "lucide-react";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import { MarkdownEditor } from "./MarkdownEditor";
import { WalrusMascot, type MascotPose } from "./FrameForms";
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
  type RatingField,
  type ChoiceField,
} from "@/lib/echo";

const ConnectButton = dynamic(
  () => import("@mysten/dapp-kit-react/ui").then((mod) => mod.ConnectButton),
  { ssr: false },
);

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

  const formQuery = useQuery({
    queryKey: ["echo", "form", formId],
    queryFn: async () => {
      const resp = await suiClient.getObject({
        objectId: formId,
        include: { json: true },
      });
      const onChain = resp.object.json as OnChainForm | null;
      if (!onChain) throw new Error("Form has no JSON content; bad object id?");
      // Derive the Echo package from THIS form's own on-chain type
      // (`0x<pkg>::form::Form`). Forms are immutable and bound to the
      // package that created them, so submit/admin calls MUST target
      // that package — not the build-time clientConfig.ECHO_PACKAGE_ID,
      // which only matches forms from one deployment. This makes forms
      // created by older/other package versions submit correctly too.
      let formPackageId = clientConfig.ECHO_PACKAGE_ID;
      const t0 = (resp.object as { type?: string }).type;
      if (typeof t0 === "string" && t0.includes("::form::")) {
        formPackageId = t0.split("::")[0];
      } else {
        try {
          const r = await fetch(clientConfig.SUI_FULLNODE_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "sui_getObject",
              params: [formId, { showType: true }],
            }),
          });
          const j = (await r.json()) as {
            result?: { data?: { type?: string } };
          };
          const tt = j?.result?.data?.type;
          if (typeof tt === "string" && tt.includes("::form::")) {
            formPackageId = tt.split("::")[0];
          }
        } catch {
          /* keep clientConfig fallback */
        }
      }
      const network = clientConfig.WALRUS_NETWORK;
      const [schema, metadata] = await Promise.all([
        readJsonViaAggregator<FormSchema>(onChain.schema_blob_id, { network }),
        readJsonViaAggregator<FormMetadata>(onChain.metadata_blob_id, {
          network,
        }),
      ]);
      return { onChain, schema, metadata, formPackageId };
    },
    enabled: formId.startsWith("0x"),
    retry: 1,
  });

  if (formQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-500">
        Loading form…
      </div>
    );
  }
  if (formQuery.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-center text-sm text-rose-400">
        Failed to load: {(formQuery.error as Error).message}
      </div>
    );
  }
  if (!formQuery.data) return null;

  const { onChain, schema, metadata, formPackageId } = formQuery.data;
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
          packageId={formPackageId}
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
  // Fixed inset-0 escapes the global <main> padding and the page-level
  // <section max-w-[768px]> wrapper. Light Echo paper background — the
  // Frame×MemWal×Sui form-filler design owns the full viewport instead
  // of nesting under a hero shell.
  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto antialiased"
      style={{
        background: "var(--echo-paper, #FFFFFF)",
        color: "var(--echo-ink, #0A0A0A)",
      }}
    >
      {children}
    </div>
  );
}

const TIER_COLOR_HEX = ["#0A0A0A", "#4DA2FF", "#A06EE9", "#6CD3D6", "#E8A540"];

function SlimTopbar({
  privacyTier,
  unlocked,
}: {
  privacyTier: number;
  unlocked: boolean;
}) {
  const tierColor = TIER_COLOR_HEX[privacyTier] ?? "#0A0A0A";
  const tierName = TIER_LABELS[privacyTier] ?? "Public";
  return (
    <header
      className="sticky top-0 z-20"
      style={{
        background: "var(--echo-paper)",
        borderBottom: "1px solid var(--echo-rail)",
      }}
    >
      <div
        className="mx-auto flex items-center justify-between gap-4 px-6 py-3"
        style={{ maxWidth: 1200 }}
      >
        <Link
          href="/"
          className="flex items-center gap-2"
          style={{ color: "var(--echo-ink)" }}
        >
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 16,
              height: 16,
              background: "var(--echo-ink)",
            }}
          />
          <span
            style={{
              fontWeight: 600,
              letterSpacing: "-0.02em",
              fontSize: 15,
            }}
          >
            echo
          </span>
        </Link>
        <div
          className="hidden sm:flex items-center gap-3"
          style={{ fontSize: 12 }}
        >
          <span
            className="inline-flex items-center gap-2"
            style={{ color: "var(--echo-ink)" }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                background: tierColor,
              }}
            />
            <span style={{ fontWeight: 500 }}>{tierName} form</span>
            {privacyTier > 0 && (
              <span
                className="font-mono"
                style={{
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid var(--echo-rail)",
                  color: unlocked ? "var(--echo-success)" : "var(--echo-mut)",
                  background: unlocked
                    ? "var(--echo-success-bg)"
                    : "var(--echo-rail-2)",
                }}
              >
                {unlocked ? "✓ unlocked" : "● locked"}
              </span>
            )}
          </span>
        </div>
        <span
          className="font-mono hidden md:inline"
          style={{
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--echo-mut)",
          }}
        >
          gas sponsored by Enoki · stored on Walrus
        </span>
      </div>
    </header>
  );
}

function ClosedNotice({ title, status }: { title: string; status: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div
        className="max-w-[460px] text-center rounded-md border-2 p-8"
        style={{
          borderColor: "var(--echo-ink)",
          background: "var(--echo-paper-2)",
          boxShadow: "var(--echo-brut-shadow)",
        }}
      >
        <Lock
          size={28}
          style={{ color: "var(--echo-mut)", margin: "0 auto" }}
        />
        <h1
          className="mt-4"
          style={{
            fontSize: 32,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            color: "var(--echo-ink)",
          }}
        >
          {title}
        </h1>
        <p
          className="mt-3"
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--echo-mut)",
          }}
        >
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
  const { schema, accountAddress, suiClient, privacyTier } = props;
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

  // Hoisted above the conditional early-return below so the rules of
  // hooks aren't violated — useTierGateState owns a useState that must
  // run on every render of this component.
  const tierGate = useTierGateState(props);

  // Predicate gate (token/NFT/SuiNS holdings) still uses the simple
  // verify-again card; conceptually it's "you don't qualify" rather
  // than the tier-level "form is encrypted / locked / waiting on
  // shares" gates below.
  if (gating && accountAddress && gateQuery.data && !gateQuery.data.ok) {
    return (
      <>
        <SlimTopbar privacyTier={privacyTier} unlocked={false} />
        <div className="flex min-h-[calc(100vh-56px)] items-center justify-center px-6">
          <div
            className="max-w-[460px] rounded-md border-2 p-8 text-center"
            style={{
              borderColor: "var(--echo-ink)",
              background: "var(--echo-paper-2)",
              boxShadow: "var(--echo-brut-shadow)",
            }}
          >
            <Lock size={28} style={{ color: "#B45309", margin: "0 auto" }} />
            <p
              className="mt-4"
              style={{
                fontSize: 15,
                lineHeight: 1.55,
                color: "var(--echo-ink)",
              }}
            >
              {gateQuery.data.reason}
            </p>
            <button
              type="button"
              onClick={() => gateQuery.refetch()}
              disabled={gateQuery.isFetching}
              className="mt-5"
              style={{
                fontFamily:
                  "var(--echo-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                padding: "10px 18px",
                border: "2px solid var(--echo-ink)",
                background: "var(--echo-paper)",
                color: "var(--echo-ink)",
                boxShadow: "var(--echo-brut-shadow-sm)",
                cursor: gateQuery.isFetching ? "wait" : "pointer",
                opacity: gateQuery.isFetching ? 0.6 : 1,
              }}
            >
              {gateQuery.isFetching ? "Checking…" : "Verify again →"}
            </button>
          </div>
        </div>
      </>
    );
  }

  // Tier-level gate screens — render BEFORE the form so the visitor
  // understands the privacy model and reaches the form once gating is
  // cleared. AdminOnly (1) and Threshold (2) both require a wallet
  // connection before we can run gating; Time-locked (3) shows a
  // ticking countdown; Conditional (4) shows the on-chain rule.
  if (tierGate.show) {
    return (
      <>
        <SlimTopbar privacyTier={privacyTier} unlocked={false} />
        <GateScreen
          privacyTier={privacyTier}
          unlockMs={props.unlockMs}
          thresholdN={props.thresholdN}
          accountAddress={accountAddress}
          onUnlock={tierGate.dismiss}
        />
      </>
    );
  }

  return <Takeover {...props} />;
}

function useTierGateState(props: GatedProps) {
  // Public skips the gate. Private tiers show their per-tier screen on
  // first visit; the visitor clicks "enter" to dismiss it and reach the
  // form. The cryptographic enforcement happens at decrypt time on the
  // owner's side — the gate is informational + brand storytelling.
  const [dismissed, setDismissed] = useState(false);
  const isPublic = props.privacyTier === PrivacyTier.Public;
  return {
    show: !isPublic && !dismissed,
    dismiss: () => setDismissed(true),
  };
}

function GateScreen({
  privacyTier,
  unlockMs,
  thresholdN,
  accountAddress,
  onUnlock,
}: {
  privacyTier: number;
  unlockMs: string;
  thresholdN: number;
  accountAddress?: string;
  onUnlock: () => void;
}) {
  const cfg = GATE_COPY[privacyTier] ?? GATE_COPY[1];
  const pose: MascotPose =
    privacyTier === 3
      ? "haulout"
      : privacyTier === 2
        ? "salute"
        : privacyTier === 4
          ? "salute"
          : "peace";
  const [unlocking, setUnlocking] = useState(false);
  const tierColor = TIER_COLOR_HEX[privacyTier] ?? "#0A0A0A";

  // Live countdown for time-lock — pure visual flourish if we have an
  // unlock_ms; falls back to a hand-coded 27:12 demo if not.
  const unlockTarget = unlockMs && unlockMs !== "0" ? Number(unlockMs) : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (privacyTier !== 3) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [privacyTier]);
  const remainingMs = Math.max(0, unlockTarget - now);
  const totalSecs = Math.floor(remainingMs / 1000);
  const fallbackSecs = Math.floor((Date.now() / 1000) % 60);
  const tlMins = unlockTarget > 0 ? Math.floor(totalSecs / 60) : 27;
  const tlSecs =
    unlockTarget > 0 ? totalSecs % 60 : (59 - fallbackSecs + 60) % 60;

  function handleUnlock() {
    setUnlocking(true);
    setTimeout(onUnlock, 1500);
  }

  return (
    <section
      className="mx-auto grid items-center gap-10 px-6 py-12"
      style={{
        maxWidth: 1100,
        gridTemplateColumns: "1.05fr 0.95fr",
      }}
    >
      <div>
        <p
          className="font-mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 18,
          }}
        >
          <span style={{ color: tierColor }}>● {cfg.eyebrow}</span>
          <span style={{ margin: "0 10px", color: "var(--echo-mut-2)" }}>
            ·
          </span>
          <span style={{ color: "var(--echo-mut)" }}>form locked</span>
        </p>
        <h1
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            fontSize: "clamp(40px, 5.5vw, 64px)",
            letterSpacing: "-0.045em",
            lineHeight: 1.02,
            color: "var(--echo-ink)",
            margin: "0 0 14px",
            textWrap: "balance" as never,
          }}
        >
          {cfg.title}
        </h1>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.55,
            color: "var(--echo-mut)",
            maxWidth: 520,
            margin: "0 0 22px",
          }}
        >
          {cfg.sub}
        </p>

        {privacyTier === 2 && (
          <ThresholdShares haveShares={1} need={thresholdN || 2} total={3} />
        )}
        {privacyTier === 3 && <TimeLockCountdown mins={tlMins} secs={tlSecs} />}
        {privacyTier === 4 && <CondProgress have={6} need={10} />}

        <div
          className="mt-6 flex items-center gap-3 flex-wrap"
          style={{ marginTop: 28 }}
        >
          <button
            type="button"
            onClick={handleUnlock}
            disabled={unlocking}
            style={{
              fontFamily:
                "var(--echo-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "14px 22px",
              border: "2px solid var(--echo-ink)",
              background: "var(--echo-ink)",
              color: "var(--echo-paper)",
              boxShadow: "var(--echo-brut-shadow)",
              cursor: unlocking ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              opacity: unlocking ? 0.85 : 1,
            }}
          >
            {unlocking ? "unlocking…" : cfg.cta}
            <span style={{ fontSize: "1.05em" }}>→</span>
          </button>
          <button
            type="button"
            onClick={onUnlock}
            title="design-mode shortcut — skip the gate and reveal the form"
            style={{
              fontFamily:
                "var(--echo-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "10px 4px",
            }}
          >
            preview the form ↗
          </button>
        </div>

        <p
          className="font-mono"
          style={{
            fontSize: 11,
            color: "var(--echo-mut)",
            marginTop: 18,
            maxWidth: 440,
          }}
        >
          {cfg.detail}
        </p>
        {privacyTier === 1 && !accountAddress && (
          <p
            className="font-mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--echo-warn)",
              marginTop: 10,
            }}
          >
            ⚠ no wallet connected · click {cfg.cta.toLowerCase()} to continue
          </p>
        )}
      </div>

      <div
        className="relative"
        style={{
          minHeight: 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 24,
            background: "var(--echo-aurora-plate)",
            opacity: 0.85,
            filter: "blur(8px)",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 24,
            borderRadius: 999,
            border: `2px solid ${tierColor}`,
            opacity: 0.32,
            animation: "ff-bobble 2.4s ease-in-out infinite",
          }}
        />
        <div style={{ position: "relative", zIndex: 2 }}>
          <WalrusMascot pose={pose} size={260} bobble />
        </div>
        {privacyTier === 1 && unlocking && (
          <div
            className="font-mono absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 px-3 py-2"
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              background: "var(--echo-paper)",
              border: "1px solid var(--echo-ink)",
              boxShadow: "var(--echo-brut-shadow-sm)",
            }}
          >
            <span>sui wallet · signing</span>
            <span
              style={{
                display: "inline-flex",
                gap: 3,
              }}
            >
              <Dot delay={0} />
              <Dot delay={0.18} />
              <Dot delay={0.36} />
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

const GATE_COPY: Record<
  number,
  {
    eyebrow: string;
    title: string;
    sub: string;
    cta: string;
    detail: string;
  }
> = {
  1: {
    eyebrow: "wallet-gated form",
    title: "Connect a wallet to fill.",
    sub: "This form is admin-gated. We check your wallet against the allowlist on chain before revealing the questions.",
    cta: "Connect wallet",
    detail:
      "Enoki sponsors the sign — you pay 0 gas. Disconnect after submitting if you'd rather.",
  },
  2: {
    eyebrow: "threshold-decrypted",
    title: "Collecting decrypt shares.",
    sub: "This form's answers reveal once a quorum of admins post their Seal approvals on chain. Submissions stay open in the meantime.",
    cta: "Continue to form",
    detail:
      "Shares come in from the admins' wallets. We'll auto-unlock the read-side the moment k is met.",
  },
  3: {
    eyebrow: "time-locked",
    title: "Sealed until the unlock epoch.",
    sub: "This form is encrypted by time. Reveals automatically when the chain reaches the unlock epoch — no share-posting required.",
    cta: "Continue to form",
    detail:
      "Powered by Seal time-lock. Submissions are encrypted with an identity bound to the unlock_ms.",
  },
  4: {
    eyebrow: "conditional",
    title: "On-chain rule gates the reveal.",
    sub: "The form unseals once the on-chain predicate (token / NFT / SuiNS hold) is satisfied for the reader.",
    cta: "Continue to form",
    detail:
      "Conditional Seal — a Move predicate defines the rule. Audit on chain.",
  },
};

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        width: 5,
        height: 5,
        borderRadius: 999,
        background: "var(--echo-ink)",
        display: "inline-block",
        animation: "ff-bobble 1.05s ease-in-out infinite",
        animationDelay: `${delay}s`,
      }}
    />
  );
}

function ThresholdShares({
  haveShares,
  need,
  total,
}: {
  haveShares: number;
  need: number;
  total: number;
}) {
  const slots = Math.max(total, need);
  return (
    <div className="flex flex-col gap-3" style={{ maxWidth: 480 }}>
      <span
        className="font-mono"
        style={{
          fontSize: 11,
          color: "var(--echo-mut)",
          letterSpacing: "0.08em",
        }}
      >
        decrypt shares · {haveShares} of {need} required
      </span>
      <div className="flex items-stretch gap-3">
        {Array.from({ length: slots }).map((_, i) => {
          const filled = i < haveShares;
          const required = i < need;
          return (
            <div
              key={i}
              className="flex flex-col items-center gap-1.5 flex-1"
              style={{
                padding: "14px 10px",
                border: `1px ${filled ? "solid" : "dashed"} ${
                  filled
                    ? "var(--echo-ink)"
                    : required
                      ? "var(--echo-sui-violet)"
                      : "var(--echo-rail)"
                }`,
                borderRadius: 8,
                background: filled ? "var(--echo-rail-2)" : "var(--echo-paper)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: filled
                    ? "var(--echo-aurora-plate)"
                    : required
                      ? "transparent"
                      : "transparent",
                  border: `2px solid ${
                    filled
                      ? "var(--echo-ink)"
                      : required
                        ? "var(--echo-sui-violet)"
                        : "var(--echo-rail)"
                  }`,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: filled ? "var(--echo-ink)" : "transparent",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {filled ? "✓" : ""}
              </span>
              <span
                className="font-mono"
                style={{
                  fontSize: 9,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--echo-mut-2)",
                }}
              >
                share {i + 1}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: filled
                    ? "var(--echo-success)"
                    : required
                      ? "var(--echo-sui-violet)"
                      : "var(--echo-mut-2)",
                }}
              >
                {filled ? "posted" : required ? "needed" : "optional"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeLockCountdown({ mins, secs }: { mins: number; secs: number }) {
  const mm = String(Math.max(0, mins)).padStart(2, "0");
  const ss = String(Math.max(0, secs)).padStart(2, "0");
  return (
    <div className="flex flex-col gap-2" style={{ maxWidth: 480 }}>
      <span
        className="font-mono"
        style={{
          fontSize: 11,
          color: "var(--echo-mut)",
          letterSpacing: "0.08em",
        }}
      >
        time until unlock
      </span>
      <div
        className="flex items-baseline gap-2"
        style={{
          fontFamily: "Inter, sans-serif",
          fontWeight: 600,
          fontSize: 64,
          letterSpacing: "-0.04em",
          color: "var(--echo-ink)",
          lineHeight: 1,
        }}
      >
        <span>{mm}</span>
        <span style={{ color: "var(--echo-mut-2)" }}>:</span>
        <span style={{ color: "var(--echo-sui-violet)" }}>{ss}</span>
        <span
          className="font-mono"
          style={{
            fontSize: 11,
            color: "var(--echo-mut)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginLeft: 10,
            fontWeight: 500,
          }}
        >
          mins · secs
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: "var(--echo-rail-2)",
          borderRadius: 999,
          overflow: "hidden",
          marginTop: 8,
        }}
      >
        <div
          style={{
            width: "32%",
            height: "100%",
            background: "var(--echo-aurora-plate)",
          }}
        />
      </div>
    </div>
  );
}

function CondProgress({ have, need }: { have: number; need: number }) {
  const pct = Math.round((have / Math.max(1, need)) * 100);
  return (
    <div className="flex flex-col gap-2" style={{ maxWidth: 480 }}>
      <div className="flex items-baseline justify-between">
        <span
          className="font-mono"
          style={{
            fontSize: 11,
            color: "var(--echo-mut)",
            letterSpacing: "0.08em",
          }}
        >
          votes posted
        </span>
        <span
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 600,
            fontSize: 24,
            letterSpacing: "-0.02em",
            color: "var(--echo-ink)",
          }}
        >
          {have}
          <span style={{ color: "var(--echo-mut-2)" }}> / {need}</span>
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: "var(--echo-rail-2)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "var(--echo-aurora-plate)",
          }}
        />
      </div>
      <div className="flex gap-1 flex-wrap mt-1">
        {Array.from({ length: need }).map((_, i) => (
          <span
            key={i}
            style={{
              width: 16,
              height: 4,
              borderRadius: 2,
              background: i < have ? "var(--echo-ink)" : "var(--echo-rail)",
            }}
          />
        ))}
      </div>
    </div>
  );
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
    // Anonymous Sybil resistance relies on the on-chain commitments_used
    // table rejecting a repeat nullifier. Walletless mode mints a fresh
    // ephemeral keypair on every submission, so the nullifier would be
    // unique each time and the one-per-person guarantee silently breaks.
    // Require a persistent wallet identity to anchor the commitment.
    if (mode === "walletless" && anonymous) {
      setStatus({
        kind: "error",
        message:
          "Anonymous submission needs a connected wallet. A walletless key is generated fresh each time, so the one-submission-per-person check can't bind to it — connect a wallet, or turn off “Submit anonymously”.",
      });
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

      // Submissions go through Enoki gas sponsorship (the backend
      // ENOKI_PRIVATE_KEY is provisioned for this network). If the
      // sponsor call fails for any reason, a connected wallet falls
      // back to a normal self-paid tx so the submission still lands.
      // A walletless ephemeral key has no SUI and no self-pay path,
      // so it depends entirely on sponsorship.
      setStatus({
        kind: "submitting",
        step: "Submitting on chain (gas sponsored)…",
      });
      // This form's package may be an older Echo version whose
      // submit/submit_anonymous has no u8 tierHint arg. Introspect the
      // package ABI so the tx args match exactly (otherwise the chain
      // rejects with CommandArgumentError TypeMismatch).
      let takesTierHint = true;
      try {
        const fnResp = await fetch(clientConfig.SUI_FULLNODE_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "sui_getNormalizedMoveFunction",
            params: [packageId, "submission", "submit"],
          }),
        });
        const fnJson = (await fnResp.json()) as {
          result?: { parameters?: unknown[] };
        };
        const params = fnJson?.result?.parameters ?? [];
        takesTierHint = params.some((p) => JSON.stringify(p) === '"U8"');
      } catch {
        /* default true (current package) */
      }
      const tx = anonymous
        ? buildSubmitAnonymousTx({
            packageId,
            formId,
            payloadBlobId: blobId,
            commitment: commitment!,
            tierHint: privacyTier,
            takesTierHint,
          })
        : buildSubmitTx({
            packageId,
            formId,
            payloadBlobId: blobId,
            tierHint: privacyTier,
            takesTierHint,
          });

      let digest: string;
      if (mode === "walletless" && ephemeralKeypair) {
        try {
          ({ digest } = await executeSponsoredWithKeypair({
            tx,
            keypair: ephemeralKeypair,
            suiClient,
            packageId,
          }));
        } catch {
          throw new Error(
            "Gas-free submission failed — the sponsor service is unavailable. Connect a wallet to submit (you'll pay ≈0.004 SUI in gas).",
          );
        }
      } else {
        try {
          ({ digest } = await executeSponsored({
            tx,
            sender: accountAddress!,
            suiClient,
            dAppKit,
            packageId,
          }));
        } catch {
          // Sponsorship unavailable — fall back to a normal self-paid
          // tx so the submission still lands.
          setStatus({
            kind: "submitting",
            step: "Submitting on chain (you pay ≈0.004 SUI gas)…",
          });
          const result = await dAppKit.signAndExecuteTransaction({
            transaction: tx,
          });
          if (result.$kind === "FailedTransaction") {
            throw new Error("Submission transaction failed on chain.");
          }
          digest = result.Transaction.digest;
        }
      }
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
    <div className="relative flex min-h-screen flex-col">
      <SlimTopbar privacyTier={privacyTier} unlocked />
      <ProgressBar
        current={idx}
        total={totalSteps - 1 /* intro doesn't count toward % */}
        stepKind={stepKind}
        stepIdx={idx}
      />

      <div className="flex flex-1 items-stretch justify-center px-4 py-10 sm:px-8 sm:py-14">
        <div className="w-full" style={{ maxWidth: 1100 }}>
          {stepKind === "intro" && (
            <IntroStep
              metadata={metadata}
              formId={formId}
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
              fields={visibleFields}
              answers={answers}
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
  formId,
  privacyTier,
  questionCount,
  onStart,
}: {
  metadata: FormMetadata;
  formId: string;
  privacyTier: number;
  questionCount: number;
  onStart: () => void;
}) {
  const tierName = TIER_LABELS[privacyTier] ?? "Public";
  const tierColor = TIER_COLOR_HEX[privacyTier] ?? "#0A0A0A";
  // The design splits the title at " · " into two display words. Most
  // form titles won't have a divider so we fall through to a single
  // word — the "." after the last word is the brand signature dot.
  const titleParts = metadata.title.split(" · ");
  return (
    <section
      className="grid items-center gap-10 sm:gap-14"
      style={{ gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 0.95fr)" }}
    >
      <div>
        <p
          className="font-mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--echo-mut)",
            marginBottom: 14,
          }}
        >
          <span
            className="inline-flex items-center gap-1.5"
            style={{ color: tierColor }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 7,
                height: 7,
                borderRadius: 999,
                background: tierColor,
              }}
            />
            {tierName.toLowerCase()} form
          </span>
          <span style={{ margin: "0 10px", color: "var(--echo-mut-2)" }}>
            ·
          </span>
          {questionCount} question{questionCount === 1 ? "" : "s"} · about{" "}
          {Math.max(1, Math.round(questionCount * 0.7))} min
        </p>
        <h1
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            fontSize: "clamp(40px, 6.2vw, 76px)",
            letterSpacing: "-0.05em",
            lineHeight: 0.98,
            color: "var(--echo-ink)",
            margin: "0 0 18px",
            textWrap: "balance" as never,
          }}
        >
          {titleParts.map((part, i) => (
            <span key={i}>
              {part}
              {i < titleParts.length - 1 && (
                <span
                  style={{
                    color: "var(--echo-sui-violet)",
                    fontStyle: "italic",
                    fontFamily: "Instrument Serif, Georgia, serif",
                  }}
                >
                  .
                </span>
              )}
            </span>
          ))}
          <span
            style={{
              color: "var(--echo-sui-violet)",
              fontStyle: "italic",
              fontFamily: "Instrument Serif, Georgia, serif",
            }}
          >
            .
          </span>
        </h1>
        {metadata.description && (
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.55,
              color: "var(--echo-mut)",
              maxWidth: 560,
              margin: "0 0 28px",
            }}
          >
            {metadata.description}
          </p>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onStart}
            style={{
              fontFamily:
                "var(--echo-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              padding: "16px 26px",
              border: "2px solid var(--echo-ink)",
              background: "var(--echo-ink)",
              color: "var(--echo-paper)",
              boxShadow: "var(--echo-brut-shadow)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            start
            <span style={{ fontSize: "1.15em" }}>→</span>
          </button>
          <span
            className="font-mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
            }}
          >
            press <KeyHint>Enter ↵</KeyHint>
          </span>
        </div>
        <div
          className="grid gap-6 mt-9"
          style={{
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            maxWidth: 580,
          }}
        >
          <MetaPair label="storage" value="walrus aggregator" />
          <MetaPair label="gas" value="sponsored · Enoki" />
          <MetaPair label="anon" value="optional" />
          <MetaPair label="object" value={`${formId.slice(0, 8)}…`} mono />
        </div>
      </div>
      <div
        className="relative"
        style={{
          minHeight: 360,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 32,
            background: "var(--echo-aurora-plate)",
            opacity: 0.95,
            filter: "blur(2px)",
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 2,
            filter: "drop-shadow(0 18px 24px rgba(77,162,255,0.30))",
          }}
          className="ff-bobble"
        >
          <WalrusMascot pose="peace" size={300} priority />
        </div>
        <span
          className="font-mono absolute"
          style={{
            top: 16,
            right: 16,
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "5px 10px",
            background: "var(--echo-paper)",
            border: "1px solid var(--echo-ink)",
            boxShadow: "var(--echo-brut-shadow-sm)",
            color: "var(--echo-ink)",
          }}
        >
          say hi 👋
        </span>
      </div>
    </section>
  );
}

function MetaPair({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="font-mono"
        style={{
          fontSize: 9,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--echo-mut)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: "var(--echo-ink)",
          fontFamily: mono
            ? "var(--echo-mono, ui-monospace, SFMono-Regular, Menlo, monospace)"
            : "Inter, sans-serif",
          fontWeight: mono ? 500 : 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// Walrus pose rotation per question — first impression varies which keeps
// each step feeling like its own moment. Pose hints in `field.kind` are
// honored when present (a form schema can opt a field into a specific
// mascot via metadata in the future).
const QUESTION_POSES: MascotPose[] = [
  "peace",
  "salute",
  "primary",
  "haulout",
  "monogram",
];

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
  const isLast = index + 1 === total;
  const pose = QUESTION_POSES[index % QUESTION_POSES.length];
  const useTextarea = field.type === "long_text" || field.type === "rich_text";
  return (
    <section
      className="grid gap-10 sm:gap-14 items-start"
      style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 280px)" }}
    >
      <div className="flex flex-col gap-7">
        <header className="flex flex-col gap-3">
          <p
            className="font-mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
            }}
          >
            question {String(index + 1).padStart(2, "0")}
            <span style={{ color: "var(--echo-mut-2)", margin: "0 8px" }}>
              /
            </span>
            {String(total).padStart(2, "0")}
            {field.required && (
              <>
                <span style={{ color: "var(--echo-mut-2)", margin: "0 8px" }}>
                  ·
                </span>
                <span
                  style={{
                    color: "#B91C1C",
                    fontWeight: 600,
                    letterSpacing: "0.16em",
                  }}
                >
                  required
                </span>
              </>
            )}
          </p>
          <h2
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              fontSize: "clamp(28px, 4vw, 44px)",
              letterSpacing: "-0.035em",
              lineHeight: 1.1,
              color: "var(--echo-ink)",
              margin: 0,
              textWrap: "balance" as never,
            }}
          >
            {field.label}
          </h2>
          {field.description && (
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.55,
                color: "var(--echo-mut)",
                margin: 0,
                maxWidth: 580,
              }}
            >
              {field.description}
            </p>
          )}
        </header>

        <div>
          <TakeoverInput
            field={field}
            value={value}
            onChange={onChange}
            onAdvance={onAdvance}
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={onAdvance}
            disabled={!isValid}
            style={{
              fontFamily:
                "var(--echo-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              padding: "14px 22px",
              border: "2px solid var(--echo-ink)",
              background: isValid ? "var(--echo-ink)" : "var(--echo-rail-2)",
              color: isValid ? "var(--echo-paper)" : "var(--echo-mut-2)",
              boxShadow: isValid ? "var(--echo-brut-shadow)" : "none",
              cursor: isValid ? "pointer" : "not-allowed",
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {isLast ? "review" : "continue"}
            <span style={{ fontSize: "1.1em" }}>→</span>
          </button>
          <span
            className="font-mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
            }}
          >
            press <KeyHint>{useTextarea ? "⌘ Enter" : "Enter ↵"}</KeyHint>
          </span>
        </div>
      </div>

      <aside className="hidden lg:flex flex-col items-center gap-5">
        <div
          className="relative ff-bobble"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <WalrusMascot pose={pose} size={170} />
        </div>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => {
            const state = i < index ? "done" : i === index ? "current" : "todo";
            return (
              <span
                key={i}
                aria-hidden="true"
                style={{
                  width: state === "current" ? 24 : 7,
                  height: 7,
                  borderRadius: 999,
                  background:
                    state === "current"
                      ? "var(--echo-ink)"
                      : state === "done"
                        ? "var(--echo-mut)"
                        : "var(--echo-rail)",
                  transition: "all 220ms ease",
                }}
              />
            );
          })}
        </div>
        <div
          className="flex flex-col items-center gap-1"
          style={{ padding: "12px 14px", textAlign: "center" }}
        >
          <span
            className="font-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
            }}
          >
            stored on walrus
          </span>
          <span
            className="font-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--echo-mut-2)",
            }}
          >
            schema v1 · sealed payload
          </span>
        </div>
      </aside>
    </section>
  );
}

function ReviewStep({
  accountAddress,
  privacyTier,
  anonymous,
  onAnonymousChange,
  status,
  onSubmit,
  fields,
  answers,
}: {
  accountAddress?: string;
  privacyTier: number;
  anonymous: boolean;
  onAnonymousChange: (v: boolean) => void;
  status: SubmitStatus;
  onSubmit: (mode?: "wallet" | "walletless") => void;
  fields: FormField[];
  answers: Record<string, SubmissionAnswer>;
}) {
  const submitting = status.kind === "submitting";
  const canWalletless =
    !accountAddress && privacyTier === PrivacyTier.Public && !submitting;
  const needsWalletForAnonymous = anonymous && !accountAddress;
  const anonymousHint = anonymous
    ? accountAddress
      ? "wallet signs one nullifier · submission stores 0x0"
      : "connect a wallet to make the one-per-form anonymous proof"
    : canWalletless
      ? "walletless submit uses a one-time key · no wallet required"
      : "submit with wallet identity · gas can still be sponsored";

  return (
    <section
      className="grid gap-10 sm:gap-14 items-start"
      style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 320px)" }}
    >
      <div className="flex flex-col gap-7">
        <header className="flex flex-col gap-3">
          <p
            className="font-mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
            }}
          >
            review · before you sign
          </p>
          <h2
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              fontSize: "clamp(28px, 4vw, 44px)",
              letterSpacing: "-0.035em",
              lineHeight: 1.08,
              color: "var(--echo-ink)",
              margin: 0,
              textWrap: "balance" as never,
            }}
          >
            Looks good? Sign once. The form object updates on chain.
          </h2>
        </header>

        <div
          className="flex flex-col"
          style={{ borderTop: "1px solid var(--echo-rail)" }}
        >
          {fields.map((f, i) => (
            <ReviewRow
              key={f.id}
              idx={i + 1}
              field={f}
              answer={answers[f.id]}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => onAnonymousChange(!anonymous)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "14px 16px",
            border: `1.5px solid ${
              anonymous ? "var(--echo-ink)" : "var(--echo-rail)"
            }`,
            background: anonymous ? "var(--echo-rail-2)" : "var(--echo-paper)",
            borderRadius: 8,
            cursor: "pointer",
            textAlign: "left",
            transition: "all 140ms ease",
            boxShadow: anonymous ? "var(--echo-brut-shadow-sm)" : "none",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 44,
              height: 24,
              borderRadius: 999,
              background: anonymous ? "var(--echo-ink)" : "var(--echo-rail)",
              position: "relative",
              transition: "background 160ms ease",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 3,
                left: anonymous ? 23 : 3,
                width: 18,
                height: 18,
                borderRadius: 999,
                background: "var(--echo-paper)",
                transition: "left 200ms cubic-bezier(0.22, 1, 0.36, 1)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
              }}
            />
          </span>
          <span className="flex flex-col gap-1">
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--echo-ink)",
              }}
            >
              Submit anonymously
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: 10,
                letterSpacing: "0.12em",
                color: "var(--echo-mut)",
              }}
            >
              {anonymousHint}
            </span>
          </span>
        </button>

        <div className="flex items-center gap-3 flex-wrap pt-1">
          {accountAddress ? (
            <button
              type="button"
              onClick={() => onSubmit("wallet")}
              disabled={submitting}
              style={{
                fontFamily:
                  "var(--echo-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                padding: "16px 24px",
                border: "2px solid var(--echo-ink)",
                background: submitting
                  ? "var(--echo-rail-2)"
                  : "var(--echo-ink)",
                color: submitting ? "var(--echo-mut-2)" : "var(--echo-paper)",
                boxShadow: submitting ? "none" : "var(--echo-brut-shadow)",
                cursor: submitting ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              {submitting
                ? "submitting…"
                : anonymous
                  ? "sign anonymous proof"
                  : "sign & publish"}
              {!submitting && <span style={{ fontSize: "1.1em" }}>→</span>}
            </button>
          ) : (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                padding: "10px 12px 10px 16px",
                minHeight: 56,
                border: "2px solid var(--echo-ink)",
                background: needsWalletForAnonymous
                  ? "var(--echo-ink)"
                  : "var(--echo-paper)",
                color: needsWalletForAnonymous
                  ? "var(--echo-paper)"
                  : "var(--echo-ink)",
                boxShadow: needsWalletForAnonymous
                  ? "var(--echo-brut-shadow)"
                  : "none",
              }}
            >
              <span
                className="font-mono"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
                {needsWalletForAnonymous
                  ? "connect wallet for anonymous"
                  : "connect wallet to sign"}
              </span>
              <span className="bld-wallet-pill bld-wallet-pill--connect">
                <ConnectButton />
              </span>
            </div>
          )}
          {canWalletless && (
            <button
              type="button"
              onClick={() => {
                if (anonymous) {
                  onAnonymousChange(false);
                  return;
                }
                onSubmit("walletless");
              }}
              disabled={submitting}
              className="font-mono"
              title={
                anonymous
                  ? "Walletless submit already uses a one-time key. Switch anonymous mode off to use it."
                  : "Echo generates a one-time keypair locally, signs the sponsored tx, and discards it. No wallet needed."
              }
              style={{
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "12px 16px",
                border: anonymous
                  ? "1.5px dashed var(--echo-ink)"
                  : "1.5px solid var(--echo-rail)",
                background: "var(--echo-paper)",
                color: "var(--echo-ink)",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.55 : 1,
              }}
            >
              {anonymous
                ? "switch to walletless submit"
                : "submit without wallet ↗"}
            </button>
          )}
          {needsWalletForAnonymous && (
            <span
              className="font-mono"
              style={{
                flexBasis: "100%",
                fontSize: 10,
                letterSpacing: "0.1em",
                color: "var(--echo-mut)",
              }}
            >
              anonymous mode needs a connected wallet so the nullifier cannot be
              bypassed
            </span>
          )}
        </div>

        {submitting && (
          <p
            className="font-mono"
            style={{
              fontSize: 11,
              color: "var(--echo-mut)",
              letterSpacing: "0.08em",
            }}
          >
            {status.kind === "submitting" ? status.step : ""}
          </p>
        )}
        {status.kind === "error" && (
          <div
            style={{
              padding: 14,
              border: "1.5px solid #B91C1C",
              background: "#FEF2F2",
              color: "#7F1D1D",
              fontSize: 13,
              borderRadius: 8,
            }}
          >
            {status.message}
          </div>
        )}
      </div>

      <aside className="hidden lg:flex flex-col gap-5">
        <div
          className="ff-bobble"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
          }}
        >
          <WalrusMascot pose="salute" size={170} />
        </div>
        <div
          className="flex flex-col gap-2"
          style={{
            padding: "16px 18px",
            border: "1.5px solid var(--echo-rail)",
            background: "var(--echo-paper-2)",
            borderRadius: 10,
          }}
        >
          <span
            className="font-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
            }}
          >
            transaction
          </span>
          <TxRow label="gas" value="≈ 0.0042 SUI" mono />
          <TxRow label="blob" value="walrus aggregator" />
          <TxRow
            label="signer"
            value={anonymous ? "ephemeral" : "your wallet"}
          />
          <TxRow
            label="fee"
            value={
              <span style={{ color: "var(--echo-success)" }}>sponsored ✓</span>
            }
          />
        </div>
      </aside>
    </section>
  );
}

function ReviewRow({
  idx,
  field,
  answer,
}: {
  idx: number;
  field: FormField;
  answer?: SubmissionAnswer;
}) {
  return (
    <div
      className="grid items-start gap-4 py-4"
      style={{
        gridTemplateColumns: "32px minmax(0, 1.05fr) minmax(0, 1fr)",
        borderBottom: "1px solid var(--echo-rail)",
      }}
    >
      <span
        className="font-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--echo-mut)",
          paddingTop: 2,
        }}
      >
        {String(idx).padStart(2, "0")}
      </span>
      <div
        style={{
          fontSize: 14,
          color: "var(--echo-ink)",
          lineHeight: 1.4,
        }}
      >
        {field.label}
      </div>
      <div
        style={{
          fontSize: 14,
          color: "var(--echo-mut)",
          lineHeight: 1.4,
        }}
      >
        {renderAnswer(field, answer)}
      </div>
    </div>
  );
}

function renderAnswer(field: FormField, a?: SubmissionAnswer) {
  if (!a) return <em style={{ color: "var(--echo-mut-2)" }}>skipped</em>;
  if (a.kind === "rating") {
    return (
      <span
        style={{
          fontFamily: "Inter, sans-serif",
          fontWeight: 600,
          fontSize: 18,
          letterSpacing: "-0.02em",
          color: "var(--echo-ink)",
        }}
      >
        {a.value}
        <span style={{ color: "var(--echo-mut-2)", fontSize: 14 }}>
          /
          {(field as RatingField).scale === 11
            ? 10
            : (field as RatingField).scale}
        </span>
      </span>
    );
  }
  if (a.kind === "choice") {
    if (field.type === "single_select" || field.type === "dropdown") {
      const opt = (field as ChoiceField).options.find(
        (o) => o.value === a.value,
      );
      return opt?.label ?? <em>—</em>;
    }
    const vals = Array.isArray(a.value) ? a.value : [a.value];
    return (
      <span className="inline-flex gap-1.5 flex-wrap">
        {vals.map((v) => {
          const opt = (field as ChoiceField).options.find((o) => o.value === v);
          return (
            <span
              key={v}
              style={{
                fontSize: 12,
                padding: "3px 8px",
                background: "var(--echo-rail-2)",
                border: "1px solid var(--echo-rail)",
                color: "var(--echo-ink)",
                borderRadius: 999,
              }}
            >
              {opt?.label ?? v}
            </span>
          );
        })}
        {vals.length === 0 && (
          <em style={{ color: "var(--echo-mut-2)" }}>skipped</em>
        )}
      </span>
    );
  }
  if (a.kind === "checkbox") {
    return a.value ? "Yes" : "No";
  }
  if (a.kind === "date") {
    return <span className="font-mono">{a.value}</span>;
  }
  if (a.kind === "blob") {
    return (
      <code
        className="font-mono"
        style={{ fontSize: 11, color: "var(--echo-mut)" }}
      >
        {a.blobId.slice(0, 14)}…
      </code>
    );
  }
  if (a.kind === "text") {
    return a.value.trim() ? (
      <span
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {a.value}
      </span>
    ) : (
      <em style={{ color: "var(--echo-mut-2)" }}>skipped</em>
    );
  }
  return null;
}

function TxRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className="font-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--echo-mut)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 12,
          color: "var(--echo-ink)",
          fontFamily: mono
            ? "var(--echo-mono, ui-monospace, SFMono-Regular, Menlo, monospace)"
            : "Inter, sans-serif",
        }}
      >
        {value}
      </span>
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
    <div
      className="fixed inset-0 z-40 overflow-y-auto antialiased"
      style={{
        background: "var(--echo-paper, #FFFFFF)",
        color: "var(--echo-ink, #0A0A0A)",
      }}
    >
      <SlimTopbar privacyTier={0} unlocked />
      <section
        className="mx-auto grid items-center gap-10 sm:gap-14 px-6 py-14"
        style={{
          maxWidth: 1100,
          gridTemplateColumns: "minmax(0, 0.95fr) minmax(0, 1.05fr)",
        }}
      >
        <div
          className="relative"
          style={{
            minHeight: 380,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 32,
              background: "var(--echo-aurora-plate)",
              opacity: 0.92,
              filter: "blur(2px)",
            }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 2,
              filter: "drop-shadow(0 18px 24px rgba(77,162,255,0.30))",
            }}
            className="ff-bobble"
          >
            <WalrusMascot pose="salute" size={300} priority />
          </div>
          <ConfettiBits />
        </div>
        <div className="flex flex-col gap-6">
          <p
            className="font-mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            <span style={{ color: "var(--echo-success)" }}>● submitted</span>
            <span style={{ margin: "0 10px", color: "var(--echo-mut-2)" }}>
              ·
            </span>
            <span style={{ color: "var(--echo-mut)" }}>
              on walrus · sui-anchored
            </span>
          </p>
          <h2
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              fontSize: "clamp(56px, 7vw, 96px)",
              letterSpacing: "-0.05em",
              lineHeight: 0.95,
              color: "var(--echo-ink)",
              margin: 0,
            }}
          >
            thanks
            <span
              style={{
                color: "var(--echo-sui-violet)",
                fontStyle: "italic",
                fontFamily: "Instrument Serif, Georgia, serif",
              }}
            >
              .
            </span>
          </h2>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.55,
              color: "var(--echo-mut)",
              maxWidth: 520,
              margin: 0,
            }}
          >
            Your answers are live. The form owner can decrypt and triage from{" "}
            <Link
              href="/dashboard"
              style={{
                color: "var(--echo-ink)",
                fontWeight: 500,
              }}
            >
              /dashboard
            </Link>
            . You&apos;ll feed the /insights board the moment they sync.
          </p>
          <div
            className="flex flex-col gap-2 mt-2"
            style={{
              padding: "16px 18px",
              border: "1.5px solid var(--echo-rail)",
              background: "var(--echo-paper-2)",
              borderRadius: 10,
              maxWidth: 480,
            }}
          >
            <ReceiptRow
              label="transaction"
              value={digest}
              link={`https://suiscan.xyz/mainnet/tx/${digest}`}
            />
            <ReceiptRow label="storage" value="walrus aggregator" />
            <ReceiptRow label="settled" value="sui object updated" />
          </div>
          <div className="flex items-center gap-3 flex-wrap mt-2">
            <Link
              href="/insights"
              style={{
                fontFamily:
                  "var(--echo-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                padding: "14px 22px",
                border: "2px solid var(--echo-ink)",
                background: "var(--echo-ink)",
                color: "var(--echo-paper)",
                boxShadow: "var(--echo-brut-shadow)",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                textDecoration: "none",
              }}
            >
              see live insights
              <span style={{ fontSize: "1.1em" }}>→</span>
            </Link>
            <button
              type="button"
              onClick={onSubmitAnother}
              className="font-mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                padding: "12px 16px",
                border: "1.5px solid var(--echo-rail)",
                background: "var(--echo-paper)",
                color: "var(--echo-ink)",
                cursor: "pointer",
              }}
            >
              submit another ↻
            </button>
          </div>
        </div>
      </section>
      <footer
        className="mx-auto flex items-center justify-center"
        style={{
          maxWidth: 1100,
          padding: "0 24px 32px",
          fontSize: 10,
        }}
      >
        <p
          className="font-mono"
          style={{
            color: "var(--echo-mut)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          powered by{" "}
          <Link
            href="/"
            style={{
              color: "var(--echo-ink)",
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            echo
          </Link>{" "}
          · forms on sui · walrus · seal
        </p>
      </footer>
    </div>
  );
}

function ReceiptRow({
  label,
  value,
  link,
}: {
  label: string;
  value: string;
  link?: string;
}) {
  const short =
    value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-6)}` : value;
  return (
    <div className="flex items-center justify-between gap-3">
      <span
        className="font-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--echo-mut)",
        }}
      >
        {label}
      </span>
      <span className="flex items-center gap-2">
        <code
          className="font-mono"
          style={{
            fontSize: 12,
            color: "var(--echo-ink)",
          }}
        >
          {short}
        </code>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
              textDecoration: "underline",
            }}
          >
            view ↗
          </a>
        )}
      </span>
    </div>
  );
}

function ConfettiBits() {
  // Pure CSS confetti drifts down behind the walrus. Keeps the success
  // moment celebratory without pulling in a confetti library — 16
  // particles is plenty for the effect, all pre-randomized via index.
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 1,
      }}
    >
      {Array.from({ length: 16 }).map((_, i) => {
        const colors = ["#4DA2FF", "#A06EE9", "#6CD3D6", "#E8FF75", "#F5B6E6"];
        const c = colors[i % colors.length];
        const left = (i * 7 + 8) % 100;
        const delay = (i % 8) * 0.18;
        const dur = 3.6 + (i % 4) * 0.4;
        const rot = (i * 33) % 360;
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              top: "-12px",
              left: `${left}%`,
              width: 8,
              height: 14,
              background: c,
              transform: `rotate(${rot}deg)`,
              animation: `ff-confetti ${dur}s linear ${delay}s infinite`,
            }}
          />
        );
      })}
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
        <MarkdownEditor
          variant="light"
          value={value?.kind === "text" ? value.value : ""}
          onChange={(next) => onChange({ kind: "text", value: next })}
        />
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
      // Design intent: the rating renderer reads 0..N as a horizontal
      // strip, not 1..N. Detect a 0-anchored scale (scale === 11 → 0..10)
      // by treating the rating value range as inclusive.
      const zeroAnchored = scale === 11;
      const opts = zeroAnchored
        ? Array.from({ length: scale }, (_, i) => i) // 0..10
        : Array.from({ length: scale }, (_, i) => i + 1); // 1..N
      const current = value?.kind === "rating" ? value.value : -1;
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {opts.map((n) => {
              const active = n === current;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    onChange({ kind: "rating", value: n });
                    setTimeout(onAdvance, 220);
                  }}
                  style={{
                    height: 56,
                    minWidth: 56,
                    flex: zeroAnchored ? "1 1 0" : "0 1 auto",
                    border: `1.5px solid ${
                      active ? "var(--echo-ink)" : "var(--echo-rail)"
                    }`,
                    background: active
                      ? "var(--echo-ink)"
                      : "var(--echo-paper)",
                    color: active ? "var(--echo-paper)" : "var(--echo-ink)",
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 500,
                    fontSize: 18,
                    letterSpacing: "-0.02em",
                    cursor: "pointer",
                    transition: "all 120ms ease",
                    borderRadius: 4,
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div
            className="flex items-center justify-between font-mono"
            style={{
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
            }}
          >
            <span>{zeroAnchored ? "never" : "low"}</span>
            <span>{zeroAnchored ? "already pitching" : "high"}</span>
          </div>
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
    case "signature":
      return (
        <SignaturePad
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
  type: "text" | "url" | "date" | "time" | "email";
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
      className="ff-input"
      style={{
        width: "100%",
        border: 0,
        borderBottom: "1.5px solid var(--echo-rail)",
        background: "transparent",
        padding: "10px 0 12px",
        fontSize: "clamp(20px, 2.4vw, 28px)",
        fontFamily: "Inter, sans-serif",
        fontWeight: 500,
        letterSpacing: "-0.02em",
        color: "var(--echo-ink)",
        outline: "none",
      }}
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
      rows={5}
      className="ff-input"
      style={{
        width: "100%",
        resize: "vertical",
        border: 0,
        borderBottom: "1.5px solid var(--echo-rail)",
        background: "transparent",
        padding: "10px 0 12px",
        fontSize: "clamp(17px, 2vw, 22px)",
        lineHeight: 1.45,
        fontFamily: "Inter, sans-serif",
        fontWeight: 400,
        color: "var(--echo-ink)",
        outline: "none",
      }}
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
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 18px",
              textAlign: "left",
              fontSize: 16,
              border: `1.5px solid ${
                isSelected ? "var(--echo-ink)" : "var(--echo-rail)"
              }`,
              background: isSelected
                ? "var(--echo-rail-2)"
                : "var(--echo-paper)",
              color: "var(--echo-ink)",
              borderRadius: 8,
              cursor: "pointer",
              transition: "all 120ms ease",
              boxShadow: isSelected ? "var(--echo-brut-shadow-sm)" : "none",
              transform: isSelected ? "translate(-1px, -1px)" : "none",
            }}
            onMouseEnter={(e) => {
              if (!isSelected)
                e.currentTarget.style.borderColor = "var(--echo-mut)";
            }}
            onMouseLeave={(e) => {
              if (!isSelected)
                e.currentTarget.style.borderColor = "var(--echo-rail)";
            }}
          >
            <span
              className="font-mono"
              style={{
                width: 28,
                height: 28,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                background: isSelected
                  ? "var(--echo-ink)"
                  : "var(--echo-rail-2)",
                color: isSelected ? "var(--echo-paper)" : "var(--echo-mut)",
                borderRadius: 4,
                flexShrink: 0,
              }}
            >
              {letter}
            </span>
            <span style={{ flex: 1 }}>{opt.label}</span>
            {isSelected && (
              <Check
                size={16}
                style={{ color: "var(--echo-ink)" }}
                strokeWidth={2.5}
              />
            )}
          </button>
        );
      })}
      {multi && (
        <p
          className="font-mono mt-1"
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--echo-mut-2)",
          }}
        >
          select all that apply · {selected.length} chosen
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
      <div
        className="flex items-center gap-3 p-4"
        style={{
          border: "1.5px solid var(--echo-ink)",
          background: "var(--echo-rail-2)",
          boxShadow: "var(--echo-brut-shadow-sm)",
          borderRadius: 8,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: "var(--echo-aurora-plate)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--echo-paper)",
            flexShrink: 0,
          }}
        >
          <Check size={16} strokeWidth={3} />
        </span>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <code
            className="font-mono"
            style={{
              fontSize: 12,
              color: "var(--echo-ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {value.blobId.slice(0, 18)}…
          </code>
          <span
            className="font-mono"
            style={{
              fontSize: 9,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
            }}
          >
            uploaded · {value.mimeType ?? "blob"} ·{" "}
            {value.bytes ? humanFileSize(value.bytes) : "—"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onChange({ kind: "blob", blobId: "", bytes: 0 })}
          className="font-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--echo-mut)",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          replace ↗
        </button>
      </div>
    );
  }

  return (
    <label
      className="flex cursor-pointer flex-col items-center gap-3 text-center transition"
      style={{
        padding: "32px 24px",
        border: "1.5px dashed var(--echo-rail)",
        background: "var(--echo-paper-2)",
        borderRadius: 8,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--echo-ink)";
        e.currentTarget.style.background = "var(--echo-rail-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--echo-rail)";
        e.currentTarget.style.background = "var(--echo-paper-2)";
      }}
    >
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <span
        style={{
          fontSize: 28,
          color: "var(--echo-mut)",
        }}
      >
        ＋
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: "var(--echo-ink)",
        }}
      >
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
      <span
        className="font-mono"
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "var(--echo-mut)",
        }}
      >
        {accept ? `accepts ${accept}` : "any file type"} · stored as walrus blob
      </span>
      {error && (
        <span className="font-mono" style={{ fontSize: 11, color: "#B91C1C" }}>
          {error}
        </span>
      )}
    </label>
  );
}

function humanFileSize(b: number) {
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b > 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}

// ───────────────────────── Chrome ─────────────────────────

function SignaturePad({
  value,
  onChange,
}: {
  value?: Extract<SubmissionAnswer, { kind: "blob" }>;
  onChange: (v: SubmissionAnswer) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Logical dimensions; the canvas is sized via CSS, the bitmap is
  // upscaled to devicePixelRatio for crisp strokes on hi-dpi screens.
  const W = 680;
  const H = 220;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#fafafa";
    ctx.lineWidth = 2.5;
  }, []);

  const localPos = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPosRef.current = localPos(e);
    setHasStrokes(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    const last = lastPosRef.current;
    const next = localPos(e);
    if (!ctx || !last) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    lastPosRef.current = next;
  };

  const onPointerUp = () => {
    drawingRef.current = false;
    lastPosRef.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
    if (value) onChange({ kind: "blob", blobId: "", bytes: 0 });
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError(null);
    setUploading(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("Could not export signature.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const out = await uploadBytesViaPublisher(bytes);
      onChange({
        kind: "blob",
        blobId: out.blobId,
        mimeType: "image/png",
        bytes: blob.size,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  if (value && value.blobId) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-zinc-800 bg-white p-2">
          {/* Render the stored signature back via the proxy so the
              browser sees image/png and the trust chain is consistent
              with rich-text image embeds. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${clientConfig.API_BASE_URL || ""}/api/walrus/blob/${value.blobId}`}
            alt="signature"
            className="block h-[180px] w-full object-contain"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <code className="rounded bg-zinc-900 px-2 py-0.5">
            {value.blobId.slice(0, 14)}…
          </code>
          <button
            type="button"
            onClick={clear}
            className="text-zinc-400 underline hover:text-zinc-200"
          >
            redraw
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
        className="h-[220px] w-full touch-none rounded-lg border border-zinc-800 bg-zinc-950"
        style={{ touchAction: "none" }}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={clear}
          disabled={!hasStrokes || uploading}
          className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-40"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!hasStrokes || uploading}
          className={cn(
            "rounded-full px-5 py-2 text-xs font-semibold shadow-lg transition",
            hasStrokes && !uploading
              ? "bg-blue-500 text-white shadow-blue-500/20 hover:bg-blue-400"
              : "cursor-not-allowed bg-zinc-800 text-zinc-500 shadow-none",
          )}
        >
          {uploading ? "Uploading…" : "Save signature"}
        </button>
        <span className="text-[11px] text-zinc-500">
          Sign with mouse or touch · uploads to Walrus on save
        </span>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}

function ProgressBar({
  current,
  total,
  stepKind,
  stepIdx,
}: {
  current: number;
  total: number;
  stepKind?: "intro" | "question" | "review";
  stepIdx?: number;
}) {
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  const label =
    stepKind === "intro"
      ? "intro"
      : stepKind === "review"
        ? "review"
        : stepIdx !== undefined
          ? `q ${stepIdx} of ${total}`
          : "";
  return (
    <div
      className="w-full"
      style={{
        background: "var(--echo-paper)",
        borderBottom: "1px solid var(--echo-rail)",
      }}
    >
      <div
        className="mx-auto flex items-center gap-4 px-6 py-2"
        style={{ maxWidth: 1200 }}
      >
        <span
          className="font-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--echo-mut)",
            minWidth: 64,
          }}
        >
          {label}
        </span>
        <div
          className="flex-1"
          style={{
            height: 3,
            background: "var(--echo-rail)",
            borderRadius: 999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "var(--echo-ink)",
              transition: "width 220ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </div>
        <span
          className="font-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--echo-mut)",
            minWidth: 40,
            textAlign: "right",
          }}
        >
          {Math.round(pct)}%
        </span>
      </div>
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
    <footer
      style={{
        background: "var(--echo-paper)",
        borderTop: "1px solid var(--echo-rail)",
      }}
    >
      <div
        className="mx-auto flex items-center justify-between gap-3 px-6 py-3"
        style={{ maxWidth: 1200 }}
      >
        <span
          className="font-mono inline-flex items-center gap-2"
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--echo-mut)",
          }}
        >
          <span>powered by</span>
          <Link
            href="/"
            style={{
              fontWeight: 600,
              color: "var(--echo-ink)",
              letterSpacing: "-0.02em",
            }}
          >
            echo
          </Link>
          <span style={{ color: "var(--echo-mut-2)", margin: "0 4px" }}>·</span>
          <span>walrus storage · sui object</span>
        </span>
        <div className="flex items-center gap-2">
          <ArrowButton
            disabled={!canGoBack}
            onClick={onBack}
            ariaLabel="Previous question"
          >
            <ArrowUp size={16} />
          </ArrowButton>
          <ArrowButton
            disabled={!canGoNext}
            onClick={onNext}
            ariaLabel="Next question"
            primary
          >
            <ArrowDown size={16} />
          </ArrowButton>
        </div>
      </div>
    </footer>
  );
}

function ArrowButton({
  children,
  disabled,
  onClick,
  ariaLabel,
  primary,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        width: 36,
        height: 36,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1.5px solid var(--echo-ink)",
        background: primary ? "var(--echo-ink)" : "var(--echo-paper)",
        color: primary ? "var(--echo-paper)" : "var(--echo-ink)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        borderRadius: 6,
        transition: "transform 120ms ease",
      }}
    >
      {children}
    </button>
  );
}

function KeyHint({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="font-mono"
      style={{
        padding: "1px 6px",
        fontSize: 10,
        border: "1px solid var(--echo-rail)",
        background: "var(--echo-rail-2)",
        color: "var(--echo-mut)",
        borderRadius: 4,
      }}
    >
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
