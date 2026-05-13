"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { motion } from "motion/react";
import {
  ArrowDown,
  ArrowRight,
  Clock,
  Compass,
  Database,
  Heart,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { apiUrl, clientConfig } from "@/config/clientConfig";
import { cn } from "@/lib/utils";
import { readJsonViaAggregator, type FormMetadata } from "@/lib/echo";
import { useDemoAdminMode } from "./DemoAdminToggle";
import {
  InsightAnswer,
  type InsightAnswerData,
  type Recommendation,
} from "./InsightAnswer";
import { InsightsGoals } from "./InsightsGoals";
import {
  IndexingProgressStrip,
  type IndexingProgressState,
  type IndexingStage,
} from "./IndexingProgress";
import {
  PinnedRow,
  readPinned,
  writePinned,
  removePinned,
  type PinnedInsight,
} from "./PinnedInsights";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "./Reasoning";

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

// Snapshot prompts fired in parallel when a form has been indexed. Each
// becomes a small card below the input — users see insights without
// typing a question. Click → expand into the main answer panel.
const SNAPSHOT_PROMPTS = [
  {
    id: "themes",
    label: "Top themes",
    icon: Compass,
    question:
      "What are the top themes across these submissions? Surface 3-5 with counts.",
  },
  {
    id: "sentiment",
    label: "Sentiment",
    icon: Heart,
    question:
      "What is the overall sentiment breakdown across submissions? Positive vs neutral vs negative — give rough percentages and the dominant emotional tone.",
  },
  {
    id: "requests",
    label: "Top requests",
    icon: Target,
    question:
      "What features, fixes, or changes are submitters explicitly asking for? Rank the top 3 by frequency.",
  },
] as const;

export const InsightsConsole = ({
  initialQuestion,
}: {
  initialQuestion?: string;
}) => {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;
  const demoMode = useDemoAdminMode();
  const demoAddress = clientConfig.DEMO_ADMIN_ADDRESS;
  const ownerAddress = demoMode ? demoAddress : account?.address;

  const [selectedFormId, setSelectedFormId] = useState("");
  const [question, setQuestion] = useState("");
  const [lastAskedQuestion, setLastAskedQuestion] = useState("");
  const [scope, setScope] = useState<"all" | "7d" | "30d">("all");
  // Compare mode — toggling adds a second form picker; on ask the
  // question runs against both forms in parallel and the answers land
  // as paired thread entries (linked by a shared pairId).
  const [compareMode, setCompareMode] = useState(false);
  const [compareFormId, setCompareFormId] = useState("");
  const autoIndexed = useRef<Set<string>>(new Set());
  // SSE indexing progress — null when not streaming, populated by the
  // streaming endpoint's onChunk handler. The IndexStatus widget picks
  // between the multi-stage strip and the fallback line based on this.
  const [indexProgress, setIndexProgress] =
    useState<IndexingProgressState | null>(null);
  // When the user clicks an auto-snapshot card we render its answer in
  // the main InsightAnswer slot. Cleared when they ask a fresh question.
  const [expandedSnapshot, setExpandedSnapshot] =
    useState<InsightAnswerData | null>(null);
  // Pinned insights — list rebuilt from localStorage on each pin/unpin.
  const [pinnedInsights, setPinnedInsights] = useState<PinnedInsight[]>([]);
  useEffect(() => {
    setPinnedInsights(readPinned(ownerAddress));
  }, [ownerAddress]);

  // Conversation thread — every successful query lands here so the user
  // can scroll back through prior Q&As instead of having each new ask
  // wipe the previous answer.
  interface ThreadEntry {
    id: string;
    question: string;
    data: InsightAnswerData;
    /** Two thread entries with the same pairId are renderered side-by-
     *  side. Set when compare mode fires parallel queries. */
    pairId?: string;
  }
  const [thread, setThread] = useState<ThreadEntry[]>([]);
  // Live answer streamed from /api/insights/query while a queryMutation
  // is in flight. Cleared on success (the thread takes over) or on a
  // fresh ask. Rendered as a transient InsightAnswer below the thread.
  const [streamingPartial, setStreamingPartial] =
    useState<InsightAnswerData | null>(null);
  // Reasoning log — narration of the synthesis pipeline derived from
  // streamingPartial deltas. Not the model's literal chain-of-thought
  // (streamObject doesn't expose one) — labelled "working notes" in the
  // UI so we don't misrepresent. Resets on each new ask.
  const [reasoningLog, setReasoningLog] = useState("");
  const reasoningSnapshot = useRef<{
    answerLen: number;
    themeLabels: Set<string>;
    citationIds: Set<string>;
    personaNames: Set<string>;
    confidence?: string;
    headlineSet: boolean;
    gapsCount: number;
  }>({
    answerLen: 0,
    themeLabels: new Set(),
    citationIds: new Set(),
    personaNames: new Set(),
    headlineSet: false,
    gapsCount: 0,
  });

  // Derive delta narration from each streamingPartial update so the
  // Reasoning panel grows line-by-line as fields commit. Bounded so we
  // don't render an unbounded log on long answers.
  useEffect(() => {
    if (!streamingPartial) return;
    const snap = reasoningSnapshot.current;
    const lines: string[] = [];
    const s = streamingPartial.structured;

    const answerLen = (streamingPartial.answer ?? "").length;
    if (answerLen > 0 && snap.answerLen === 0) {
      lines.push("→ Drafting prose answer…");
    }
    snap.answerLen = answerLen;

    if (s?.confidence && s.confidence !== snap.confidence) {
      lines.push(`→ Confidence: ${s.confidence}`);
      snap.confidence = s.confidence;
    }
    if (s?.headlineQuote?.text && !snap.headlineSet) {
      const txt = s.headlineQuote.text.slice(0, 80);
      lines.push(
        `→ Pull-quote surfaced: "${txt}${txt.length === 80 ? "…" : ""}"`,
      );
      snap.headlineSet = true;
    }
    for (const t of s?.themes ?? []) {
      if (t.label && !snap.themeLabels.has(t.label)) {
        snap.themeLabels.add(t.label);
        lines.push(`→ Theme: ${t.label} (${t.count}, ${t.sentiment})`);
      }
    }
    for (const c of s?.citations ?? []) {
      if (c.submissionId && !snap.citationIds.has(c.submissionId)) {
        snap.citationIds.add(c.submissionId);
        lines.push(`→ Cited ${c.submissionId}`);
      }
    }
    for (const p of s?.personas ?? []) {
      if (p.name && !snap.personaNames.has(p.name)) {
        snap.personaNames.add(p.name);
        lines.push(`→ Persona: ${p.name} (${p.count})`);
      }
    }
    const gapsCount = s?.gaps?.length ?? 0;
    if (gapsCount > snap.gapsCount) {
      const next = s?.gaps?.[gapsCount - 1];
      if (next) lines.push(`→ Gap noted: ${next}`);
      snap.gapsCount = gapsCount;
    }

    if (lines.length === 0) return;
    setReasoningLog((prev) => {
      const combined = prev ? prev + "\n" + lines.join("\n") : lines.join("\n");
      // Cap to last ~40 lines so very long answers don't grow unbounded.
      const arr = combined.split("\n");
      return arr.slice(-40).join("\n");
    });
  }, [streamingPartial]);

  useEffect(() => {
    const q = initialQuestion?.trim();
    if (!q) return;
    setQuestion((current) => current || q);
  }, [initialQuestion]);

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
      // Reset progress visualizer on each run so re-index doesn't show
      // stale state. The SSE consumer below repopulates it event-by-event.
      setIndexProgress({
        stage: "query_events",
        current: 0,
        total: 0,
        message: "Connecting to chain…",
      });

      const resp = await fetch(apiUrl("/api/insights/index_form"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ formId, stream: true }),
      });

      const contentType = resp.headers.get("content-type") ?? "";

      // Server didn't honour the stream flag (older deploy, error, etc.):
      // fall back to the plain JSON path so callers still get a result.
      if (!contentType.includes("text/event-stream")) {
        const data = (await resp.json().catch(() => ({}))) as {
          indexed?: number;
          skipped?: number;
          deduped?: number;
          events?: number;
          namespace?: string;
          errors?: string[];
          error?: string;
        };
        if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
        return data;
      }

      if (!resp.body) throw new Error("Stream response had no body.");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalSummary: {
        indexed?: number;
        deduped?: number;
        skipped?: number;
        events?: number;
        namespace?: string;
        errors?: string[];
      } | null = null;
      const running = { indexed: 0, deduped: 0, skipped: 0 };

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const ev of events) {
            const trimmed = ev.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.replace(/^data:\s*/, "");
            let json: {
              event?: string;
              stage?: IndexingStage;
              current?: number;
              total?: number;
              message?: string;
              indexed?: number;
              deduped?: number;
              skipped?: number;
              events?: number;
              namespace?: string;
              errors?: string[];
            };
            try {
              json = JSON.parse(payload);
            } catch {
              continue;
            }
            if (json.event === "progress") {
              setIndexProgress({
                stage: json.stage ?? "fetch_walrus",
                current: json.current ?? 0,
                total: json.total ?? 0,
                message: json.message,
                indexed: running.indexed,
                deduped: running.deduped,
                skipped: running.skipped,
              });
            } else if (json.event === "done") {
              running.indexed = json.indexed ?? 0;
              running.deduped = json.deduped ?? 0;
              running.skipped = json.skipped ?? 0;
              finalSummary = json;
              setIndexProgress({
                stage: "done",
                current: json.events ?? running.indexed,
                total: json.events ?? running.indexed,
                message: `Done · ${running.indexed} indexed${
                  running.deduped ? ` · ${running.deduped} deduped` : ""
                }`,
                ...running,
              });
            }
          }
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* already released */
        }
      }

      if (!finalSummary) {
        throw new Error("Indexer stream ended without a summary event.");
      }
      return finalSummary;
    },
    onSettled: () => {
      // Let the user catch the final state before the strip vanishes.
      window.setTimeout(() => setIndexProgress(null), 2500);
    },
  });

  useEffect(() => {
    if (!selectedFormId || selectedFormId === "all") return;
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
      // "all" maps to cross-form mode — server expects formIds array.
      const isCrossForm = formId === "all";
      // Request streaming so prose populates token-by-token. Server
      // emits SSE partials + a final `done` event; non-stream JSON
      // remains the fallback for older deploys or stream errors.
      const reqBody = isCrossForm
        ? {
            formIds: (formsQuery.data ?? []).map((f) => f.id),
            question,
            scope,
            stream: true,
          }
        : { formId, question, scope, stream: true };

      setStreamingPartial(null);
      // Reset the reasoning narration on each fresh ask so the panel
      // doesn't carry over snippets from a prior question.
      setReasoningLog("");
      reasoningSnapshot.current = {
        answerLen: 0,
        themeLabels: new Set(),
        citationIds: new Set(),
        personaNames: new Set(),
        headlineSet: false,
        gapsCount: 0,
      };

      const resp = await fetch(apiUrl("/api/insights/query"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      const ct = resp.headers.get("content-type") ?? "";

      // Non-SSE response: parse JSON exactly like before. Covers both
      // the unsupported-stream fallback path and the empty-state /
      // error responses which intentionally bypass streaming.
      if (!ct.includes("text/event-stream")) {
        const data = (await resp.json()) as Omit<
          InsightAnswerData,
          "formId"
        > & { error?: string };
        if (!resp.ok && !data.recommendation) {
          throw new Error(data.error ?? `HTTP ${resp.status}`);
        }
        return data;
      }

      if (!resp.body) throw new Error("Stream response had no body.");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalData:
        | (Omit<InsightAnswerData, "formId"> & { error?: string })
        | null = null;

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const ev of events) {
            const trimmed = ev.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.replace(/^data:\s*/, "");
            let json: {
              event?: string;
              object?: Partial<InsightAnswerData["structured"]> & {
                answer?: string;
              };
              answer?: string;
              structured?: InsightAnswerData["structured"];
              memories?: InsightAnswerData["memories"];
              formTitle?: string | null;
              namespace?: string;
              memoriesUsed?: number;
              memoriesSource?: "memwal" | "direct-decrypt";
              modelUsed?: string;
              recommendation?: Recommendation;
              tokens?: unknown;
              message?: string;
            };
            try {
              json = JSON.parse(payload);
            } catch {
              continue;
            }
            if (json.event === "partial" && json.object) {
              setStreamingPartial({
                formId,
                question,
                answer: json.object.answer,
                structured: {
                  themes: json.object.themes ?? [],
                  citations: json.object.citations ?? [],
                  confidence: json.object.confidence,
                  gaps: json.object.gaps,
                  outlier: json.object.outlier,
                  personas: json.object.personas,
                  headlineQuote: json.object.headlineQuote,
                  submissionTags: json.object.submissionTags,
                },
                memoriesUsed: 1, // > 0 so InsightAnswer renders structured variant
              });
            } else if (json.event === "done") {
              finalData = {
                answer: json.answer,
                structured: json.structured,
                memories: json.memories,
                formTitle: json.formTitle,
                namespace: json.namespace,
                memoriesUsed: json.memoriesUsed,
                memoriesSource: json.memoriesSource,
                modelUsed: json.modelUsed,
                recommendation: json.recommendation,
              };
            } else if (json.event === "error") {
              throw new Error(json.message ?? "Stream emitted error event");
            }
          }
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* */
        }
      }

      if (!finalData) throw new Error("Stream ended without `done` event.");
      return finalData;
    },
    onSuccess: (data, variables) => {
      const entryData: InsightAnswerData = {
        ...data,
        formId: variables.formId,
        question: variables.question,
      };
      // Streaming partial handed off — thread takes over.
      setStreamingPartial(null);
      // Append to the visible conversation thread.
      setThread((t) => [
        ...t,
        {
          id: `${variables.formId}-${Date.now()}`,
          question: variables.question,
          data: entryData,
        },
      ]);
      // Persist to history so HistoryChip can list it on next open.
      // Skip empty-state responses (memoriesUsed === 0) — they're not
      // research findings, just diagnostic stubs.
      if (!ownerAddress) return;
      if ((data.memoriesUsed ?? 0) === 0) return;
      writeHistory(ownerAddress, {
        formId: variables.formId,
        formTitle: data.formTitle ?? `${variables.formId.slice(0, 10)}…`,
        question: variables.question,
        timestamp: Date.now(),
      });
    },
    onError: () => {
      setStreamingPartial(null);
    },
  });

  // Counter-argument: fires the same query route but with the question
  // prefixed to push the model toward the dissenting view. Rendered as a
  // separate amber-tinted InsightAnswer card below the main one. Resets
  // when the user asks a new primary question.
  const counterMutation = useMutation({
    mutationFn: async ({
      formId,
      question,
    }: {
      formId: string;
      question: string;
    }) => {
      const prefixed = `Find the counter-argument or dissenting view to the following question, citing submissions that push back on the consensus: ${question}`;
      const isCrossForm = formId === "all";
      const reqBody = isCrossForm
        ? {
            formIds: (formsQuery.data ?? []).map((f) => f.id),
            question: prefixed,
            scope,
          }
        : { formId, question: prefixed, scope };
      const resp = await fetch(apiUrl("/api/insights/query"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      const data = (await resp.json()) as Omit<InsightAnswerData, "formId"> & {
        error?: string;
      };
      if (!resp.ok && !data.recommendation) {
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }
      return data;
    },
    onSuccess: (data, variables) => {
      // Append the counter result as a new thread entry tagged as
      // a "counter" variant — InsightAnswer renders it amber-styled.
      setThread((t) => [
        ...t,
        {
          id: `${variables.formId}-counter-${Date.now()}`,
          question: `Opposing view: ${variables.question}`,
          data: {
            ...data,
            formId: variables.formId,
            question: variables.question,
            variant: "counter" as const,
          },
        },
      ]);
    },
  });

  // Form-aware question suggestions. Fires once indexing for the form has
  // completed (or attempted) so the suggest route can read a memory
  // sample. Falls back silently to hardcoded SUGGESTIONS on empty/error.
  const suggestQuery = useQuery({
    queryKey: ["echo", "insights", "suggest", selectedFormId],
    queryFn: async (): Promise<{ suggestions: string[]; source: string }> => {
      const resp = await fetch(apiUrl("/api/insights/suggest"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ formId: selectedFormId }),
      });
      if (!resp.ok) return { suggestions: [], source: "http_error" };
      return resp.json();
    },
    enabled:
      !!selectedFormId && selectedFormId !== "all" && !indexMutation.isPending,
    staleTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  // Auto-snapshot queries — fire in parallel once a form has been indexed
  // so users see insights without typing. Each becomes a SnapshotCard.
  // Cached aggressively per formId; same form re-selected = instant load.
  const indexedCount =
    (indexMutation.data as { indexed?: number } | undefined)?.indexed ?? 0;
  const snapshotsEnabled =
    !!selectedFormId &&
    selectedFormId !== "all" &&
    !!indexMutation.data &&
    indexedCount > 0 &&
    !queryMutation.data;

  const snapshots = useQueries({
    queries: SNAPSHOT_PROMPTS.map((p) => ({
      queryKey: ["echo", "insights", "snapshot", selectedFormId, p.id],
      queryFn: async (): Promise<InsightAnswerData> => {
        const resp = await fetch(apiUrl("/api/insights/query"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            formId: selectedFormId,
            question: p.question,
          }),
        });
        const data = (await resp.json()) as Omit<
          InsightAnswerData,
          "formId"
        > & {
          error?: string;
        };
        if (!resp.ok && !data.recommendation) {
          throw new Error(data.error ?? `HTTP ${resp.status}`);
        }
        return { ...data, formId: selectedFormId, question: p.question };
      },
      enabled: snapshotsEnabled,
      staleTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
    })),
  });

  const forms = formsQuery.data ?? [];
  const selected = forms.find((f) => f.id === selectedFormId);
  const canAsk =
    !!selectedFormId && !!question.trim() && !queryMutation.isPending;

  const onCounterArgument = () => {
    if (!selectedFormId || !lastAskedQuestion) return;
    counterMutation.mutate({
      formId: selectedFormId,
      question: lastAskedQuestion,
    });
  };

  const onPinCurrent = () => {
    if (!ownerAddress) return;
    // Pin the answer the user is currently viewing. `expandedSnapshot`
    // already carries formId; queryMutation.data doesn't, so we fill in
    // from local state. Mirrors the render priority below.
    const formId = expandedSnapshot?.formId ?? selectedFormId;
    const source: InsightAnswerData | null = expandedSnapshot
      ? expandedSnapshot
      : queryMutation.data
        ? { ...queryMutation.data, formId, question: lastAskedQuestion }
        : null;
    if (!source) return;
    const next = writePinned(ownerAddress, {
      formId,
      formTitle: source.formTitle ?? null,
      question: source.question ?? lastAskedQuestion,
      answerExcerpt: (source.answer ?? "").slice(0, 200),
      topThemes:
        source.structured?.themes?.slice(0, 3).map((t) => t.label) ?? [],
      timestamp: Date.now(),
      data: source,
    });
    setPinnedInsights(next);
  };

  const onRemovePin = (formId: string, q: string) => {
    if (!ownerAddress) return;
    setPinnedInsights(removePinned(ownerAddress, formId, q));
  };

  const currentlyPinned = (() => {
    const formId = expandedSnapshot?.formId ?? selectedFormId;
    const q = expandedSnapshot?.question ?? lastAskedQuestion;
    if (!queryMutation.data && !expandedSnapshot) return false;
    return pinnedInsights.some((p) => p.formId === formId && p.question === q);
  })();

  // Plain non-stream query used by compare mode. Both forms fire in
  // parallel; appending both as paired thread entries afterwards avoids
  // the streamingPartial state from clobbering between concurrent
  // streams. Compare therefore trades token streaming for parallelism —
  // acceptable since the win is seeing both answers at once.
  const runComparisonQuery = async (
    formId: string,
    q: string,
  ): Promise<InsightAnswerData> => {
    const isCrossForm = formId === "all";
    const reqBody = isCrossForm
      ? {
          formIds: (formsQuery.data ?? []).map((f) => f.id),
          question: q,
          scope,
        }
      : { formId, question: q, scope };
    const resp = await fetch(apiUrl("/api/insights/query"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reqBody),
    });
    const data = (await resp.json()) as Omit<InsightAnswerData, "formId"> & {
      error?: string;
    };
    if (!resp.ok && !data.recommendation) {
      throw new Error(data.error ?? `HTTP ${resp.status}`);
    }
    return { ...data, formId, question: q };
  };

  const compareEnabled =
    compareMode &&
    !!selectedFormId &&
    selectedFormId !== "all" &&
    !!compareFormId &&
    compareFormId !== selectedFormId &&
    compareFormId !== "all";

  /**
   * Fire a query straight from a Goals-rail click. Bypasses the textarea
   * value entirely so React state staleness doesn't matter — the prompt
   * goes directly to the mutation. Also syncs the textarea so the user
   * can see what was asked + edit/re-ask.
   */
  const pickGoalAndAsk = (prompt: string) => {
    if (queryMutation.isPending) return;
    if (!selectedFormId) return;
    setQuestion(prompt);
    setLastAskedQuestion(prompt);
    counterMutation.reset();
    setExpandedSnapshot(null);
    queryMutation.mutate({ formId: selectedFormId, question: prompt });
  };

  const onAsk = () => {
    if (queryMutation.isPending) return;
    if (compareEnabled && question.trim()) {
      setLastAskedQuestion(question);
      counterMutation.reset();
      setExpandedSnapshot(null);
      const q = question;
      const pairId = `pair-${Date.now()}`;
      // Fire both in parallel; tag each thread entry with the shared
      // pairId so the renderer can group them into a 2-col grid.
      Promise.all([
        runComparisonQuery(selectedFormId, q),
        runComparisonQuery(compareFormId, q),
      ])
        .then(([a, b]) => {
          setThread((t) => [
            ...t,
            {
              id: `${pairId}-a`,
              question: q,
              data: a,
              pairId,
            },
            {
              id: `${pairId}-b`,
              question: q,
              data: b,
              pairId,
            },
          ]);
          if (ownerAddress && (a.memoriesUsed ?? 0) > 0) {
            writeHistory(ownerAddress, {
              formId: selectedFormId,
              formTitle: a.formTitle ?? `${selectedFormId.slice(0, 10)}…`,
              question: q,
              timestamp: Date.now(),
            });
          }
        })
        .catch(() => {
          /* leave the user with the input filled to retry */
        });
      return;
    }
    if (!canAsk) return;
    setLastAskedQuestion(question);
    counterMutation.reset();
    setExpandedSnapshot(null);
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

      <PinnedRow
        pinned={pinnedInsights}
        onExpand={(d) => {
          setExpandedSnapshot(d);
          setSelectedFormId(d.formId);
        }}
        onRemove={onRemovePin}
      />

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

          {/* Goals rail — preset + custom user-defined goals per form.
              Click any goal to fire its prompt directly without retyping. */}
          <div className="mt-5">
            <InsightsGoals
              scopeKey={selectedFormId || "all"}
              onPick={pickGoalAndAsk}
              disabled={queryMutation.isPending || !selectedFormId}
            />
          </div>

          {/* Action row BELOW the input. Replaces the prior Kraft-style
              decorative slots (paperclip/lightbulb/mic) — these were always
              disabled and added visual noise. The current set are all live:
              form picker, suggestions, history, re-index, send. */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* Form selector — most important control, leftmost */}
            <FormSelectorChip
              forms={forms}
              selectedFormId={selectedFormId}
              setSelectedFormId={setSelectedFormId}
              demoMode={demoMode}
            />

            {/* Suggestions menu */}
            <SuggestionChip
              onPick={setQuestion}
              dynamicSuggestions={suggestQuery.data?.suggestions ?? []}
            />

            {/* History — last 10 Q&As from this owner */}
            <HistoryChip
              onPick={(formId, question) => {
                setSelectedFormId(formId);
                setQuestion(question);
              }}
              ownerAddress={ownerAddress}
            />

            {/* Scope — soft date filter (all / 7d / 30d) */}
            <ScopeChip scope={scope} onChange={setScope} />

            {/* Compare — toggles parallel-query mode for a second form */}
            {forms.length > 1 && (
              <CompareToggle
                compareMode={compareMode}
                onToggle={() => {
                  setCompareMode((v) => !v);
                  if (compareMode) setCompareFormId("");
                }}
                compareFormId={compareFormId}
                onPick={setCompareFormId}
                forms={forms}
                primaryFormId={selectedFormId}
              />
            )}

            <span className="ml-auto hidden text-[11px] text-muted-foreground sm:inline">
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">⌘↵</kbd>
            </span>

            {/* Re-index — replaces the inline underline in IndexStatus */}
            <CircleButton
              ariaLabel="Re-index this form"
              disabled={!selectedFormId || indexMutation.isPending}
              onClick={() => {
                if (selectedFormId) indexMutation.mutate(selectedFormId);
              }}
            >
              <RefreshCw
                size={15}
                strokeWidth={1.75}
                className={indexMutation.isPending ? "animate-spin" : ""}
              />
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
              <IndexStatus status={indexMutation} progress={indexProgress} />
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

      {/* Auto-snapshot cards — visible only when no answer is on screen
          yet, so they decorate the "blank state" with pre-computed
          insights from the form's actual data. */}
      {snapshotsEnabled && !queryMutation.data && !expandedSnapshot && (
        <SnapshotRow
          snapshots={snapshots}
          prompts={SNAPSHOT_PROMPTS}
          onExpand={setExpandedSnapshot}
        />
      )}

      {/* Conversation thread + active states. Snapshot expand goes into
          its own InsightAnswer above the thread. Errors fall into a
          synthesized empty-state card so users get actionable copy. */}

      {expandedSnapshot && (
        <InsightAnswer
          data={expandedSnapshot}
          onPin={onPinCurrent}
          isPinned={currentlyPinned}
        />
      )}

      {thread.length > 0 && (
        <div className="mx-0">
          {thread.length > 1 && (
            <div className="mx-4 mt-6 flex items-center justify-between sm:mx-8 lg:mx-12">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Conversation · {thread.length} answer
                {thread.length === 1 ? "" : "s"}
              </div>
              <button
                type="button"
                onClick={() => setThread([])}
                className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
              >
                Clear thread
              </button>
            </div>
          )}
          {(() => {
            // Render entries in order, but coalesce two consecutive
            // entries sharing the same pairId into a 2-column grid for
            // side-by-side comparison.
            const rendered: React.ReactNode[] = [];
            for (let i = 0; i < thread.length; i++) {
              const entry = thread[i];
              const next = thread[i + 1];
              const pairWithNext = Boolean(
                entry.pairId && next?.pairId === entry.pairId,
              );
              const isLatest =
                i === thread.length - 1 ||
                (pairWithNext && i + 1 === thread.length - 1);
              const isCounter = entry.data.variant === "counter";

              const renderOne = (e: ThreadEntry, allowActions: boolean) => (
                <InsightAnswer
                  key={e.id}
                  data={e.data}
                  onCounterArgument={
                    allowActions && !isCounter ? onCounterArgument : undefined
                  }
                  onPin={() => {
                    if (!ownerAddress) return;
                    const upd = writePinned(ownerAddress, {
                      formId: e.data.formId,
                      formTitle: e.data.formTitle ?? null,
                      question: e.question,
                      answerExcerpt: (e.data.answer ?? "").slice(0, 200),
                      topThemes:
                        e.data.structured?.themes
                          ?.slice(0, 3)
                          .map((t) => t.label) ?? [],
                      timestamp: Date.now(),
                      data: e.data,
                    });
                    setPinnedInsights(upd);
                  }}
                  isPinned={pinnedInsights.some(
                    (p) =>
                      p.formId === e.data.formId && p.question === e.question,
                  )}
                />
              );

              if (pairWithNext) {
                rendered.push(
                  <div
                    key={`pair-${entry.pairId}`}
                    className="mx-0 grid gap-0 lg:grid-cols-2 [&>section]:lg:mx-2"
                  >
                    {renderOne(entry, false)}
                    {renderOne(next, isLatest)}
                  </div>,
                );
                i++; // consumed the next entry
              } else {
                rendered.push(renderOne(entry, isLatest));
              }
            }
            return rendered;
          })()}
        </div>
      )}

      {streamingPartial && queryMutation.isPending && (
        <div className="relative">
          <div className="pointer-events-none absolute right-6 top-6 z-10 inline-flex items-center gap-1.5 rounded-full border border-foreground/20 bg-card/90 px-2.5 py-1 text-[10px] uppercase tracking-widest text-muted-foreground shadow">
            <Sparkles size={10} className="animate-pulse" />
            Streaming
          </div>
          {/* Reasoning panel — narrates synthesis progress alongside
              the live answer. Auto-opens while streaming and collapses
              ~1.2s after `done`. */}
          {reasoningLog && (
            <div className="mx-4 mt-4 sm:mx-8 lg:mx-12">
              <Reasoning isStreaming={queryMutation.isPending}>
                <ReasoningTrigger />
                <ReasoningContent>{reasoningLog}</ReasoningContent>
              </Reasoning>
            </div>
          )}
          <InsightAnswer data={streamingPartial} />
        </div>
      )}

      {queryMutation.error instanceof Error && thread.length === 0 && (
        <InsightAnswer
          data={{
            formId: selectedFormId,
            error: queryMutation.error.message,
            memoriesUsed: 0,
            recommendation: "wait_for_memwal" satisfies Recommendation,
            formTitle: selected?.title,
            question: lastAskedQuestion,
          }}
        />
      )}

      {counterMutation.isPending && (
        <div className="mx-4 mt-4 inline-flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3 text-sm text-muted-foreground sm:mx-8 lg:mx-12">
          <Sparkles size={14} className="animate-pulse" />
          Looking for the opposing view…
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────
//  History — last 10 Q&As stored in localStorage per owner address.
//  Recorded automatically by the queryMutation onSuccess hook.
// ─────────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  formId: string;
  formTitle: string;
  question: string;
  timestamp: number;
}

const HISTORY_MAX = 10;
const historyKey = (owner: string | undefined) =>
  owner ? `echo:insights:history:${owner.toLowerCase()}` : "";

function readHistory(owner: string | undefined): HistoryEntry[] {
  if (typeof window === "undefined" || !owner) return [];
  try {
    const raw = window.localStorage.getItem(historyKey(owner));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeHistory(
  owner: string | undefined,
  entry: HistoryEntry,
): HistoryEntry[] {
  if (typeof window === "undefined" || !owner) return [];
  const existing = readHistory(owner);
  // Dedupe on (formId, question) so re-asking the same thing doesn't
  // bury older entries.
  const filtered = existing.filter(
    (e) => !(e.formId === entry.formId && e.question === entry.question),
  );
  const next = [entry, ...filtered].slice(0, HISTORY_MAX);
  try {
    window.localStorage.setItem(historyKey(owner), JSON.stringify(next));
  } catch {
    /* quota or disabled — silent */
  }
  return next;
}

function HistoryChip({
  onPick,
  ownerAddress,
}: {
  onPick: (formId: string, question: string) => void;
  ownerAddress: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  // Re-read on open so we pick up writes from the queryMutation since
  // the chip last rendered. Localstorage doesn't fire change events for
  // same-tab writes, so a simple re-read on open is enough.
  const onToggle = () => {
    if (!open) setEntries(readHistory(ownerAddress));
    setOpen((v) => !v);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm text-foreground transition hover:border-foreground/40 hover:bg-muted",
          open && "border-foreground/40 bg-muted",
        )}
      >
        <Clock size={14} strokeWidth={1.75} />
        History
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-20 flex w-[min(440px,92vw)] flex-col rounded-2xl border border-border bg-card p-2 shadow-2xl shadow-foreground/10">
          {entries.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              No history yet — ask a question and it&rsquo;ll show up here.
            </p>
          ) : (
            entries.map((e) => (
              <button
                key={`${e.formId}-${e.timestamp}`}
                type="button"
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  onPick(e.formId, e.question);
                  setOpen(false);
                }}
                className="flex flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left transition hover:bg-muted"
              >
                <span className="line-clamp-1 text-sm text-foreground">
                  {e.question}
                </span>
                <span className="line-clamp-1 text-[11px] text-muted-foreground">
                  {e.formTitle} · {relativeTime(e.timestamp)}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Scope chip — soft date-range filter passed to the query route. The
// server uses it to bias the model toward recent submissions; we don't
// strictly filter the memory set because timestamps aren't yet baked
// into indexed memory text. Add timestamp grounding in a follow-up if
// the soft hint proves insufficient.
// Compare toggle — when active, shows a secondary form picker and
// flips the action row into 2-form mode. Asking fires queries in
// parallel and the two answers render as a paired side-by-side row
// in the conversation thread (see the pairId branch in the render).
function CompareToggle({
  compareMode,
  onToggle,
  compareFormId,
  onPick,
  forms,
  primaryFormId,
}: {
  compareMode: boolean;
  onToggle: () => void;
  compareFormId: string;
  onPick: (id: string) => void;
  forms: FormChoice[];
  primaryFormId: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-full border bg-background px-4 text-sm transition",
          compareMode
            ? "border-foreground/40 bg-muted text-foreground"
            : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
        )}
        title={
          compareMode ? "Disable compare mode" : "Compare against another form"
        }
      >
        <span className="font-mono text-[11px]">A:B</span>
        {compareMode ? "Compare on" : "Compare"}
      </button>
      {compareMode && (
        <label className="inline-flex h-10 items-center gap-2 rounded-full border border-foreground/30 bg-background pl-4 pr-3 text-sm text-foreground transition focus-within:border-foreground/60">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            vs
          </span>
          <select
            value={compareFormId}
            onChange={(e) => onPick(e.target.value)}
            className="cursor-pointer appearance-none bg-transparent pr-1 outline-none"
          >
            <option value="">Pick form B</option>
            {forms
              .filter((f) => f.id !== primaryFormId)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
          </select>
        </label>
      )}
    </div>
  );
}

const SCOPE_OPTIONS: Array<{ value: "all" | "7d" | "30d"; label: string }> = [
  { value: "all", label: "All time" },
  { value: "30d", label: "30 days" },
  { value: "7d", label: "7 days" },
];

function ScopeChip({
  scope,
  onChange,
}: {
  scope: "all" | "7d" | "30d";
  onChange: (s: "all" | "7d" | "30d") => void;
}) {
  const [open, setOpen] = useState(false);
  const active =
    SCOPE_OPTIONS.find((o) => o.value === scope) ?? SCOPE_OPTIONS[0];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm text-foreground transition hover:border-foreground/40 hover:bg-muted",
          open && "border-foreground/40 bg-muted",
          scope !== "all" && "border-foreground/30",
        )}
      >
        <Compass size={14} strokeWidth={1.75} />
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Scope:
        </span>
        {active.label}
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-20 flex w-[200px] flex-col rounded-2xl border border-border bg-card p-2 shadow-2xl shadow-foreground/10">
          {SCOPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o.value);
                setOpen(false);
              }}
              className={cn(
                "rounded-xl px-3 py-2 text-left text-sm transition hover:bg-muted",
                o.value === scope
                  ? "text-foreground"
                  : "text-foreground/70 hover:text-foreground",
              )}
            >
              {o.label}
              {o.value === scope && (
                <span className="ml-2 text-[10px] text-muted-foreground">
                  · active
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────────────────────

function CircleButton({
  children,
  ariaLabel,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
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
        {forms.length > 1 && (
          <option value="all">(All my forms — cross-form synthesis)</option>
        )}
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

function SuggestionChip({
  onPick,
  dynamicSuggestions,
}: {
  onPick: (s: string) => void;
  dynamicSuggestions: string[];
}) {
  const [open, setOpen] = useState(false);
  const hasDynamic = dynamicSuggestions.length > 0;
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
        {hasDynamic && (
          <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-20 flex w-[min(420px,92vw)] flex-col rounded-2xl border border-border bg-card p-2 shadow-2xl shadow-foreground/10">
          {hasDynamic && (
            <>
              <div className="flex items-center gap-2 px-3 pb-1 pt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                <Sparkles size={10} strokeWidth={2} />
                For this form
              </div>
              {dynamicSuggestions.map((s) => (
                <button
                  key={`dyn-${s}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPick(s);
                    setOpen(false);
                  }}
                  className="rounded-xl px-3 py-2 text-left text-sm text-foreground transition hover:bg-muted"
                >
                  {s}
                </button>
              ))}
              <div className="my-1.5 mx-2 h-px bg-border" />
              <div className="px-3 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                General
              </div>
            </>
          )}
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
  progress,
}: {
  status: ReturnType<typeof useMutation<unknown, Error, string>>;
  progress: IndexingProgressState | null;
}) {
  // When the SSE streaming endpoint is in flight we receive incremental
  // progress events. Render the multi-stage progress strip instead of the
  // flat "Indexing…" line so the user sees forward motion across the
  // chain-query → walrus → decrypt → embed pipeline.
  if (status.isPending && progress) {
    return <IndexingProgressStrip progress={progress} />;
  }
  if (status.isPending) {
    return (
      <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <Database size={12} className="animate-pulse" />
        Connecting to Memwal…
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
    | {
        indexed?: number;
        deduped?: number;
        events?: number;
        namespace?: string;
      }
    | undefined;
  if (!data) return null;
  return (
    <p className="inline-flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Database size={12} className="text-emerald-500" />
      Ready · {data.indexed ?? 0} of {data.events ?? data.indexed ?? 0}{" "}
      submission{data.events === 1 ? "" : "s"} indexed
      {data.deduped ? ` · ${data.deduped} deduped` : ""}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Auto-snapshot cards — pre-computed insights shown before the user
//  types anything. Each card is the result of one of the SNAPSHOT_PROMPTS
//  fired against the selected form. Click a card → expands it into the
//  main InsightAnswer slot.
// ─────────────────────────────────────────────────────────────────────────

interface SnapshotPrompt {
  id: string;
  label: string;
  icon: typeof Compass;
  question: string;
}

function SnapshotRow({
  snapshots,
  prompts,
  onExpand,
}: {
  snapshots: Array<{
    data?: InsightAnswerData;
    isLoading: boolean;
    isError: boolean;
  }>;
  prompts: readonly SnapshotPrompt[];
  onExpand: (data: InsightAnswerData) => void;
}) {
  return (
    <div className="mx-4 mb-4 mt-6 grid grid-cols-1 gap-3 sm:mx-8 sm:grid-cols-2 lg:mx-12 lg:grid-cols-3">
      {prompts.map((p, i) => (
        <SnapshotCard
          key={p.id}
          prompt={p}
          state={snapshots[i]}
          onExpand={onExpand}
        />
      ))}
    </div>
  );
}

function SnapshotCard({
  prompt,
  state,
  onExpand,
}: {
  prompt: SnapshotPrompt;
  state: { data?: InsightAnswerData; isLoading: boolean; isError: boolean };
  onExpand: (data: InsightAnswerData) => void;
}) {
  const Icon = prompt.icon;
  const isLoading = state.isLoading;
  const data = state.data;
  const memUsed = data?.memoriesUsed ?? 0;
  const hasContent = !!data && memUsed > 0 && !!data.answer;
  const summary = hasContent ? excerpt(data!.answer ?? "", 140) : null;

  return (
    <button
      type="button"
      onClick={hasContent && data ? () => onExpand(data) : undefined}
      disabled={!hasContent}
      className={cn(
        "group flex h-full flex-col items-start gap-2 rounded-2xl border border-border bg-card/60 p-4 text-left transition",
        hasContent
          ? "cursor-pointer hover:border-foreground/30 hover:bg-card hover:shadow-md hover:shadow-foreground/[0.04]"
          : "cursor-default",
      )}
    >
      <div className="flex w-full items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        <Icon size={12} strokeWidth={1.75} />
        {prompt.label}
        {hasContent && (
          <ArrowRight
            size={11}
            strokeWidth={2}
            className="ml-auto text-muted-foreground/60 transition-colors duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:text-foreground"
          />
        )}
      </div>
      {isLoading ? (
        <div className="w-full space-y-1.5">
          <div className="h-2.5 w-11/12 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-8/12 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-9/12 animate-pulse rounded bg-muted" />
        </div>
      ) : summary ? (
        <p className="text-sm leading-relaxed text-foreground/85 line-clamp-4">
          {summary}
        </p>
      ) : (
        <p className="text-sm italic text-muted-foreground/70">
          Not enough data yet.
        </p>
      )}
    </button>
  );
}

function excerpt(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).replace(/\s+\S*$/, "") + "…";
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
