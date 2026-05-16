"use client";

/**
 * /reputation — Echo redesign surface for the Soulbound Reputation
 * badges gallery.
 *
 * Currently a scaffold: the Echo Move package will (soon) expose
 * Soulbound badges minted to respondents who hit quality thresholds.
 * Until the on-chain query exists, this surface renders a clearly
 * labeled "preview" of sample badges so the visual register and IA
 * are in place for the real data swap.
 *
 * Composition mirrors EchoRedesign / EchoFormsRedesign:
 *   - .echo-dashboard wrapper
 *   - EchoNavRail (active="reputation")
 *   - Hero shelf  → "your reputation."
 *   - Preview pill chip clearly labels the data as sample-only
 *   - Magazine grid of 9 badge cards (.echo-card)
 *   - Right rail "ABOUT SOULBOUND" explainer
 *   - Footer rail + floater (matches sibling pages)
 */

import Link from "next/link";
import * as React from "react";
import { motion } from "motion/react";
import { EchoNavRail } from "@/components/general/EchoNavRail";
import { WalrusMascot, type MascotPose } from "@/components/general/FrameForms";

// ─────────────────────────────────────────────────────────────────
// Preview data — clearly labeled as sample, not on-chain queries yet
// ─────────────────────────────────────────────────────────────────

interface BadgeSample {
  id: string;
  name: string;
  earnedOn: string; // ISO date for display
  tone: "ink" | "sea" | "violet" | "walrus" | "yellow" | "warn";
  pose: MascotPose;
  rarity: string; // mono micro-text e.g. "top 1%", "rare"
  description: string;
}

const BADGES: BadgeSample[] = [
  {
    id: "bug-bounty-top-1",
    name: "Bug bounty · top 1%",
    earnedOn: "2026-03-22",
    tone: "violet",
    pose: "salute",
    rarity: "top 1%",
    description:
      "Reported a critical issue accepted by the form owner in a public bounty.",
  },
  {
    id: "validator-pulse-12",
    name: "Validator pulse · 12 streak",
    earnedOn: "2026-04-08",
    tone: "sea",
    pose: "primary",
    rarity: "streak · 12",
    description:
      "Responded to twelve consecutive validator pulse forms without missing a window.",
  },
  {
    id: "quality-respondent-100",
    name: "Quality respondent · 100+",
    earnedOn: "2026-04-18",
    tone: "walrus",
    pose: "peace",
    rarity: "veteran",
    description:
      "Submitted to more than one hundred Echo forms with above-threshold quality scores.",
  },
  {
    id: "early-echoer",
    name: "Early echoer",
    earnedOn: "2026-01-04",
    tone: "ink",
    pose: "monogram",
    rarity: "genesis",
    description:
      "Submitted to an Echo form during the first thirty days of mainnet launch.",
  },
  {
    id: "threshold-approver",
    name: "Threshold approver",
    earnedOn: "2026-02-15",
    tone: "violet",
    pose: "haulout",
    rarity: "k-of-n",
    description:
      "Signed approvals in a threshold-tier form, contributing to a successful unlock.",
  },
  {
    id: "time-lock-witness",
    name: "Time-lock witness",
    earnedOn: "2026-03-01",
    tone: "yellow",
    pose: "salute",
    rarity: "patient",
    description:
      "Submitted to a time-locked form and stayed visible through the unlock window.",
  },
  {
    id: "sybil-cleared",
    name: "Sybil-cleared respondent",
    earnedOn: "2026-02-28",
    tone: "sea",
    pose: "monogram",
    rarity: "verified",
    description:
      "Passed wallet provenance heuristics across at least three independent forms.",
  },
  {
    id: "insight-source",
    name: "Insight source · cited 10×",
    earnedOn: "2026-04-30",
    tone: "walrus",
    pose: "peace",
    rarity: "cited",
    description:
      "Submissions cited by ten or more Insights answer threads in the magazine view.",
  },
  {
    id: "founding-builder",
    name: "Founding builder",
    earnedOn: "2026-01-12",
    tone: "warn",
    pose: "primary",
    rarity: "1 of 50",
    description:
      "Published one of the first fifty FormOwnerCap-backed forms on Echo.",
  },
];

const TONE_COLOR: Record<BadgeSample["tone"], string> = {
  ink: "var(--echo-ink)",
  sea: "var(--echo-sui-sea)",
  violet: "var(--echo-sui-violet)",
  walrus: "var(--echo-mw-walrus)",
  yellow: "var(--echo-mw-yellow)",
  warn: "var(--echo-warn)",
};

