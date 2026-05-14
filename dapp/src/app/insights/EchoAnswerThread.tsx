"use client";

/**
 * EchoAnswerThread — the magazine answer card matching the Claude
 * Design "Echo Insights.html" spec:
 *
 *   - Q header  : 40px walrus avatar in brutalist disc + question H2
 *                 (Inter 500 -0.035em clamp 28-42px)
 *   - Answer    : 2px ink border, brutalist offset, 18px radius,
 *                 animated 4px aurora-ribbon top
 *   - Head      : pulsing green dot + "ANSWER · SYNTHESIZED FROM N
 *                 FORMS" eyebrow + copy/star/share 30px buttons
 *   - Lead      : 17px Inter, **bold** words get the yellow #E8FF75
 *                 highlight band at 88%-from-bottom (38% height)
 *   - Bullets   : dashed-top rows; 36px num column (tier square + mono
 *                 index); body has title (Inter 500 -0.025em 19px) +
 *                 "N mentions" pill + delta chip; summary; source
 *                 chips (inverse-plate count + mono uppercase label)
 *   - Tail      : amber "⚠ ALSO FLAGGED" outlier block
 *
 * Real data: calls /api/insights/query with the user's question
 * once a form (or "all") is picked. Maps the response's
 * `structured.themes[]` → bullets, `structured.outlier` → tail,
 * `answer` first sentence → lead.
 *
 * Form picker is a small chip under the prompt input; falls back
 * to the first form the wallet owns. Demo data renders before the
 * first ask so the layout never reads as broken.
 */

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { apiUrl, clientConfig } from "@/config/clientConfig";
import { readJsonViaAggregator, type FormMetadata } from "@/lib/echo";
import { WalrusMascot } from "@/components/general/FrameForms";
import { useDemoAdminMode } from "@/components/general/DemoAdminToggle";

// ─────────────────────────────────────────────────────────────────
// Types — mirror /api/insights/query response so we can map cleanly
// ─────────────────────────────────────────────────────────────────

interface ThemeT {
  label: string;
  count: number;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  citationIds: string[];
}
interface CitationT {
  submissionId: string;
  excerpt: string;
}
interface OutlierT {
  submissionId: string;
  why: string;
}
interface QueryResponse {
  answer?: string;
  structured?: {
    themes: ThemeT[];
    citations: CitationT[];
    confidence?: "high" | "medium" | "low";
    gaps?: string[];
    outlier?: OutlierT | null;
  };
  formTitle?: string | null;
  namespace?: string;
  memoriesUsed?: number;
  error?: string;
}

interface DisplayBullet {
  dot: number; // tier idx for color
  title: string;
  mentions: number;
  summary: string;
  delta?: { value: string; up: boolean; span: string };
  sources: Array<{ label: string; subs: number }>;
}

interface DisplayThread {
  question: string;
  askedAt: string;
  model: string;
  sources: number;
  lead: string; // may contain **bold** spans
  bullets: DisplayBullet[];
  tail?: string;
}

// ─────────────────────────────────────────────────────────────────
// Demo thread — what renders before the user actually asks. Drawn
// straight from the spec so the page reads as a working surface.
// ─────────────────────────────────────────────────────────────────

const DEMO_THREAD: DisplayThread = {
  question: "What's slowing validators down this week?",
  askedAt: "just now",
  model: "memwal · gpt-5",
  sources: 4,
  lead: "Across the four forms you own that touch the validator audience, **wallet-timeout errors** during onboarding and **slow Seal decrypt UX** are the two clear pain points this week.",
  bullets: [
    {
      dot: 2,
      title: "Onboarding wallet timeouts",
      mentions: 14,
      summary:
        "Validators report the wallet handshake fails on the second screen. Most cite the 30s timeout on the Sui Wallet popup before they can sign the Seal session key.",
      delta: { value: "+9", up: true, span: "vs last week" },
      sources: [
        { label: "devnet · q2", subs: 9 },
        { label: "validator pulse · may", subs: 5 },
      ],
    },
    {
      dot: 4,
      title: "Seal decrypt feels manual",
      mentions: 9,
      summary:
        'Power-users want a one-click "decrypt all" instead of approving each submission individually. Two suggested a batch endpoint.',
      delta: { value: "+3", up: true, span: "vs last week" },
      sources: [{ label: "seal · beta", subs: 9 }],
    },
    {
      dot: 1,
      title: "NPS rebound +12%",
      mentions: 41,
      summary:
        "April-cohort NPS jumped from 28 → 40. Free-text comments tag the new threshold-decrypt flow and gas sponsorship as the reasons.",
      delta: { value: "+12%", up: true, span: "vs march" },
      sources: [{ label: "nps · april", subs: 41 }],
    },
  ],
  tail: "One outlier worth eyeballing: a single submission on the seal · beta form mentions a private-key leak risk — flag as critical and review by hand.",
};

