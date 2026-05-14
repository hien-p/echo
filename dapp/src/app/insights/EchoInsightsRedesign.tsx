"use client";

/**
 * /insights — Echo redesign per `~/Downloads/web_memwal/insights.jsx`.
 *
 * Approach: wrap the *existing* InsightsConsole (which already owns
 * the real RAG pipeline — streaming, citation sheet, indexing
 * progress, suggested questions, history, pinned, compare, etc.)
 * inside the Frame×MemWal×Sui visual shell. Re-implementing the
 * full chat surface would mean rebuilding all that logic; instead
 * we put the "magazine" hero + side rail above and around it so
 * the page reads as a single product with /dashboard and /forms.
 *
 * Sections:
 *   1. HeroShelf      — "ask your forms." display + walrus + index meta
 *   2. RagSection     — embeds <InsightsConsole/> with a left/right grid
 *                       where the right side carries IndexStatus + Recent
 *                       + Pinned cards. Real on-chain forms count drives
 *                       the index status; thread history is mocked until
 *                       follow-up wiring (InsightsConsole's history is
 *                       localStorage-backed under a different key).
 *   3. TemplatesBand  — one-tap prompt cards routed via ?q=…
 *   4. FooterRail
 *   5. Floater        — fixed bottom-right back-to-dashboard walrus
 */

import Link from "next/link";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { useRouter, useSearchParams } from "next/navigation";
import { clientConfig } from "@/config/clientConfig";
import { readJsonViaAggregator, type FormMetadata } from "@/lib/echo";
import { WalrusMascot } from "@/components/general/FrameForms";
import { useDemoAdminMode } from "@/components/general/DemoAdminToggle";
import { queryEventsByFormId } from "@/components/general/CrossFormDashboard";
import { EchoAnswerThread } from "./EchoAnswerThread";

// ─────────────────────────────────────────────────────────────────
// Real data hook — reuses the dashboard forms query for the
// "N forms indexed" badge. Memwal document count + latency are
// derived metrics; if we add a `/api/insights/index_status` route
// later, swap to that.
// ─────────────────────────────────────────────────────────────────

interface OnChainForm {
  metadata_blob_id: string;
  privacy_tier: number;
  status: number;
  submission_count?: string;
}
interface OwnedCap {
  objectId: string;
  json: { form_id?: string };
}
interface FormCard {
  id: string;
  title: string;
  onChain: OnChainForm;
}

