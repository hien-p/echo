"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  Check,
  Copy,
  FileText,
  Inbox,
  Pin,
  Quote,
  Scale,
  Send,
  Sparkles,
  Telescope,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CitationSheet, type CitationSheetData } from "./CitationSheet";

/**
 * Answer panel for /insights. Renders three variants based on the
 * query API response:
 *
 *   1. EmptyAnswer    — no memories. Picks empty-state copy + CTAs from
 *                       the `recommendation` enum returned by the route.
 *   2. StructuredAnswer — prose + theme chips + clickable citations.
 *   3. PlainAnswer    — bare prose. Used when `structured` is absent.
 *
 * `[0xabc12345]` tokens in the prose are auto-wrapped in citation
 * buttons that scroll to the matching row in the Citations section.
 */

export type Recommendation =
  | "ok"
  | "submit_to_populate"
  | "decrypt_failed"
  | "wait_for_memwal"
  | "region_blocked";

export interface Citation {
  submissionId: string;
  excerpt: string;
}

export interface Theme {
  label: string;
  count: number;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  citationIds: string[];
}

export interface Outlier {
  submissionId: string;
  why: string;
}

export interface Persona {
  name: string;
  count: number;
  characteristic: string;
  sentimentSlant: "positive" | "neutral" | "negative" | "mixed";
}

export interface HeadlineQuote {
  text: string;
  submissionId: string;
}

export interface SubmissionTagging {
  submissionId: string;
  tags: string[];
}

export interface InsightAnswerData {
  answer?: string;
  structured?: {
    themes: Theme[];
    citations: Citation[];
    confidence?: "high" | "medium" | "low";
    gaps?: string[];
    outlier?: Outlier | null;
    personas?: Persona[];
    headlineQuote?: HeadlineQuote | null;
    submissionTags?: SubmissionTagging[];
  };
  /** Full memory texts used to synthesize this answer. Shipped by the
   *  query route so the citation deep-view sheet can render full content
   *  without a second round-trip. Indexed by submissionId. */
  memories?: Array<{ submissionId: string; text: string }>;
  formTitle?: string | null;
  formId: string;
  namespace?: string;
  memoriesUsed?: number;
  memoriesSource?: "memwal" | "direct-decrypt";
  modelUsed?: string;
  onChainEventCount?: number | null;
  recommendation?: Recommendation;
  recallErrors?: string[];
  error?: string;
  /** The original question the user asked. Used for export + counter-arg. */
  question?: string;
  /** Visual badge: marks this card as a derived "Opposing view" card. */
  variant?: "primary" | "counter";
}

