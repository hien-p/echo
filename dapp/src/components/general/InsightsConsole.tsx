"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { motion } from "motion/react";
import {
  ArrowDown,
  ArrowRight,
  Database,
  Lightbulb,
  Mic,
  Paperclip,
  Sparkles,
} from "lucide-react";
import { apiUrl, clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import { readJsonViaAggregator, type FormMetadata } from "@/lib/echo";
import { useDemoAdminMode } from "./DemoAdminToggle";

/**
 * Insights — Kraft-style chat surface.
 *
 * Layout mirrors the Kraft AI-SaaS template (/Users/harryphan/Downloads/saas):
 * left-aligned oversized headline, single wide pill input, action row
 * BELOW the input (paperclip / lightbulb / form-selector / suggest /
 * mic / circular send), soft purple radial-gradient backdrop, "Echo can
 * make mistakes" caveat, footer subhead + scroll indicator.
 *
 * RAG pipeline unchanged:
 *   - formsQuery → listOwnedObjects(FormOwnerCap) → getObjects + Walrus metadata
 *   - indexMutation → /api/insights/index_form (auto-fires once per session per id)
 *   - queryMutation → /api/insights/query (OpenRouter + Memwal middleware)
 *   - Answer rendered in a card below the chat surface
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
  "List the top three complaints by frequency.",
  "What features are people asking for?",
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
    <div className="relative -mx-4 sm:-mx-8 lg:-mx-12">
      {/* Soft radial gradient backdrop — light-purple wash like Kraft */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle_at_center,_rgba(124,58,237,0.18)_0%,_rgba(99,102,241,0.10)_30%,_transparent_65%)] dark:bg-[radial-gradient(circle_at_center,_rgba(139,92,246,0.30)_0%,_rgba(99,102,241,0.18)_30%,_transparent_65%)]" />
      </div>

      <section className="flex min-h-[calc(100vh-7rem)] flex-col px-6 pb-12 pt-12 sm:px-12 lg:px-20">
        {/* Headline — bold left-aligned, italic-serif accent like Kraft's
            "the future of creativity" */}
        <motion.h1
          initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="text-balance text-[clamp(2.5rem,7vw,6.5rem)] font-semibold leading-[1.05] tracking-tight text-foreground"
        >
          Ask Echo —
          <br />
          the <em className="font-serif italic text-foreground/60">
            future
          </em>{" "}
          of feedback
        </motion.h1>

        {/* Spacer pushes the input bar to roughly viewport center */}
        <div className="min-h-12 flex-1" />

        {/* === The chat bar === */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-[1080px]"
        >
          {/* Tall rounded input (single pill) */}
          <div className="rounded-3xl border border-border/60 bg-card/70 px-7 py-6 shadow-2xl shadow-foreground/[0.04] backdrop-blur-md">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  onAsk();
                }
              }}
              placeholder="Ask Echo anything…"
              rows={2}
              className="w-full resize-none border-0 bg-transparent text-xl text-foreground placeholder:text-muted-foreground/70 outline-none sm:text-2xl"
            />
          </div>

          {/* Action row BELOW the input — matches Kraft layout exactly */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <CircleButton ariaLabel="Attach (coming soon)" disabled>
              <Paperclip size={16} strokeWidth={1.75} />
            </CircleButton>
            <CircleButton ariaLabel="Think mode (coming soon)" disabled>
              <Lightbulb size={16} strokeWidth={1.75} />
            </CircleButton>

            {/* Form selector — Kraft's "Create Design" slot */}
            <FormSelectorChip
              forms={forms}
              selectedFormId={selectedFormId}
              setSelectedFormId={setSelectedFormId}
              demoMode={demoMode}
            />

            {/* Suggestions menu — Kraft's "Wireframe" slot */}
            <SuggestionChip onPick={setQuestion} />

            <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">⌘↵</kbd>
            </span>

            <CircleButton ariaLabel="Voice (coming soon)" disabled>
              <Mic size={15} strokeWidth={1.75} />
            </CircleButton>

            {/* Send — big black circle like Kraft */}
            <button
              type="button"
              onClick={onAsk}
              disabled={!canAsk}
              aria-label="Ask"
              className={cn(
                "inline-flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition",
                canAsk
                  ? "bg-foreground text-background shadow-foreground/20 hover:opacity-90"
                  : "cursor-not-allowed bg-muted text-muted-foreground shadow-none",
              )}
            >
              {queryMutation.isPending ? (
                <Sparkles size={18} className="animate-pulse" />
              ) : (
                <ArrowRight size={18} strokeWidth={2.25} />
              )}
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground/70">
            Echo can make mistakes — answers are synthesized from real
            submissions, but verify the source if it matters.
          </p>

          {selected && (
            <div className="mt-4 flex justify-center">
              <IndexStatus
                status={indexMutation}
                onReindex={() => indexMutation.mutate(selected.id)}
              />
            </div>
          )}
        </motion.div>

        {/* Bottom subhead + scroll affordance — Kraft footer copy slot */}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-6 pt-16">
          <p className="max-w-[28rem] text-xs leading-relaxed text-muted-foreground">
            Echo uses Memwal RAG over your form submissions. Pick a form, ask
            anything, get a synthesized answer with the underlying responses as
            context.
          </p>
          <ArrowDown
            size={28}
            strokeWidth={1.5}
            className="text-foreground/40"
            aria-hidden="true"
          />
        </div>
      </section>

      {/* Answer / error panel below the fold */}
      {(queryMutation.data?.answer || queryMutation.error instanceof Error) && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mx-4 mb-16 mt-4 rounded-3xl border border-border bg-card p-8 shadow-xl shadow-foreground/[0.04] sm:mx-8 sm:p-10 lg:mx-12"
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            <Sparkles size={12} /> Answer
          </div>
          {queryMutation.error instanceof Error ? (
            <p className="mt-4 text-sm text-destructive">
              {queryMutation.error.message}
            </p>
          ) : (
            <article className="mt-5 whitespace-pre-wrap text-base leading-relaxed text-foreground">
              {queryMutation.data?.answer}
            </article>
          )}
        </motion.section>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────────────────────

function CircleButton({
  children,
  ariaLabel,
  disabled,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground transition",
        disabled
          ? "cursor-default opacity-60"
          : "hover:border-foreground/40 hover:bg-muted",
      )}
    >
      {children}
    </button>
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
        "inline-flex h-10 items-center gap-2 rounded-full border bg-background pl-4 pr-3 text-sm transition focus-within:border-foreground/60",
        selectedFormId
          ? "border-foreground/40 text-foreground"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      <Database size={14} strokeWidth={1.75} />
      <select
        value={selectedFormId}
        onChange={(e) => setSelectedFormId(e.target.value)}
        className="cursor-pointer appearance-none bg-transparent pr-1 outline-none"
      >
        <option value="">Pick a form</option>
        {forms.map((f) => {
          const isPublic = f.privacyTier === 0;
          const isTimeLocked = f.privacyTier === 3;
          const indexable = isPublic || isTimeLocked || demoMode;
          return (
            <option key={f.id} value={f.id} disabled={!indexable}>
              {f.title}
              {!indexable ? " (encrypted)" : ""}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function SuggestionChip({ onPick }: { onPick: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm text-foreground transition hover:border-foreground/40 hover:bg-muted",
          open && "border-foreground/40 bg-muted",
        )}
      >
        <Sparkles size={14} strokeWidth={1.75} />
        Suggest
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-20 flex w-[min(380px,90vw)] flex-col rounded-2xl border border-border bg-card p-2 shadow-2xl shadow-foreground/10">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(s);
                setOpen(false);
              }}
              className="rounded-xl px-3 py-2 text-left text-sm text-foreground/80 transition hover:bg-muted hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
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
    <div className="relative -mx-4 sm:-mx-8 lg:-mx-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute left-1/2 top-1/2 h-[140%] w-[140%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(circle_at_center,_rgba(124,58,237,0.18)_0%,_rgba(99,102,241,0.10)_30%,_transparent_65%)] dark:bg-[radial-gradient(circle_at_center,_rgba(139,92,246,0.30)_0%,_rgba(99,102,241,0.18)_30%,_transparent_65%)]" />
      </div>
      <section className="flex min-h-[calc(100vh-7rem)] flex-col items-start justify-center px-6 py-12 sm:px-12 lg:px-20">
        <Sparkles
          size={28}
          strokeWidth={1.5}
          className="mb-6 text-muted-foreground"
        />
        <h1 className="text-[clamp(2.5rem,7vw,6.5rem)] font-semibold leading-[1.05] tracking-tight text-foreground">
          Ask Echo —
          <br />
          the <em className="font-serif italic text-foreground/60">
            future
          </em>{" "}
          of feedback
        </h1>
        <p className="mt-8 max-w-[36rem] text-base text-muted-foreground">
          Connect a wallet to query the forms you own. Or toggle Demo admin in
          the nav to browse the showcase forms without a wallet.
        </p>
      </section>
    </div>
  );
}
