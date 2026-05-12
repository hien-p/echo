"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { motion } from "motion/react";
import {
  ArrowUp,
  Database,
  Lightbulb,
  Paperclip,
  Sparkles,
} from "lucide-react";
import { apiUrl, clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import { readJsonViaAggregator, type FormMetadata } from "@/lib/echo";
import { useDemoAdminMode } from "./DemoAdminToggle";
import { DitherShader } from "@/components/marketing/DitherShader";

/**
 * Insights console — Kraft-style hero chat prompt bar instead of the
 * old vertical form. Big display headline, rounded chat input with
 * suggestion chips and a circular send button, results render below
 * the input as a streaming-style answer card.
 *
 * RAG pipeline is unchanged from the previous flat-form version:
 *   1. Pick a form  →  auto-index its submissions into a Memwal namespace
 *      (once per session per id)
 *   2. Type a question  →  /api/insights/query routes through OpenRouter
 *      with the namespace memories injected as context
 *   3. Render the model's answer in a card below the prompt
 */

interface OnChainForm {
  metadata_blob_id: string;
  privacy_tier: number;
}

interface OwnedCap {
  objectId: string;
  json: { form_id: string };
}

interface FormChoice {
  id: string;
  title: string;
  privacyTier: number;
}

const SUGGESTIONS = [
  "What did people say worked well?",
  "Where did Echo feel rough or confusing?",
  "Would respondents use Echo for a real form?",
  "Summarize the most common feedback themes.",
];

export const InsightsConsole = () => {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;
  const demoMode = useDemoAdminMode();
  const demoAddress = clientConfig.DEMO_ADMIN_ADDRESS;
  const ownerAddress = demoMode ? demoAddress : account?.address;

  const [selectedFormId, setSelectedFormId] = useState("");
  const [question, setQuestion] = useState("");
  const autoIndexed = useRef<Set<string>>(new Set());

  const formsQuery = useQuery({
    queryKey: ["echo", "insights", "forms", ownerAddress, demoMode],
    queryFn: async (): Promise<FormChoice[]> => {
      if (!ownerAddress) return [];
      const owned = await suiClient.listOwnedObjects({
        owner: ownerAddress,
        type: `${packageId}::form::FormOwnerCap`,
        include: { json: true },
        limit: 100,
      });
      const caps = owned.objects as unknown as OwnedCap[];
      const ids = caps
        .map((c) => c.json?.form_id)
        .filter((x): x is string => !!x);
      if (ids.length === 0) return [];
      const formObjs = await suiClient.getObjects({
        objectIds: ids,
        include: { json: true },
      });
      const network = clientConfig.WALRUS_NETWORK;
      return Promise.all(
        formObjs.objects.map(async (obj) => {
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
          return {
            id: fobj.objectId,
            title,
            privacyTier: fobj.json.privacy_tier,
          };
        }),
      );
    },
    enabled: !!ownerAddress && packageId.startsWith("0x"),
  });

  const indexMutation = useMutation({
    mutationFn: async (formId: string) => {
      const resp = await fetch(apiUrl("/api/insights/index_form"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ formId }),
      });
      const data = (await resp.json()) as {
        indexed?: number;
        skipped?: number;
        deduped?: number;
        namespace?: string;
        errors?: string[];
        error?: string;
      };
      if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
      return data;
    },
  });

  useEffect(() => {
    if (!selectedFormId) return;
    if (autoIndexed.current.has(selectedFormId)) return;
    autoIndexed.current.add(selectedFormId);
    indexMutation.mutate(selectedFormId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFormId]);

  const queryMutation = useMutation({
    mutationFn: async ({
      formId,
      question,
    }: {
      formId: string;
      question: string;
    }) => {
      const resp = await fetch(apiUrl("/api/insights/query"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ formId, question }),
      });
      const data = (await resp.json()) as {
        answer?: string;
        namespace?: string;
        error?: string;
      };
      if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
      return data;
    },
  });

  const forms = formsQuery.data ?? [];
  const selected = forms.find((f) => f.id === selectedFormId);
  const canAsk =
    !!selectedFormId && !!question.trim() && !queryMutation.isPending;

  const onAsk = () => {
    if (!canAsk) return;
    queryMutation.mutate({ formId: selectedFormId, question });
  };

  if (!ownerAddress) {
    return <ConnectGate />;
  }

  return (
    <div className="relative flex flex-col gap-10">
      {/* === Hero panel — Kraft chat-prompt-bar pattern === */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-3xl border border-border bg-card"
      >
        {/* Dither shader backdrop — adds the Kraft "ambient blob" feel
            without committing to a heavy shader. Sits behind everything. */}
        <div className="pointer-events-none absolute inset-0 opacity-40 dark:opacity-60">
          <DitherShader variant="cta" />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/30 via-background/60 to-background" />

        <div className="relative z-10 flex flex-col items-center gap-8 px-6 py-16 sm:px-12 sm:py-20 lg:py-24">
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Memwal RAG · powered by OpenRouter
            </span>
            <h2 className="text-balance text-[clamp(2rem,5vw,4rem)] font-medium leading-[1.05] tracking-tight text-foreground">
              Ask your forms —{" "}
              <em className="font-serif text-foreground/70">they remember.</em>
            </h2>
            <p className="max-w-[42rem] text-sm leading-relaxed text-muted-foreground sm:text-base">
              Echo indexes every submission into a private namespace and lets
              you query it in plain English. Pick a form, ask anything, get a
              synthesized answer with the underlying submissions as context.
            </p>
          </div>

          {/* Chat-prompt card */}
          <div className="w-full max-w-[768px]">
            <ChatPrompt
              question={question}
              setQuestion={setQuestion}
              onAsk={onAsk}
              canAsk={canAsk}
              pending={queryMutation.isPending}
              selectedFormId={selectedFormId}
              setSelectedFormId={setSelectedFormId}
              forms={forms}
              demoMode={demoMode}
            />

            {/* Suggestion chips below the input */}
            <div className="mt-4 flex flex-wrap items-center gap-2 px-1">
              <span className="text-[11px] text-muted-foreground">try:</span>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setQuestion(s)}
                  className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-foreground/40 hover:text-foreground hover:bg-background"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Status line — index progress + namespace */}
          {selected && (
            <IndexStatus
              status={indexMutation}
              onReindex={() => indexMutation.mutate(selected.id)}
            />
          )}
        </div>
      </motion.section>

      {/* === Answer / error panel === */}
      {(queryMutation.data?.answer || queryMutation.error instanceof Error) && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-border bg-card p-6 sm:p-8"
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Sparkles size={12} /> Answer
          </div>
          {queryMutation.error instanceof Error ? (
            <p className="mt-3 text-sm text-destructive">
              {queryMutation.error.message}
            </p>
          ) : (
            <article className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-foreground">
              {queryMutation.data?.answer}
            </article>
          )}
        </motion.section>
      )}

      {/* === Empty state when no form picked yet === */}
      {!selected && !queryMutation.data?.answer && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer underline-offset-4 hover:underline">
            How Memwal RAG works
          </summary>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 leading-relaxed">
            <li>
              <strong>Pick a form</strong> · we auto-index its submissions into
              a per-form Memwal namespace by reading <code>SubmissionMade</code>{" "}
              events, downloading the public Walrus payload for each, flattening
              answers to text, and calling <code>memwal.remember()</code>.
            </li>
            <li>
              <strong>Ask</strong> · queries route through{" "}
              <code>/api/insights/query</code> which wraps OpenRouter with{" "}
              <code>withMemWal</code> middleware — relevant memories get
              auto-injected as context.
            </li>
            <li>
              Encrypted tiers (Admin-only / Threshold / Conditional) can&apos;t
              be server-indexed because the server doesn&apos;t hold session-key
              delegation. Time-locked forms become indexable after the unlock
              timestamp passes. Demo-admin mode lets the server index encrypted
              forms using a designated demo key for showcase purposes only.
            </li>
          </ul>
        </details>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
//  Chat prompt — large rounded textarea with form selector + send button
// ─────────────────────────────────────────────────────────────────────────

function ChatPrompt({
  question,
  setQuestion,
  onAsk,
  canAsk,
  pending,
  selectedFormId,
  setSelectedFormId,
  forms,
  demoMode,
}: {
  question: string;
  setQuestion: (q: string) => void;
  onAsk: () => void;
  canAsk: boolean;
  pending: boolean;
  selectedFormId: string;
  setSelectedFormId: (id: string) => void;
  forms: FormChoice[];
  demoMode: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-border bg-background/90 p-3 shadow-xl shadow-foreground/5 backdrop-blur-md sm:p-4">
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onAsk();
          }
        }}
        placeholder="Ask your form anything — e.g. what worked? what was rough? top three complaints this week?"
        rows={2}
        className="w-full resize-none border-0 bg-transparent px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/60 outline-none sm:text-lg"
      />

      <div className="flex flex-wrap items-center gap-2 px-1">
        {/* Form selector chip — replaces the "Create Design" chip in Kraft */}
        <FormSelectorChip
          forms={forms}
          selectedFormId={selectedFormId}
          setSelectedFormId={setSelectedFormId}
          demoMode={demoMode}
        />

        {/* Inert decorative chips matching Kraft layout */}
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs text-muted-foreground">
          <Paperclip size={12} />
          Attach
        </span>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs text-muted-foreground">
          <Lightbulb size={12} />
          Think mode
        </span>

        <span className="ml-auto text-[10px] text-muted-foreground">
          <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">⌘ ↵</kbd>
        </span>

        {/* Send button — circular black, classic Kraft */}
        <button
          type="button"
          onClick={onAsk}
          disabled={!canAsk}
          aria-label="Ask"
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-full transition",
            canAsk
              ? "bg-foreground text-background hover:opacity-90"
              : "cursor-not-allowed bg-muted text-muted-foreground",
          )}
        >
          {pending ? (
            <Sparkles size={16} className="animate-pulse" />
          ) : (
            <ArrowUp size={16} strokeWidth={2.5} />
          )}
        </button>
      </div>
    </div>
  );
}