const TIER_COLORS = ["#0A0A0A", "#4DA2FF", "#A06EE9", "#6CD3D6", "#E8A540"];

function shortFormLabel(title: string | null | undefined): string {
  if (!title) return "—";
  return title
    .replace(/Echo · /, "")
    .replace(/Compliance · /, "")
    .replace(/Customer NPS · /i, "nps · ")
    .toLowerCase()
    .slice(0, 24);
}

function mapResponseToThread(
  question: string,
  resp: QueryResponse,
  formTitle: string | null,
): DisplayThread {
  const themes = resp.structured?.themes ?? [];
  const citations = resp.structured?.citations ?? [];
  // Build a quick id → excerpt map so we can pull plausible sources
  // (citation excerpts) per theme. Sentiment → tier color via a fixed
  // mapping so the dot reads consistently.
  const sentimentDot: Record<ThemeT["sentiment"], number> = {
    positive: 1,
    neutral: 0,
    mixed: 2,
    negative: 4,
  };
  const bullets: DisplayBullet[] = themes.slice(0, 4).map((t) => {
    // pick up to 2 citations whose id appears in theme.citationIds
    const myCites = citations
      .filter((c) =>
        t.citationIds.some(
          (id) =>
            c.submissionId.toLowerCase().includes(id.toLowerCase()) ||
            id.toLowerCase().includes(c.submissionId.toLowerCase()),
        ),
      )
      .slice(0, 2);
    return {
      dot: sentimentDot[t.sentiment] ?? 0,
      title: t.label,
      mentions: t.count,
      summary: myCites[0]?.excerpt ?? "",
      sources: myCites.length
        ? myCites.map((c) => ({
            label: shortFormLabel(formTitle),
            subs: c.excerpt.length > 0 ? 1 : t.count,
          }))
        : [{ label: shortFormLabel(formTitle), subs: t.count }],
    };
  });

  // Lead: first sentence of answer, with first 2 themes wrapped in **bold**
  const answer = (resp.answer ?? "").trim();
  const firstSentence = answer.split(/(?<=[.!?])\s+/)[0] ?? answer.slice(0, 200);
  const top2 = themes.slice(0, 2).map((t) => t.label);
  let lead = firstSentence;
  for (const phrase of top2) {
    if (!phrase) continue;
    const re = new RegExp(`(${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i");
    lead = lead.replace(re, "**$1**");
  }
  if (!lead) lead = `Synthesized from ${resp.memoriesUsed ?? 0} submissions.`;

  return {
    question,
    askedAt: "just now",
    model: `memwal · ${process.env.NEXT_PUBLIC_OPENROUTER_MODEL ?? "gpt"}`,
    sources: themes.length,
    lead,
    bullets:
      bullets.length > 0
        ? bullets
        : [
            {
              dot: 0,
              title: "No themes surfaced",
              mentions: resp.memoriesUsed ?? 0,
              summary:
                "The model didn't extract structured themes for this query. Try rewording — narrower questions tend to surface cleaner themes.",
              sources: [{ label: shortFormLabel(formTitle), subs: resp.memoriesUsed ?? 0 }],
            },
          ],
    tail: resp.structured?.outlier?.why ?? undefined,
  };
}

// ─────────────────────────────────────────────────────────────────
// Real-data hook — fetch user's owned forms for the picker chip
// ─────────────────────────────────────────────────────────────────

interface OnChainForm {
  metadata_blob_id: string;
  privacy_tier: number;
}
interface OwnedCap {
  objectId: string;
  json: { form_id?: string };
}

function useOwnedForms() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;
  const demoMode = useDemoAdminMode();
  const demoAddress = clientConfig.DEMO_ADMIN_ADDRESS;
  const ownerAddress = demoMode ? demoAddress : account?.address;

  return useQuery({
    queryKey: ["echo", "dashboard-forms", ownerAddress, demoMode],
    queryFn: async () => {
      if (!ownerAddress) return [] as Array<{ id: string; title: string }>;
      const capType = `${packageId}::form::FormOwnerCap`;
      const owned = await suiClient.listOwnedObjects({
        owner: ownerAddress,
        type: capType,
        include: { json: true },
        limit: 200,
      });
      const caps = owned.objects as unknown as OwnedCap[];
      const formIds = Array.from(
        new Set(caps.map((c) => c.json?.form_id).filter((id): id is string => !!id)),
      );
      if (formIds.length === 0) return [];
      const objs = await suiClient.getObjects({
        objectIds: formIds,
        include: { json: true },
      });
      const network = clientConfig.WALRUS_NETWORK;
      const items = await Promise.all(
        objs.objects.map(async (obj) => {
          const asUnknown = obj as unknown as Record<string, unknown>;
          if ("error" in asUnknown) return null;
          const fobj = obj as unknown as { objectId: string; json: OnChainForm };
          let title = `Form ${fobj.objectId.slice(0, 10)}…`;
          try {
            const m = await readJsonViaAggregator<FormMetadata>(
              fobj.json.metadata_blob_id,
              { network },
            );
            title = m.title;
          } catch {
            /* keep fallback */
          }
          return { id: fobj.objectId, title };
        }),
      );
      return items.filter((x): x is { id: string; title: string } => x !== null);
    },
    enabled: !!ownerAddress && packageId.startsWith("0x"),
    staleTime: 30_000,
  });
}

// ─────────────────────────────────────────────────────────────────
// Visual primitives
// ─────────────────────────────────────────────────────────────────

function Mono({
  children,
  size = 11,
  color = "var(--echo-mut)",
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
}) {
  return (
    <span className="echo-mono" style={{ fontSize: size, color }}>
      {children}
    </span>
  );
}

function fmtLead(text: string) {
  // Split on **bold** sequences, render each as <strong> with the
  // spec's yellow highlight band.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong
          key={i}
          style={{
            fontWeight: 500,
            backgroundImage:
              "linear-gradient(120deg, #E8FF75 0%, #FCFF9A 100%)",
            backgroundSize: "100% 38%",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "0 88%",
            padding: "0 0.06em",
          }}
        >
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

function fmtHeadline(text: string, highlights: string[]) {
  let out = text;
  for (const h of highlights) {
    if (!h) continue;
    const re = new RegExp(
      `(${h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "i",
    );
    out = out.replace(re, "::HL::$1::/HL::");
  }
  const segments = out.split(/(::HL::[^]*?::\/HL::)/g);
  return segments.map((s, i) => {
    const m = s.match(/^::HL::([^]*?)::\/HL::$/);
    if (m) {
      return (
        <span
          key={i}
          style={{
            backgroundImage:
              "linear-gradient(120deg, #E8FF75 0%, #FCFF9A 100%)",
            backgroundSize: "100% 38%",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "0 88%",
            padding: "0 0.06em",
          }}
        >
          {m[1]}
        </span>
      );
    }
    return <React.Fragment key={i}>{s}</React.Fragment>;
  });
}

function ActionBtn({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <button
      type="button"
      title={title}
      style={{
        width: 30,
        height: 30,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid var(--echo-rail)",
        borderRadius: 8,
        color: "var(--echo-mut)",
        background: "var(--echo-paper)",
        fontSize: 13,
        cursor: "pointer",
        transition: "all 140ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--echo-ink)";
        e.currentTarget.style.color = "var(--echo-ink)";
        e.currentTarget.style.background = "var(--echo-rail-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--echo-rail)";
        e.currentTarget.style.color = "var(--echo-mut)";
        e.currentTarget.style.background = "var(--echo-paper)";
      }}
    >
      {children}
    </button>
  );
}

function AnswerCard({ thread }: { thread: DisplayThread }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background: "var(--echo-paper)",
        border: "2px solid var(--echo-ink)",
        borderRadius: 18,
        boxShadow: "var(--echo-brut-shadow)",
        padding: "28px 32px 24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* aurora ribbon — shimmers */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 4,
          background: "var(--echo-aurora-plate)",
          animation: "answer-shimmer 5s ease-in-out infinite",
        }}
      />
      <style jsx global>{`
        @keyframes answer-shimmer {
          0%, 100% { filter: brightness(1) saturate(1); }
          50%      { filter: brightness(1.2) saturate(1.3); }
        }
      `}</style>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <Mono size={10} color="var(--echo-ink)">
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: "#22C55E",
              display: "inline-block",
              boxShadow: "0 0 0 3px rgba(34,197,94,0.18)",
              marginRight: 6,
            }}
          />
          answer · synthesized from {thread.sources} form{thread.sources === 1 ? "" : "s"}
        </Mono>
        <div style={{ display: "flex", gap: 6 }}>
          <ActionBtn title="copy">▢</ActionBtn>
          <ActionBtn title="pin">★</ActionBtn>
          <ActionBtn title="export">↗</ActionBtn>
        </div>
      </header>
      <p
        style={{
          fontSize: 17,
          lineHeight: 1.5,
          color: "var(--echo-ink)",
          margin: "0 0 22px",
          textWrap: "pretty" as never,
        }}
      >
        {fmtLead(thread.lead)}
      </p>
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        {thread.bullets.map((b, idx) => (
          <li
            key={idx}
            style={{
              display: "grid",
              gridTemplateColumns: "36px 1fr",
              gap: 14,
              alignItems: "start",
              paddingTop: idx === 0 ? 0 : 18,
              borderTop: idx === 0 ? "none" : "1px dashed var(--echo-rail)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                paddingTop: 4,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 14,
                  height: 14,
                  background: TIER_COLORS[b.dot] ?? "var(--echo-ink)",
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--echo-ink)",
                }}
              >
                {idx + 1}
              </span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                  marginBottom: 4,
                }}
              >
                <h4
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontWeight: 500,
                    letterSpacing: "-0.025em",
                    fontSize: 19,
                    lineHeight: 1.2,
                    color: "var(--echo-ink)",
                    margin: 0,
                  }}
                >
                  {b.title}
                </h4>
                <span
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "var(--echo-mut)",
                    padding: "2px 8px",
                    background: "var(--echo-rail-2)",
                    borderRadius: 999,
                  }}
                >
                  {b.mentions} mentions
                </span>
                {b.delta && (
                  <span
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      padding: "2px 8px",
                      borderRadius: 999,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      background: b.delta.up
                        ? "var(--echo-success-bg)"
                        : "#FEE2E2",
                      color: b.delta.up
                        ? "var(--echo-success)"
                        : "var(--echo-danger)",
                    }}
                  >
                    {b.delta.up ? "▲" : "▼"} {b.delta.value}
                    <em
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontStyle: "normal",
                        color: "var(--echo-mut-2)",
                        marginLeft: 6,
                      }}
                    >
                      {b.delta.span}
                    </em>
                  </span>
                )}
              </div>
              {b.summary && (
                <p
                  style={{
                    margin: "4px 0 12px",
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: "#404040",
                    textWrap: "pretty" as never,
                  }}
                >
                  {b.summary}
                </p>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                <Mono size={9} color="var(--echo-mut)">
                  cites
                </Mono>
                {b.sources.map((s) => (
                  <span
                    key={`${s.label}-${s.subs}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 8px 4px 4px",
                      border: "1px solid var(--echo-rail)",
                      borderRadius: 999,
                      background: "var(--echo-paper)",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 10,
                        fontWeight: 600,
                        background: "var(--echo-ink)",
                        color: "var(--echo-paper)",
                        padding: "2px 6px",
                        borderRadius: 999,
                        letterSpacing: "0.04em",
                      }}
                    >
                      {s.subs}
                    </span>
                    <span
                      style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 10,
                        fontWeight: 500,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: "var(--echo-ink)",
                      }}
                    >
                      {s.label}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--echo-mut)" }}>↗</span>
                  </span>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {thread.tail && (
        <p
          style={{
            margin: "22px 0 18px",
            padding: "12px 14px",
            background: "#FFFBEB",
            border: "1px solid #FBE3A6",
            borderRadius: 10,
            fontSize: 13.5,
            color: "var(--echo-warn)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            textWrap: "pretty" as never,
          }}
        >
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--echo-warn)",
              background: "var(--echo-paper)",
              border: "1px solid #FBE3A6",
              borderRadius: 4,
              padding: "2px 6px",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            ⚠ also flagged
          </span>
          <span>{thread.tail}</span>
        </p>
      )}
      <footer
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 16,
          borderTop: "1px solid var(--echo-rail-2)",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Mono size={9} color="var(--echo-mut-2)">
          {thread.model} · {thread.bullets.length} themes ·{" "}
          {thread.bullets.reduce((a, b) => a + b.mentions, 0)} mentions
        </Mono>
        <div style={{ display: "flex", gap: 10 }}>
          <Mono size={9} color="var(--echo-mut)">
            rate this answer
          </Mono>
          <button
            type="button"
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              padding: "3px 8px",
              border: "1px solid var(--echo-rail)",
              borderRadius: 999,
              background: "var(--echo-paper)",
              color: "var(--echo-ink)",
              cursor: "pointer",
              letterSpacing: "0.06em",
              fontWeight: 600,
            }}
          >
            ▲ good
          </button>
          <button
            type="button"
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              padding: "3px 8px",
              border: "1px solid var(--echo-rail)",
              borderRadius: 999,
              background: "var(--echo-paper)",
              color: "var(--echo-mut)",
              cursor: "pointer",
              letterSpacing: "0.06em",
              fontWeight: 600,
            }}
          >
            ▼ off
          </button>
        </div>
      </footer>
    </motion.article>
  );
}

// ─────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────

export function EchoAnswerThread({ activeQuestion }: { activeQuestion?: string }) {
  const owned = useOwnedForms();
  const forms = owned.data ?? [];
  // Form picker — defaults to "all", which the query route handles
  // by fanning out to every owned form's namespace.
  const [selectedFormId, setSelectedFormId] = useState<string>("all");

  const askMutation = useMutation({
    mutationFn: async ({ formId, question }: { formId: string; question: string }) => {
      const isCrossForm = formId === "all";
      const body = isCrossForm
        ? {
            formIds: forms.map((f) => f.id),
            question,
            scope: "all",
          }
        : { formId, question, scope: "all" };
      const resp = await fetch(apiUrl("/api/insights/query"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await resp.json()) as QueryResponse;
      if (!resp.ok) throw new Error(data.error ?? `HTTP ${resp.status}`);
      return data;
    },
  });

  // Fire when activeQuestion changes
  useEffect(() => {
    const q = activeQuestion?.trim();
    if (!q) return;
    if (forms.length === 0 && selectedFormId === "all") return; // wait for forms
    askMutation.mutate({ formId: selectedFormId, question: q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQuestion, selectedFormId]);

  const thread: DisplayThread = useMemo(() => {
    if (askMutation.data) {
      return mapResponseToThread(
        activeQuestion ?? "",
        askMutation.data,
        askMutation.data.formTitle ?? null,
      );
    }
    return DEMO_THREAD;
  }, [askMutation.data, activeQuestion]);

  const isAsking = askMutation.isPending;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Q header */}
      <header style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            border: "2px solid var(--echo-ink)",
            background: "var(--echo-paper)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            boxShadow: "var(--echo-brut-shadow-sm)",
            flexShrink: 0,
          }}
        >
          <WalrusMascot pose="monogram" size={40} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Mono size={10} color="var(--echo-mut-2)">
            you asked · {isAsking ? "asking…" : thread.askedAt} · {thread.model} ·{" "}
            {thread.sources} source{thread.sources === 1 ? "" : "s"}
          </Mono>
          <h2
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              letterSpacing: "-0.035em",
              fontSize: "clamp(28px, 3.4vw, 42px)",
              lineHeight: 1.1,
              margin: "6px 0 0",
              color: "var(--echo-ink)",
              textWrap: "balance" as never,
            }}
          >
            {fmtHeadline(thread.question, [
              thread.question.split(" ").find((w) => w.length > 6) ?? "",
            ])}
          </h2>
        </div>
      </header>

      {/* Form picker chip — small, sits above the answer card */}
      {forms.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <Mono size={9} color="var(--echo-mut)">
            scope
          </Mono>
          <button
            type="button"
            data-active={selectedFormId === "all"}
            className="echo-pill"
            onClick={() => setSelectedFormId("all")}
          >
            all my forms ({forms.length})
          </button>
          {forms.slice(0, 4).map((f) => (
            <button
              key={f.id}
              type="button"
              data-active={selectedFormId === f.id}
              className="echo-pill"
              onClick={() => setSelectedFormId(f.id)}
              style={{ maxWidth: 220 }}
            >
              <span
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 180,
                  display: "inline-block",
                  textTransform: "none",
                  letterSpacing: 0,
                  fontFamily: "Inter, sans-serif",
                  fontSize: 11,
                  fontWeight: 500,
                }}
              >
                {f.title}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Answer card */}
      <AnswerCard thread={thread} />

      {isAsking && (
        <Mono size={10} color="var(--echo-mut)">
          memwal · recalling · synthesizing
        </Mono>
      )}
      {askMutation.error && (
        <p
          style={{
            margin: 0,
            padding: "10px 14px",
            border: "1px solid #FECACA",
            background: "#FEF2F2",
            color: "var(--echo-danger)",
            fontSize: 13,
            borderRadius: 10,
          }}
        >
          {(askMutation.error as Error).message}
        </p>
      )}
    </div>
  );
}