// ─────────────────────────────────────────────────────────────────
// Tiny primitives — copy of the shared register, kept local so this
// file is self-contained like its sister surfaces.
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
  size = "md",
  variant = "ink",
  aurora = false,
  onClick,
}: {
  children: React.ReactNode;
  href?: string;
  size?: "sm" | "md" | "lg";
  variant?: "ink" | "paper";
  aurora?: boolean;
  onClick?: () => void;
}) {
  const pads =
    size === "sm" ? "8px 14px" : size === "lg" ? "16px 24px" : "12px 18px";
  const fontSize = size === "sm" ? 11 : size === "lg" ? 13 : 12;
  const bg = aurora
    ? "var(--echo-aurora-plate)"
    : variant === "ink"
      ? "#0A0A0A"
      : "#FFFFFF";
  const fg = variant === "ink" ? "#FAF8F5" : "#0A0A0A";
  const style = { padding: pads, background: bg, color: fg, fontSize };
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

function PreviewChip() {
  return (
    <span
      className="echo-mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontSize: 10,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        padding: "5px 12px",
        borderRadius: 999,
        background: "var(--echo-warn-bg)",
        color: "var(--echo-warn)",
        border: "1px solid #F4D58A",
        fontWeight: 600,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: "var(--echo-warn)",
          display: "inline-block",
        }}
      />
      preview · sample badges
    </span>
  );
}

function formatDate(iso: string) {
  // Stable formatting that works the same on server snapshot + client.
  // Avoids locale drift / hydration mismatch.
  const d = new Date(iso + "T00:00:00Z");
  const m = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${m.toUpperCase()} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

// ─────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────

function HeroShelf() {
  return (
    <section
      className="echo-section"
      style={{ background: "var(--echo-paper)" }}
    >
      <div
        className="echo-container"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 420px",
          gap: 48,
          alignItems: "center",
          paddingBlock: "56px 64px",
        }}
      >
        <div style={{ maxWidth: 640 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 14,
              marginBottom: 18,
              flexWrap: "wrap",
            }}
          >
            <MonoLabel size={11} color="var(--echo-ink)">
              ● BADGES · SOULBOUND
            </MonoLabel>
            <span style={{ color: "#D6D6D6" }}>·</span>
            <MonoLabel size={11}>non-transferable · on-chain</MonoLabel>
            <PreviewChip />
          </div>
          <motion.h1
            initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="echo-display"
            style={{ fontSize: "clamp(72px, 10vw, 144px)" }}
          >
            <span>your </span>
            <em
              style={{
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--echo-sui-violet)",
              }}
            >
              reputation
            </em>
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
              maxWidth: 520,
              margin: "0 0 28px",
            }}
          >
            Soulbound badges respondents earn on Echo. Each one is minted
            on-chain to a single wallet, can&apos;t be sold or transferred, and
            stays queryable by any dapp that wants to weight signal by
            provenance.
            <br />
            <strong style={{ color: "var(--echo-ink)", fontWeight: 600 }}>
              This page is a preview
            </strong>{" "}
            — the on-chain query is not wired up yet, so the cards below are
            sample data.
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              flexWrap: "wrap",
            }}
          >
            <BrutalistInk size="lg" href="#gallery">
              browse badges ↓
            </BrutalistInk>
            <Link
              href="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "var(--echo-mut)",
                fontWeight: 500,
                padding: "6px 0",
                borderBottom: "1px solid var(--echo-rail)",
              }}
            >
              back to dashboard
            </Link>
          </div>
        </div>
        <div
          style={{
            position: "relative",
            height: 380,
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
                "radial-gradient(120% 80% at 70% 30%, #A06EE9 0%, transparent 50%), radial-gradient(100% 100% at 20% 80%, #6CD3D6 0%, transparent 55%), radial-gradient(80% 100% at 90% 90%, #E8FF75 0%, transparent 60%), #FFFFFF",
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.0, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "relative",
              zIndex: 2,
              filter: "drop-shadow(0 24px 30px rgba(160,110,233,0.28))",
            }}
            className="ff-bobble"
          >
            <WalrusMascot pose="salute" size={280} />
          </motion.div>
          <div
            style={{
              position: "absolute",
              top: 30,
              right: 0,
              background: "var(--echo-paper)",
              border: "2px solid var(--echo-ink)",
              borderRadius: 10,
              boxShadow: "var(--echo-brut-shadow-sm)",
              padding: "8px 12px",
              zIndex: 3,
            }}
          >
            <MonoLabel size={9} color="var(--echo-ink)">
              9 earned · preview
            </MonoLabel>
          </div>
        </div>
      </div>
    </section>
  );
}