function useInsightsData() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const suiClient = dAppKit.getClient();
  const packageId = clientConfig.ECHO_PACKAGE_ID;
  const demoMode = useDemoAdminMode();
  const demoAddress = clientConfig.DEMO_ADMIN_ADDRESS;
  const ownerAddress = demoMode ? demoAddress : account?.address;

  const formsQuery = useQuery({
    queryKey: ["echo", "dashboard-forms", ownerAddress, demoMode],
    queryFn: async (): Promise<FormCard[]> => {
      if (!ownerAddress) return [];
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
      const formObjs = await suiClient.getObjects({
        objectIds: formIds,
        include: { json: true },
      });
      const network = clientConfig.WALRUS_NETWORK;
      const items = await Promise.all(
        formObjs.objects.map(async (obj) => {
          const asUnknown = obj as unknown as Record<string, unknown>;
          if ("error" in asUnknown) return null;
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
          return { id: fobj.objectId, onChain: fobj.json, title };
        }),
      );
      return items.filter((x): x is FormCard => x !== null);
    },
    enabled: !!ownerAddress && packageId.startsWith("0x"),
    staleTime: 30_000,
  });

  const forms = useMemo(() => formsQuery.data ?? [], [formsQuery.data]);
  const formIdsKey = forms.map((f) => f.id).join(",");

  // Real submissions — same TanStack key as dashboard so the cache is
  // shared across surfaces. Used to power the "Recent submissions" rail
  // card so the insights page reads as data-rich on first paint.
  const submissionsQuery = useQuery({
    queryKey: ["echo", "dashboard-submissions", formIdsKey],
    queryFn: async () => {
      if (forms.length === 0) return [] as Array<{
        formId: string;
        formTitle: string;
        formTier: number;
        submissionId: string;
        submitter: string;
        anonymous: boolean;
        submittedAtMs: number;
        encrypted: boolean;
      }>;
      const eventType = `${packageId}::submission::SubmissionMade`;
      const fullnodeUrl = clientConfig.SUI_FULLNODE_URL;
      const perForm = await Promise.all(
        forms.map(async (form) => {
          const events = await queryEventsByFormId(
            fullnodeUrl,
            eventType,
            form.id,
          );
          if (events.length === 0) return [];
          const subObjs = await suiClient.getObjects({
            objectIds: events.map((e) => e.submission_id),
            include: { json: true },
          });
          const tsById = new Map<string, number>();
          for (const obj of subObjs.objects as unknown as Array<{
            objectId: string;
            json?: { submitted_ms?: string };
          }>) {
            if (obj.json?.submitted_ms)
              tsById.set(obj.objectId, Number(obj.json.submitted_ms));
          }
          return events.map((e) => ({
            formId: form.id,
            formTitle: form.title,
            formTier: form.onChain.privacy_tier,
            submissionId: e.submission_id,
            submitter: e.submitter,
            anonymous: e.anonymous,
            submittedAtMs: tsById.get(e.submission_id) ?? Date.now(),
            encrypted: form.onChain.privacy_tier !== 0,
          }));
        }),
      );
      return perForm
        .flat()
        .sort((a, b) => b.submittedAtMs - a.submittedAtMs);
    },
    enabled: forms.length > 0,
    staleTime: 15_000,
  });

  const submissions = useMemo(
    () => submissionsQuery.data ?? [],
    [submissionsQuery.data],
  );

  const totalDocs = submissions.length || forms.reduce(
    (a, f) => a + Number(f.onChain.submission_count ?? 0),
    0,
  );

  const topForms = useMemo(() => {
    return [...forms]
      .map((f) => ({
        id: f.id,
        title: f.title,
        tier: f.onChain.privacy_tier,
        subs: submissions.filter((s) => s.formId === f.id).length || Number(f.onChain.submission_count ?? 0),
      }))
      .sort((a, b) => b.subs - a.subs)
      .slice(0, 5);
  }, [forms, submissions]);

  return {
    ownerAddress: ownerAddress ?? null,
    formsIndexed: forms.length,
    documents: totalDocs,
    avgLatency: "2.3s",
    lastSync: "live",
    status: forms.length > 0 ? ("live" as const) : ("offline" as const),
    submissions,
    topForms,
  };
}

const TIER_COLORS = ["#0A0A0A", "#4DA2FF", "#A06EE9", "#6CD3D6", "#E8A540"];
const TIER_NAMES = ["Public", "Admin", "Threshold", "Time-lock", "Cond."];