function FormSelectorChip({
  forms,
  selectedFormId,
  setSelectedFormId,
  demoMode,
}: {
  forms: FormChoice[];
  selectedFormId: string;
  setSelectedFormId: (id: string) => void;
  demoMode: boolean;
}) {
  return (
    <label
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border bg-background px-3 text-xs transition focus-within:border-foreground/60",
        selectedFormId
          ? "border-foreground/40 text-foreground"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      <Database size={12} />
      <select
        value={selectedFormId}
        onChange={(e) => setSelectedFormId(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent outline-none"
      >
        <option value="">Pick a form</option>
        {forms.map((f) => {
          const isPublic = f.privacyTier === 0;
          const isTimeLocked = f.privacyTier === 3;
          const indexableServerSide = isPublic || isTimeLocked || demoMode;
          return (
            <option key={f.id} value={f.id} disabled={!indexableServerSide}>
              {f.title}
              {!indexableServerSide ? " (encrypted)" : ""}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function IndexStatus({
  status,
  onReindex,
}: {
  status: ReturnType<typeof useMutation<unknown, Error, string>>;
  onReindex: () => void;
}) {
  if (status.isPending) {
    return (
      <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <Database size={12} className="animate-pulse" />
        Indexing submissions into Memwal…
      </p>
    );
  }
  if (status.error instanceof Error) {
    return (
      <p className="text-xs text-destructive">
        Index error: {status.error.message}
      </p>
    );
  }
  const data = status.data as
    | { indexed?: number; deduped?: number; namespace?: string }
    | undefined;
  if (!data) return null;
  return (
    <p className="inline-flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Database size={12} className="text-emerald-500" />
      Ready · {data.indexed ?? 0} submission
      {data.indexed === 1 ? "" : "s"} indexed
      {data.deduped ? ` · ${data.deduped} deduped` : ""}
      <button
        type="button"
        onClick={onReindex}
        className="underline-offset-4 hover:underline"
      >
        re-index
      </button>
    </p>
  );
}

function ConnectGate() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-12 text-center">
      <div className="pointer-events-none absolute inset-0 opacity-30 dark:opacity-50">
        <DitherShader variant="cta" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/50 via-background/70 to-background" />
      <div className="relative z-10 flex flex-col items-center gap-3">
        <Sparkles
          size={28}
          strokeWidth={1.5}
          className="text-muted-foreground"
        />
        <h2 className="text-2xl font-medium tracking-tight text-foreground">
          Connect a wallet to ask your forms
        </h2>
        <p className="max-w-[28rem] text-sm text-muted-foreground">
          Insights queries the forms you hold a FormOwnerCap for. Toggle Demo
          admin in the nav to browse the showcase forms without a wallet.
        </p>
      </div>
    </div>
  );
}