function BadgeCard({
  badge,
  delay = 0,
}: {
  badge: BadgeSample;
  delay?: number;
}) {
  const accent = TONE_COLOR[badge.tone];
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className="echo-card"
      style={{
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: accent,
        }}
      />
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: accent,
            boxShadow: `0 0 0 3px ${accent}26`,
          }}
        />
        <MonoLabel size={9} color="var(--echo-mut)">
          EARNED {formatDate(badge.earnedOn)}
        </MonoLabel>
      </header>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 132,
          background:
            "linear-gradient(180deg, var(--echo-paper-2) 0%, var(--echo-paper) 100%)",
          border: "1px solid var(--echo-rail)",
          borderRadius: 12,
        }}
      >
        <WalrusMascot pose={badge.pose} size={108} />
      </div>
      <div>
        <h3
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 500,
            fontSize: 18,
            letterSpacing: "-0.02em",
            margin: 0,
            lineHeight: 1.25,
            color: "var(--echo-ink)",
          }}
        >
          {badge.name}
        </h3>
        <p
          style={{
            margin: "8px 0 0",
            color: "var(--echo-mut)",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {badge.description}
        </p>
      </div>
      <footer
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          paddingTop: 10,
          borderTop: "1px solid var(--echo-rail)",
        }}
      >
        <span
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "3px 8px",
            borderRadius: 999,
            background: "var(--echo-rail-2)",
            color: "var(--echo-ink)",
          }}
        >
          {badge.rarity}
        </span>
        <MonoLabel size={9} color="var(--echo-mut-2)">
          soulbound · non-transferable
        </MonoLabel>
      </footer>
    </motion.article>
  );
}

function GalleryAndRail() {
  return (
    <section className="echo-section" id="gallery">
      <div className="echo-container" style={{ paddingBlock: "48px 64px" }}>
        <header
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 32,
            marginBottom: 28,
            flexWrap: "wrap",
          }}
        >
          <div>
            <MonoLabel>the gallery · {BADGES.length} preview badges</MonoLabel>
            <h2
              style={{
                fontFamily: "Inter, sans-serif",
                fontWeight: 500,
                letterSpacing: "-0.045em",
                fontSize: "clamp(40px, 5vw, 64px)",
                lineHeight: 1,
                margin: "10px 0 8px",
              }}
            >
              earned, not <em style={{ fontStyle: "italic" }}>bought</em>.
            </h2>
            <p
              style={{
                margin: 0,
                color: "var(--echo-mut)",
                fontSize: 14,
                maxWidth: 520,
              }}
            >
              Every card below would be a soulbound object on Sui, owned by the
              wallet that earned it. For now, these are illustrative — wired to
              live FormOwnerCap badge events in a follow-up.
            </p>
          </div>
          <PreviewChip />
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 320px",
            gap: 28,
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {BADGES.map((b, idx) => (
              <BadgeCard key={b.id} badge={b} delay={idx * 0.04} />
            ))}
          </div>

          <aside
            className="echo-card"
            style={{
              padding: 22,
              position: "sticky",
              top: 24,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div>
              <MonoLabel size={10}>ABOUT SOULBOUND</MonoLabel>
              <h3
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontWeight: 500,
                  letterSpacing: "-0.03em",
                  fontSize: 22,
                  lineHeight: 1.15,
                  margin: "10px 0 0",
                }}
              >
                what a soulbound badge actually does.
              </h3>
            </div>
            <ul
              style={{
                margin: 0,
                padding: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <RailFact
                title="non-transferable"
                body="Minted to one wallet. The Move module rejects transfers, so reputation can't be sold or laundered."
              />
              <RailFact
                title="on-chain"
                body="A real object on Sui with a stable id. No off-chain database, no opaque server score."
              />
              <RailFact
                title="queryable by other dapps"
                body="Any dapp can read your badges and weight signal by provenance — without asking permission."
              />
              <RailFact
                title="Sybil-resistant"
                body="Badges only mint when respondents pass quality thresholds tied to FormOwnerCap-signed events."
              />
            </ul>
            <div
              style={{
                marginTop: 4,
                paddingTop: 14,
                borderTop: "1px solid var(--echo-rail)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <MonoLabel size={9} color="var(--echo-mut)">
                live on-chain query · soon
              </MonoLabel>
              <Link
                href="/forms"
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 10,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--echo-ink)",
                  fontWeight: 600,
                  borderBottom: "1px solid var(--echo-ink)",
                  paddingBottom: 1,
                }}
              >
                see forms →
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function RailFact({ title, body }: { title: string; body: string }) {
  return (
    <li
      style={{
        display: "grid",
        gridTemplateColumns: "8px 1fr",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          marginTop: 6,
          background: "var(--echo-ink)",
          display: "inline-block",
        }}
      />
      <div>
        <div
          className="echo-mono"
          style={{
            fontSize: 10,
            letterSpacing: "0.14em",
            color: "var(--echo-ink)",
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        <p
          style={{
            margin: 0,
            fontFamily: "Inter, sans-serif",
            fontSize: 13,
            lineHeight: 1.45,
            color: "var(--echo-mut)",
          }}
        >
          {body}
        </p>
      </div>
    </li>
  );
}

function FooterRail() {
  return (
    <footer
      className="echo-section"
      style={{ background: "var(--echo-paper)" }}
    >
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
          echo · soulbound on sui
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
            href="/insights"
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--echo-mut)",
              fontWeight: 500,
            }}
          >
            insights
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
      <WalrusMascot pose="monogram" size={72} />
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────

export function EchoReputationRedesign() {
  return (
    <div className="echo-dashboard echo-builder">
      <EchoNavRail active="reputation" />
      <HeroShelf />
      <GalleryAndRail />
      <FooterRail />
      <Floater />
    </div>
  );
}