export function InsightAnswer({
  data,
  onCounterArgument,
  onPin,
  isPinned,
}: {
  data: InsightAnswerData;
  onCounterArgument?: () => void;
  onPin?: () => void;
  isPinned?: boolean;
}) {
  const isEmpty = (data.memoriesUsed ?? 0) === 0;
  const isCounter = data.variant === "counter";
  const confidence = data.structured?.confidence;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className={cn(
        "mx-4 mb-16 mt-4 rounded-3xl border bg-card p-8 shadow-xl shadow-foreground/[0.04] sm:mx-8 sm:p-10 lg:mx-12",
        isCounter ? "border-amber-500/30 bg-amber-500/[0.02]" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {isCounter ? (
          <>
            <Scale size={12} />
            Opposing view
          </>
        ) : (
          <>
            <Sparkles size={12} />
            {isEmpty ? "No data yet" : "Answer"}
          </>
        )}
        {confidence && !isEmpty && <ConfidenceBadge level={confidence} />}
        {data.formTitle && (
          <span className="ml-auto truncate normal-case tracking-normal text-foreground/60">
            {data.formTitle}
          </span>
        )}
      </div>

      {isEmpty ? (
        <EmptyAnswer data={data} />
      ) : data.structured && data.structured.themes !== undefined ? (
        <StructuredAnswer
          data={data}
          onCounterArgument={isCounter ? undefined : onCounterArgument}
          onPin={isCounter ? undefined : onPin}
          isPinned={isPinned}
        />
      ) : (
        <PlainAnswer answer={data.answer ?? ""} />
      )}
    </motion.section>
  );
}

function ConfidenceBadge({ level }: { level: "high" | "medium" | "low" }) {
  const cfg = {
    high: { dot: "bg-emerald-500", label: "High confidence" },
    medium: { dot: "bg-amber-500", label: "Medium confidence" },
    low: { dot: "bg-rose-500", label: "Low confidence" },
  }[level];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2 py-0.5 text-[10px] normal-case tracking-normal text-foreground/70">
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────

function EmptyAnswer({ data }: { data: InsightAnswerData }) {
  const rec = data.recommendation ?? "submit_to_populate";
  const formId = data.formId;
  const eventCount = data.onChainEventCount;

  const config = (() => {
    switch (rec) {
      case "decrypt_failed":
        return {
          Icon: WifiOff,
          title: `${eventCount ?? "Some"} submission${eventCount === 1 ? "" : "s"} on chain — but couldn't decrypt`,
          body: "Submissions exist for this form but the indexer is missing the FormOwnerCap needed to decrypt them. This usually means demo-admin isn't toggled on, or the cap was transferred away.",
          primaryCta: {
            label: "Open form admin",
            href: `/forms/${formId}/admin`,
          },
        };
      case "wait_for_memwal":
        return {
          Icon: WifiOff,
          title: "Memwal relayer is queueing — answer pending",
          body: "The Memwal indexer accepted the job but hasn't completed it yet. Submissions may already exist on chain. Try the question again in a minute, or open form admin to inspect the raw state.",
          primaryCta: {
            label: "Open form admin",
            href: `/forms/${formId}/admin`,
          },
        };
      case "region_blocked":
        return {
          Icon: WifiOff,
          title: "Model region-blocked",
          body: "Every OpenRouter model we tried is unavailable in your region. Set OPENROUTER_MODEL to a globally available provider (e.g. google/gemini-2.0-flash-001).",
          primaryCta: null,
        };
      case "submit_to_populate":
      default:
        return {
          Icon: Inbox,
          title: "This form has no submissions yet",
          body: "Share the form link, collect a few responses, and Echo will synthesize an answer the moment Memwal finishes indexing.",
          primaryCta: {
            label: "Open form admin",
            href: `/forms/${formId}/admin`,
          },
        };
    }
  })();

  const Icon = config.Icon;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/forms/${formId}`,
      );
    } catch {
      /* clipboard may be blocked — silent no-op */
    }
  };

  return (
    <div className="mt-6 flex flex-col items-start gap-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted/40">
        <Icon size={20} strokeWidth={1.75} className="text-muted-foreground" />
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-foreground">
          {config.title}
        </h3>
        <p className="max-w-[36rem] text-sm leading-relaxed text-muted-foreground">
          {config.body}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {config.primaryCta && (
          <Link
            href={config.primaryCta.href}
            className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
          >
            {config.primaryCta.label}
            <ArrowUpRight size={14} strokeWidth={2} />
          </Link>
        )}
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground transition hover:border-foreground/40 hover:bg-muted"
        >
          <Copy size={14} strokeWidth={1.75} />
          Copy form link
        </button>
        <Link
          href={`/s/${formId}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-sm text-foreground transition hover:border-foreground/40 hover:bg-muted"
        >
          <Send size={14} strokeWidth={1.75} />
          Open submission view
        </Link>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-[11px] text-muted-foreground/70 sm:grid-cols-3">
        <Diagnostic label="Namespace" value={data.namespace ?? "—"} mono />
        <Diagnostic
          label="On-chain events"
          value={
            eventCount === null || eventCount === undefined
              ? "?"
              : String(eventCount)
          }
        />
        <Diagnostic
          label="Memories used"
          value={String(data.memoriesUsed ?? 0)}
        />
        {data.recallErrors && data.recallErrors.length > 0 && (
          <Diagnostic
            label="Recall errors"
            value={data.recallErrors.join("; ")}
            wide
          />
        )}
      </dl>
    </div>
  );
}

function Diagnostic({
  label,
  value,
  mono,
  wide,
}: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-3" : ""}>
      <dt className="uppercase tracking-wider opacity-60">{label}</dt>
      <dd
        className={cn(
          "truncate",
          mono ? "font-mono text-foreground/70" : "text-foreground/70",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Structured answer (prose + themes + citations)
// ─────────────────────────────────────────────────────────────────────

const SENTIMENT_DOT: Record<Theme["sentiment"], string> = {
  positive: "bg-emerald-500",
  neutral: "bg-foreground/30",
  negative: "bg-rose-500",
  mixed: "bg-amber-500",
};

function StructuredAnswer({
  data,
  onCounterArgument,
  onPin,
  isPinned,
}: {
  data: InsightAnswerData;
  onCounterArgument?: () => void;
  onPin?: () => void;
  isPinned?: boolean;
}) {
  const themes = data.structured?.themes ?? [];
  const rawCitations = data.structured?.citations;
  const rawMemories = data.memories;
  const gaps = data.structured?.gaps ?? [];
  const outlier = data.structured?.outlier ?? null;
  const personas = data.structured?.personas ?? [];
  const headlineQuote = data.structured?.headlineQuote ?? null;
  const rawSubmissionTags = data.structured?.submissionTags;

  const tagMap = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of rawSubmissionTags ?? []) {
      m.set(normalizeId(t.submissionId), t.tags);
    }
    return m;
  }, [rawSubmissionTags]);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [sheetData, setSheetData] = useState<CitationSheetData | null>(null);
  const citationRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const citations = useMemo(() => rawCitations ?? [], [rawCitations]);
  const citationMap = useMemo(() => {
    const m = new Map<string, Citation>();
    for (const c of citations) m.set(normalizeId(c.submissionId), c);
    return m;
  }, [citations]);

  // Index memories by normalized id (with and without 0x) so citations
  // can resolve regardless of how the LLM formatted the id.
  const memoryMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of rawMemories ?? []) {
      m.set(normalizeId(mem.submissionId), mem.text);
    }
    return m;
  }, [rawMemories]);

  const openCitation = (citation: Citation) => {
    const full = memoryMap.get(normalizeId(citation.submissionId));
    setSheetData({
      submissionId: citation.submissionId,
      text: full ?? citation.excerpt,
      highlight: citation.excerpt,
    });
  };

  const scrollToCitation = (id: string) => {
    const key = normalizeId(id);
    const node = citationRefs.current.get(key);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(key);
    window.setTimeout(() => setHighlightedId(null), 1400);
  };

  return (
    <>
      <div className="mt-5 space-y-8">
        {headlineQuote && (
          <figure className="relative rounded-2xl border-l-4 border-foreground/30 bg-muted/40 px-6 py-5">
            <Quote
              size={20}
              strokeWidth={1.5}
              className="absolute -left-2 top-3 text-foreground/20"
            />
            <blockquote className="font-serif text-lg italic leading-snug text-foreground/90">
              &ldquo;{headlineQuote.text}&rdquo;
            </blockquote>
            <figcaption className="mt-2 text-[11px] uppercase tracking-widest text-muted-foreground">
              — submission{" "}
              <code className="font-mono text-foreground/60">
                {headlineQuote.submissionId}
              </code>
            </figcaption>
          </figure>
        )}

        {/* Sentiment overview — derived from themes[].sentiment counts.
          One-glance read of the room before the user dives into prose. */}
        {themes.length > 0 && <SentimentOverview themes={themes} />}

        <article className="text-base leading-relaxed text-foreground">
          <ProseWithCitations
            text={data.answer ?? ""}
            knownIds={new Set(citationMap.keys())}
            onCitationClick={scrollToCitation}
          />
        </article>

        {outlier && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.04] p-4">
            <Telescope
              size={15}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-700 dark:text-amber-400">
                Outlier
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-foreground/90">
                {outlier.why}{" "}
                <code className="ml-1 rounded bg-muted px-1 py-0.5 text-[11px] text-muted-foreground">
                  {outlier.submissionId}
                </code>
              </p>
            </div>
          </div>
        )}

        {themes.length > 0 && (
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Themes
            </h4>
            <ThemeBarList themes={themes} onCitationClick={scrollToCitation} />
          </div>
        )}

        {personas.length > 0 && (
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Personas
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {personas.map((p, i) => (
                <div
                  key={`${p.name}-${i}`}
                  className="rounded-2xl border border-border bg-background/50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <span
                        aria-hidden
                        className={cn(
                          "h-2 w-2 rounded-full",
                          SENTIMENT_DOT[p.sentimentSlant],
                        )}
                      />
                      {p.name}
                    </p>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {p.count}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {p.characteristic}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {citations.length > 0 && (
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Citations · {citations.length}
            </h4>
            <ul className="space-y-2">
              {citations.map((c) => {
                const key = normalizeId(c.submissionId);
                const hasFullText = memoryMap.has(key);
                return (
                  <li
                    key={key}
                    ref={(el) => {
                      if (el) citationRefs.current.set(key, el);
                    }}
                    className={cn(
                      "overflow-hidden rounded-2xl border border-border bg-background/50 transition",
                      highlightedId === key &&
                        "border-foreground/40 bg-muted/60 shadow-md shadow-foreground/[0.04]",
                    )}
                  >
                    <button
                      type="button"
                      onClick={hasFullText ? () => openCitation(c) : undefined}
                      disabled={!hasFullText}
                      className={cn(
                        "w-full p-4 text-left transition",
                        hasFullText
                          ? "cursor-pointer hover:bg-muted/60"
                          : "cursor-default",
                      )}
                      title={
                        hasFullText
                          ? "Open full submission"
                          : "Full text not available"
                      }
                    >
                      <div className="flex items-start gap-3">
                        <Quote
                          size={14}
                          strokeWidth={1.75}
                          className="mt-1 shrink-0 text-muted-foreground"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <code className="text-[11px] text-muted-foreground">
                              {c.submissionId}
                            </code>
                            {(tagMap.get(key) ?? []).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-muted px-2 py-px text-[10px] font-medium text-foreground/70"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-foreground/90">
                            {c.excerpt}
                          </p>
                          {hasFullText && (
                            <span className="mt-2 inline-flex items-center text-[10px] uppercase tracking-widest text-foreground/40">
                              View full submission →
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {gaps.length > 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-background/30 p-4">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              What the data doesn&rsquo;t cover
            </p>
            <ul className="space-y-1 text-sm italic text-muted-foreground">
              {gaps.map((g, i) => (
                <li key={i}>— {g}</li>
              ))}
            </ul>
          </div>
        )}

        <ActionBar
          data={data}
          onCounterArgument={onCounterArgument}
          onPin={onPin}
          isPinned={isPinned}
        />

        <Footer data={data} />
      </div>
      <CitationSheet data={sheetData} onClose={() => setSheetData(null)} />
    </>
  );
}

function ActionBar({
  data,
  onCounterArgument,
  onPin,
  isPinned,
}: {
  data: InsightAnswerData;
  onCounterArgument?: () => void;
  onPin?: () => void;
  isPinned?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const onExport = async () => {
    const md = renderAsMarkdown(data);
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — silent */
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onExport}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition hover:border-foreground/40 hover:bg-muted"
      >
        {copied ? (
          <>
            <Check size={13} strokeWidth={2} className="text-emerald-500" />
            Copied
          </>
        ) : (
          <>
            <FileText size={13} strokeWidth={1.75} />
            Copy as Markdown
          </>
        )}
      </button>
      {onPin && (
        <button
          type="button"
          onClick={onPin}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs transition",
            isPinned
              ? "border-foreground/40 bg-muted text-foreground"
              : "border-border text-foreground hover:border-foreground/40 hover:bg-muted",
          )}
        >
          <Pin
            size={13}
            strokeWidth={1.75}
            className={isPinned ? "fill-foreground/60" : ""}
          />
          {isPinned ? "Pinned" : "Pin insight"}
        </button>
      )}
      {onCounterArgument && (
        <button
          type="button"
          onClick={onCounterArgument}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition hover:border-amber-500/40 hover:bg-amber-500/5"
        >
          <Scale size={13} strokeWidth={1.75} />
          Show opposing view
        </button>
      )}
    </div>
  );
}

function renderAsMarkdown(data: InsightAnswerData): string {
  const lines: string[] = [];
  if (data.question) {
    lines.push(`# ${data.question}`, "");
  }
  if (data.formTitle) {
    lines.push(`*Form: ${data.formTitle}*`, "");
  }
  if (data.answer) {
    lines.push("## Answer", "", data.answer, "");
  }
  const conf = data.structured?.confidence;
  if (conf) {
    lines.push(`**Confidence:** ${conf}`, "");
  }
  const themes = data.structured?.themes ?? [];
  if (themes.length > 0) {
    lines.push("## Themes", "");
    for (const t of themes) {
      lines.push(`- **${t.label}** (${t.count}, ${t.sentiment})`);
    }
    lines.push("");
  }
  const personas = data.structured?.personas ?? [];
  if (personas.length > 0) {
    lines.push("## Personas", "");
    for (const p of personas) {
      lines.push(
        `- **${p.name}** (${p.count}, ${p.sentimentSlant}) — ${p.characteristic}`,
      );
    }
    lines.push("");
  }
  const citations = data.structured?.citations ?? [];
  if (citations.length > 0) {
    lines.push("## Citations", "");
    for (const c of citations) {
      lines.push(`> ${c.excerpt}`);
      lines.push(`> — \`${c.submissionId}\``, "");
    }
  }
  const gaps = data.structured?.gaps ?? [];
  if (gaps.length > 0) {
    lines.push("## Not covered", "");
    for (const g of gaps) lines.push(`- ${g}`);
    lines.push("");
  }
  const outlier = data.structured?.outlier;
  if (outlier) {
    lines.push("## Outlier", "");
    lines.push(`\`${outlier.submissionId}\` — ${outlier.why}`, "");
  }
  if (data.memoriesUsed != null) {
    lines.push(
      `---`,
      `*Synthesized from ${data.memoriesUsed} submission${data.memoriesUsed === 1 ? "" : "s"}` +
        (data.modelUsed ? ` via ${data.modelUsed}` : "") +
        `.*`,
    );
  }
  return lines.join("\n");
}

// Sentiment color tokens used by both the overview bar and the theme rows.
const SENTIMENT_BG: Record<Theme["sentiment"], string> = {
  positive: "bg-emerald-500",
  neutral: "bg-zinc-400 dark:bg-zinc-500",
  negative: "bg-rose-500",
  mixed: "bg-amber-500",
};

const SENTIMENT_LABEL: Record<Theme["sentiment"], string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
  mixed: "Mixed",
};

/**
 * Sentiment overview — segmented horizontal bar derived from
 * themes[].sentiment counts. One-glance read of how the room feels
 * before scrolling into the prose.
 */
function SentimentOverview({ themes }: { themes: Theme[] }) {
  const buckets = useMemo(() => {
    const out: Record<Theme["sentiment"], number> = {
      positive: 0,
      neutral: 0,
      negative: 0,
      mixed: 0,
    };
    for (const t of themes) {
      out[t.sentiment] = (out[t.sentiment] ?? 0) + Math.max(1, t.count);
    }
    return out;
  }, [themes]);
  const total =
    buckets.positive + buckets.neutral + buckets.negative + buckets.mixed;
  if (total === 0) return null;
  const order: Theme["sentiment"][] = [
    "positive",
    "mixed",
    "neutral",
    "negative",
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Sentiment overview
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {total} signal{total === 1 ? "" : "s"} across {themes.length} theme
          {themes.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-foreground/5">
        {order.map((s) => {
          const n = buckets[s];
          if (n === 0) return null;
          const pct = (n / total) * 100;
          return (
            <div
              key={s}
              className={cn(SENTIMENT_BG[s], "h-full")}
              style={{ width: `${pct}%` }}
              title={`${SENTIMENT_LABEL[s]}: ${n}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {order.map((s) => {
          const n = buckets[s];
          if (n === 0) return null;
          return (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn("h-2 w-2 rounded-full", SENTIMENT_BG[s])}
              />
              <span className="font-medium text-foreground/80">
                {SENTIMENT_LABEL[s]}
              </span>
              <span className="tabular-nums">{n}</span>
              <span className="text-muted-foreground/60">
                ({Math.round((n / total) * 100)}%)
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Theme bar list — one row per theme with a sentiment-colored fill
 * proportional to the theme's `count`, plus citation chips on the
 * right that scroll-link to the matching submission.
 */
function ThemeBarList({
  themes,
  onCitationClick,
}: {
  themes: Theme[];
  onCitationClick: (id: string) => void;
}) {
  const max = Math.max(1, ...themes.map((t) => t.count));
  return (
    <ul className="flex flex-col gap-3">
      {themes.map((t, i) => {
        const pct = Math.min(100, (t.count / max) * 100);
        return (
          <li key={`${t.label}-${i}`} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className={cn(
                    "inline-block h-2 w-2 shrink-0 rounded-full",
                    SENTIMENT_BG[t.sentiment],
                  )}
                  title={SENTIMENT_LABEL[t.sentiment]}
                />
                <span className="truncate font-medium text-foreground">
                  {t.label}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
                  {SENTIMENT_LABEL[t.sentiment]}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {t.citationIds.slice(0, 4).map((cid) => (
                  <button
                    key={cid}
                    type="button"
                    onClick={() => onCitationClick(cid)}
                    title={`Scroll to citation ${cid}`}
                    className="rounded-md border border-border bg-background/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                  >
                    {cid.slice(0, 8)}
                  </button>
                ))}
                <span className="font-medium tabular-nums text-foreground">
                  {t.count}
                </span>
              </div>
            </div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-foreground/5">
              <div
                className={cn(
                  "absolute inset-y-0 left-0",
                  SENTIMENT_BG[t.sentiment],
                )}
                style={{
                  width: `${pct}%`,
                  transition: "width 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Plain fallback
// ─────────────────────────────────────────────────────────────────────

function PlainAnswer({ answer }: { answer: string }) {
  return (
    <article className="mt-5 whitespace-pre-wrap text-base leading-relaxed text-foreground">
      {answer}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Prose with clickable citation tokens
// ─────────────────────────────────────────────────────────────────────

// Matches [0xabc12345], optionally with surrounding "submission ":
// e.g. [submission 0xabc12345] or just [0xabc12345…]
const CITATION_RE = /\[(?:submission\s+)?(0x[0-9a-f]+)…?\]/gi;

function ProseWithCitations({
  text,
  knownIds,
  onCitationClick,
}: {
  text: string;
  knownIds: Set<string>;
  onCitationClick: (id: string) => void;
}) {
  // Split the answer into text + citation token nodes. Citations that don't
  // match any returned citation row degrade to plain text so we don't
  // render dead buttons.
  const parts: Array<
    { type: "text"; value: string } | { type: "cite"; raw: string; id: string }
  > = [];
  let lastIndex = 0;
  for (const match of text.matchAll(CITATION_RE)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, start) });
    }
    parts.push({ type: "cite", raw: match[0], id: match[1].toLowerCase() });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return (
    <p className="whitespace-pre-wrap">
      {parts.map((p, i) => {
        if (p.type === "text") return <span key={i}>{p.value}</span>;
        const isKnown = knownIds.has(normalizeId(p.id));
        if (!isKnown) {
          return (
            <span key={i} className="text-muted-foreground">
              {p.raw}
            </span>
          );
        }
        return (
          <button
            key={i}
            type="button"
            onClick={() => onCitationClick(p.id)}
            className="mx-0.5 inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-px text-[12px] font-mono text-foreground/80 align-baseline transition hover:border-foreground/40 hover:bg-foreground/10"
          >
            {p.id}
          </button>
        );
      })}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Footer (source + model + memories used)
// ─────────────────────────────────────────────────────────────────────

function Footer({ data }: { data: InsightAnswerData }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-4 text-[11px] text-muted-foreground">
      <span>
        {data.memoriesUsed ?? 0} submission
        {data.memoriesUsed === 1 ? "" : "s"} used
      </span>
      {data.memoriesSource && (
        <span>
          source:{" "}
          <span className="font-mono text-foreground/60">
            {data.memoriesSource}
          </span>
        </span>
      )}
      {data.modelUsed && (
        <span>
          model:{" "}
          <span className="font-mono text-foreground/60">{data.modelUsed}</span>
        </span>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function normalizeId(id: string): string {
  // The LLM may return ids with or without the 0x prefix, sometimes with
  // a trailing ellipsis. Strip both and lowercase so lookups match
  // regardless of how the model formatted the citation.
  return id.replace(/[…\s]/g, "").replace(/^0x/i, "0x").toLowerCase();
}