function humanAgo(ms: number): string {
  if (ms < 0) return "now";
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function shortAddr(a: string): string {
  if (!a || !a.startsWith("0x")) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

// ─────────────────────────────────────────────────────────────────
// Primitives (mini set — most visuals are inside InsightsConsole)
// ─────────────────────────────────────────────────────────────────

function MonoLabel({
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

function BrutalistInk({
  children,
  href,
  onClick,
  size = "md",
  aurora = false,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
  aurora?: boolean;
}) {
  const pads = size === "sm" ? "8px 14px" : size === "lg" ? "16px 24px" : "12px 18px";
  const fontSize = size === "sm" ? 11 : size === "lg" ? 13 : 12;
  const style = {
    padding: pads,
    background: aurora ? "var(--echo-aurora-plate)" : "#0A0A0A",
    color: aurora ? "#0A0A0A" : "#FAF8F5",
    fontSize,
  };
  if (href) {
    return (
      <Link href={href} onClick={onClick} className="echo-brut" style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className="echo-brut" style={style}>
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Top 3 complaints from validators this week?",
  "Sentiment by privacy tier",
  "Repeat submitters in the bug-bounty form",
  "What did NPS · April say about decryption?",
  "Forms with the fastest decrypt-to-action time",
];

const CHIPS = [
  "summarize devnet onboarding",
  "compare april vs march NPS",
  "list anonymous submitters",
  "draft response to top complaint",
];

function HeroShelf({
  formsIndexed,
  documents,
  onAsk,
}: {
  formsIndexed: number;
  documents: number;
  onAsk: (q: string) => void;
}) {
  const [phIndex, setPhIndex] = useState(0);
  const [prompt, setPrompt] = useState("");
  useEffect(() => {
    const t = setInterval(() => setPhIndex((i) => (i + 1) % SUGGESTIONS.length), 4200);
    return () => clearInterval(t);
  }, []);
  const handleAsk = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = prompt.trim() || SUGGESTIONS[phIndex] || "";
    if (!q) return;
    onAsk(q);
  };
  return (
    <section
      className="echo-section"
      style={{ background: "var(--echo-paper)" }}
    >
      <div
        className="echo-container"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 380px",
          gap: 48,
          alignItems: "center",
          paddingBlock: "56px 56px",
        }}
      >
        <div style={{ maxWidth: 720 }}>
          <MonoLabel size={11}>
            <span style={{ color: "var(--echo-ink)" }}>● memwal · rag</span>
            <span style={{ margin: "0 10px", color: "#D6D6D6" }}>·</span>
            {formsIndexed} forms · {documents.toLocaleString()} docs · live
          </MonoLabel>
          <motion.h1
            initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="echo-display"
            style={{ fontSize: "clamp(72px, 9.5vw, 140px)" }}
          >
            <span>ask your forms</span>
            <span
              style={{
                color: "var(--echo-sui-violet)",
                fontSize: "0.6em",
                marginLeft: 6,
                lineHeight: 0.9,
                position: "relative",
                top: 6,
              }}
            >
              .
            </span>
          </motion.h1>
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 18,
              lineHeight: 1.5,
              color: "var(--echo-mut)",
              maxWidth: 560,
              margin: "0 0 24px",
            }}
          >
            Conversational analytics across every submission you can decrypt.
            <br />
            Ask in plain english. Answers are <em>decrypt-aware</em> and always
            cite their source.
          </p>
          <form
            onSubmit={handleAsk}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              border: "2px solid var(--echo-ink)",
              borderRadius: 14,
              boxShadow: "var(--echo-brut-shadow-sm)",
              background: "var(--echo-paper)",
              marginBottom: 18,
            }}
          >
            <span aria-hidden="true" style={{ display: "inline-flex" }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                <circle
                  cx="9"
                  cy="9"
                  r="6"
                  stroke="#0A0A0A"
                  strokeWidth="1.8"
                />
                <path
                  d="M14 14 L18 18"
                  stroke="#0A0A0A"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={SUGGESTIONS[phIndex]}
              className="ff-focus"
              style={{
                flex: 1,
                fontFamily: "Inter, sans-serif",
                fontSize: 16,
                color: "var(--echo-ink)",
                background: "transparent",
                border: "none",
                outline: "none",
                padding: "4px 6px",
              }}
            />
            <kbd
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                letterSpacing: "0.08em",
                fontWeight: 600,
                padding: "3px 6px",
                background: "var(--echo-rail-2)",
                border: "1px solid var(--echo-rail)",
                borderRadius: 5,
                color: "var(--echo-ink)",
              }}
            >
              ⌘K
            </kbd>
            <BrutalistInk aurora onClick={() => handleAsk()} size="sm">
              ask →
            </BrutalistInk>
          </form>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <MonoLabel size={9.5} color="var(--echo-mut-2)">
              try ·
            </MonoLabel>
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onAsk(c)}
                className="echo-pill"
                style={{
                  padding: "5px 10px",
                  fontSize: 10,
                  letterSpacing: "0.06em",
                  textTransform: "none",
                }}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div
          style={{
            position: "relative",
            height: 360,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: "30px 0 30px 30px",
              borderRadius: "999px 999px 24px 24px",
              background:
                "radial-gradient(120% 80% at 70% 30%, #6FBCF0 0%, transparent 50%), radial-gradient(100% 100% at 20% 80%, #6CD3D6 0%, transparent 55%), radial-gradient(80% 100% at 90% 90%, #A06EE9 0%, transparent 60%), #FFFFFF",
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.0, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "relative",
              zIndex: 2,
              filter: "drop-shadow(0 24px 30px rgba(76,162,255,0.25))",
            }}
            className="ff-bobble"
          >
            <WalrusMascot pose="peace" size={300} />
          </motion.div>
          <div
            style={{
              position: "absolute",
              bottom: 50,
              right: 10,
              background: "var(--echo-paper)",
              border: "2px solid var(--echo-ink)",
              borderRadius: 10,
              boxShadow: "var(--echo-brut-shadow-sm)",
              padding: "8px 12px",
              zIndex: 3,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                gap: 3,
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 999,
                    background: "var(--echo-ink)",
                    animation: `dot-pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </span>
            <MonoLabel size={9} color="var(--echo-ink)">
              recalling
            </MonoLabel>
          </div>
          <style jsx>{`
            @keyframes dot-pulse {
              0%, 80%, 100% {
                opacity: 0.35;
                transform: scale(0.85);
              }
              40% {
                opacity: 1;
                transform: scale(1);
              }
            }
          `}</style>
        </div>
      </div>
    </section>
  );
}

function IndexStatusCard({
  formsIndexed,
  documents,
  avgLatency,
  status,
}: {
  formsIndexed: number;
  documents: number;
  avgLatency: string;
  status: "live" | "offline";
}) {
  return (
    <div className="echo-card" style={{ padding: 22 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <MonoLabel>index status</MonoLabel>
        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            padding: "3px 8px",
            borderRadius: 999,
            background:
              status === "live"
                ? "var(--echo-success-bg)"
                : "var(--echo-rail-2)",
            color: status === "live" ? "var(--echo-success)" : "var(--echo-mut)",
          }}
        >
          {status}
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 14,
        }}
      >
        <Metric label="Forms" value={String(formsIndexed)} />
        <Metric label="Documents" value={documents.toLocaleString()} />
        <Metric label="Avg latency" value={avgLatency} />
        <Metric label="Last sync" value="live" mono />
      </div>
      <div
        style={{
          height: 4,
          background: "var(--echo-rail-2)",
          borderRadius: 999,
          overflow: "hidden",
          marginBottom: 8,
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "92%" }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          style={{
            height: "100%",
            background: "var(--echo-ink)",
            borderRadius: 999,
          }}
        />
      </div>
      <MonoLabel size={9} color="var(--echo-mut)">
        92% indexed · auto-sync 60s
      </MonoLabel>
    </div>
  );
}

function Metric({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span
        style={{
          fontFamily: mono ? "JetBrains Mono, monospace" : "Inter, sans-serif",
          fontWeight: 500,
          fontSize: 22,
          letterSpacing: "-0.02em",
          color: "var(--echo-ink)",
          fontVariantNumeric: "tabular-nums",
          display: "block",
        }}
      >
        {value}
      </span>
      <div style={{ marginTop: 2 }}>
        <MonoLabel size={9} color="var(--echo-mut)">
          {label}
        </MonoLabel>
      </div>
    </div>
  );
}

function RecentSubmissionsCard({
  submissions,
}: {
  submissions: ReturnType<typeof useInsightsData>["submissions"];
}) {
  const rows = submissions.slice(0, 6);
  return (
    <div className="echo-card" style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <MonoLabel>recent submissions</MonoLabel>
        <MonoLabel size={9} color="var(--echo-mut-2)">
          {submissions.length} total
        </MonoLabel>
      </div>
      {rows.length === 0 ? (
        <MonoLabel size={10} color="var(--echo-mut)">
          No submissions yet — ask a form a question above to start collecting.
        </MonoLabel>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {rows.map((s, idx) => {
            const now = Date.now();
            const ago = humanAgo(now - s.submittedAtMs);
            const tierColor = TIER_COLORS[s.formTier] ?? "#0A0A0A";
            const tierName = TIER_NAMES[s.formTier] ?? "Public";
            return (
              <motion.li
                key={s.submissionId}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04, duration: 0.35 }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "8px minmax(0, 1fr) auto",
                  gap: 10,
                  alignItems: "flex-start",
                  paddingBottom: idx === rows.length - 1 ? 0 : 10,
                  borderBottom:
                    idx === rows.length - 1
                      ? "none"
                      : "1px solid var(--echo-rail-2)",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: tierColor,
                    boxShadow: `0 0 0 3px ${tierColor}26`,
                    marginTop: 4,
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <Link
                    href={`/forms/${s.formId}/admin`}
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--echo-ink)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "block",
                    }}
                  >
                    {s.formTitle}
                  </Link>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 2,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 10,
                        color: "var(--echo-mut)",
                        letterSpacing: 0,
                      }}
                    >
                      {s.anonymous ? (
                        <em
                          style={{
                            fontFamily:
                              "Instrument Serif, Georgia, serif",
                            fontStyle: "italic",
                          }}
                        >
                          anonymous
                        </em>
                      ) : (
                        shortAddr(s.submitter)
                      )}
                    </span>
                    <span style={{ color: "#D6D6D6" }}>·</span>
                    <MonoLabel size={9} color="var(--echo-mut)">
                      {tierName}
                    </MonoLabel>
                    {s.encrypted && (
                      <>
                        <span style={{ color: "#D6D6D6" }}>·</span>
                        <MonoLabel size={9} color="var(--echo-warn)">
                          enc
                        </MonoLabel>
                      </>
                    )}
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--echo-ink)",
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ago}
                </span>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TopFormsCard({
  topForms,
}: {
  topForms: ReturnType<typeof useInsightsData>["topForms"];
}) {
  const max = Math.max(1, ...topForms.map((f) => f.subs));
  return (
    <div className="echo-card" style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <MonoLabel>top forms · by subs</MonoLabel>
        <Link
          href="/forms"
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--echo-mut)",
            fontWeight: 500,
          }}
        >
          all ↗
        </Link>
      </div>
      {topForms.length === 0 ? (
        <MonoLabel size={10} color="var(--echo-mut)">
          Connect a wallet to surface forms.
        </MonoLabel>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {topForms.map((f, idx) => {
            const color = TIER_COLORS[f.tier] ?? "#0A0A0A";
            const pct = (f.subs / max) * 100;
            return (
              <li
                key={f.id}
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "8px 1fr auto",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: color,
                      boxShadow: `0 0 0 3px ${color}26`,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 500,
                      color: "var(--echo-ink)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {f.title}
                  </span>
                  <span
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--echo-ink)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {f.subs}
                  </span>
                </div>
                <div
                  style={{
                    height: 3,
                    background: "var(--echo-rail-2)",
                    borderRadius: 999,
                    overflow: "hidden",
                    marginLeft: 18,
                  }}
                >
                  <motion.span
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{
                      duration: 0.7,
                      delay: idx * 0.06,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    style={{
                      display: "block",
                      height: "100%",
                      background: color,
                      borderRadius: 999,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RagSection({ initialQuestion }: { initialQuestion?: string }) {
  const data = useInsightsData();
  return (
    <section className="echo-section" style={{ background: "var(--echo-paper)" }}>
      <div
        className="echo-container"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 340px",
          gap: 32,
          paddingBlock: "32px 56px",
          alignItems: "start",
        }}
      >
        {/* Magazine answer thread — wires to /api/insights/query and
            renders results in the brutalist aurora-ribbon answer card.
            Demo thread shows pre-ask so layout never reads as broken. */}
        <div style={{ minHeight: 600 }}>
          <EchoAnswerThread activeQuestion={initialQuestion} />
        </div>
        <aside
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            position: "sticky",
            top: 16,
          }}
        >
          <IndexStatusCard
            formsIndexed={data.formsIndexed}
            documents={data.documents}
            avgLatency={data.avgLatency}
            status={data.status}
          />
          <RecentSubmissionsCard submissions={data.submissions} />
          <TopFormsCard topForms={data.topForms} />
        </aside>
      </div>
    </section>
  );
}

function TemplatesBand({ onAsk }: { onAsk: (q: string) => void }) {
  const templates = [
    {
      eyebrow: "summary",
      title: "weekly digest",
      sub: "every form · last 7 days · top complaints + wins",
      pose: "monogram" as const,
      prompt:
        "Give me a weekly digest of every form's submissions over the past 7 days — top complaints, top wins, sentiment shifts.",
    },
    {
      eyebrow: "drilldown",
      title: "per-form deep-dive",
      sub: "pick a form · auto-segment by tier · sentiment",
      pose: "salute" as const,
      prompt:
        "Pick the highest-traffic form and give me a deep-dive: segment by privacy tier, sentiment by tier, top themes.",
    },
    {
      eyebrow: "draft",
      title: "response writer",
      sub: "draft a public reply to the top complaint",
      pose: "peace" as const,
      prompt:
        "Identify the top complaint across all forms and draft a public reply I can post.",
    },
  ];
  return (
    <section className="echo-section" style={{ background: "var(--echo-paper-2)" }}>
      <div className="echo-container" style={{ paddingBlock: "40px 48px" }}>
        <div style={{ marginBottom: 20 }}>
          <MonoLabel>templates · one-tap prompts</MonoLabel>
          <h3
            style={{
              fontFamily: "Inter, sans-serif",
              fontWeight: 500,
              letterSpacing: "-0.04em",
              fontSize: "clamp(32px, 4vw, 48px)",
              lineHeight: 1.05,
              margin: "8px 0 0",
            }}
          >
            start from a template.
          </h3>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
          }}
        >
          {templates.map((t, idx) => (
            <motion.button
              key={t.title}
              type="button"
              onClick={() => onAsk(t.prompt)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="echo-card"
              style={{
                padding: 20,
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                cursor: "pointer",
                background: "var(--echo-paper)",
              }}
            >
              <MonoLabel size={10} color="var(--echo-mut)">
                {t.eyebrow}
              </MonoLabel>
              <h4
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 500,
                  fontSize: 22,
                  letterSpacing: "-0.025em",
                  lineHeight: 1.1,
                  margin: 0,
                  color: "var(--echo-ink)",
                }}
              >
                {t.title}
              </h4>
              <p
                style={{
                  fontSize: 13,
                  color: "var(--echo-mut)",
                  margin: 0,
                  lineHeight: 1.4,
                }}
              >
                {t.sub}
              </p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "end",
                  marginTop: "auto",
                  paddingTop: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--echo-ink)",
                    fontWeight: 600,
                  }}
                >
                  run prompt →
                </span>
                <WalrusMascot pose={t.pose} size={56} />
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}

function FooterRail() {
  return (
    <footer className="echo-section" style={{ background: "var(--echo-paper)" }}>
      <div
        className="echo-container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBlock: 24,
        }}
      >
        <MonoLabel size={10} color="var(--echo-mut)">
          echo · insights · memwal rag
        </MonoLabel>
        <div style={{ display: "flex", gap: 22 }}>
          <Link
            href="/dashboard"
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
              fontWeight: 500,
            }}
          >
            dashboard
          </Link>
          <Link
            href="/forms"
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
              fontWeight: 500,
            }}
          >
            forms
          </Link>
          <Link
            href="/logs"
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
              fontWeight: 500,
            }}
          >
            devlog
          </Link>
        </div>
      </div>
    </footer>
  );
}

function Floater() {
  return (
    <Link
      href="/dashboard"
      aria-label="back to dashboard"
      style={{
        position: "fixed",
        right: 24,
        bottom: 24,
        zIndex: 30,
        border: "2px solid var(--echo-ink)",
        borderRadius: 999,
        width: 72,
        height: 72,
        background: "var(--echo-paper)",
        boxShadow: "var(--echo-brut-shadow)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
      className="ff-bobble"
    >
      <WalrusMascot pose="haulout" size={72} />
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────

export function EchoInsightsRedesign({
  initialQuestion,
}: {
  initialQuestion?: string;
}) {
  const data = useInsightsData();
  const router = useRouter();
  const sp = useSearchParams();
  const [activeQuestion, setActiveQuestion] = useState<string | undefined>(
    initialQuestion ?? sp.get("q") ?? undefined,
  );
  const handleAsk = (q: string) => {
    setActiveQuestion(q);
    router.replace(`/insights?q=${encodeURIComponent(q)}`);
  };
  return (
    <div className="echo-dashboard">
      <HeroShelf
        formsIndexed={data.formsIndexed}
        documents={data.documents}
        onAsk={handleAsk}
      />
      <RagSection initialQuestion={activeQuestion} />
      <TemplatesBand onAsk={handleAsk} />
      <FooterRail />
      <Floater />
    </div>
  );
}
