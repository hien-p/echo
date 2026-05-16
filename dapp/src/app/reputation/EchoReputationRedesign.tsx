"use client";

/**
 * /reputation -- Echo preview surface for soulbound reputation badges.
 *
 * The cards use generated walrus-only companion artwork while the live
 * FormOwnerCap-backed badge query is still being wired in.
 */

import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import { motion } from "motion/react";
import { EchoNavRail } from "@/components/general/EchoNavRail";

interface BadgeSample {
  id: string;
  name: string;
  earnedOn: string;
  tone: "ink" | "sea" | "violet" | "walrus" | "yellow" | "warn";
  rarity: string;
  proof: string;
  description: string;
  companionSrc: string;
  companionAlt: string;
}

interface ToneTheme {
  accent: string;
  soft: string;
  glow: string;
}

const COMPANION_BASE = "/assets/reputation/companions";

const BADGES: BadgeSample[] = [
  {
    id: "bug-bounty-top-1",
    name: "Bug bounty · top 1%",
    earnedOn: "2026-03-22",
    tone: "violet",
    rarity: "top 1%",
    proof: "owner signed",
    description:
      "A form owner accepted the report and signed the bounty proof.",
    companionSrc: `${COMPANION_BASE}/bug-bounty.png`,
    companionAlt:
      "Generated Echo walrus writing bug bounty notes in a worn book.",
  },
  {
    id: "validator-pulse-12",
    name: "Validator pulse · 12 streak",
    earnedOn: "2026-04-08",
    tone: "sea",
    rarity: "streak · 12",
    proof: "window proof",
    description:
      "Twelve validator pulse forms answered in a row, all inside the response window.",
    companionSrc: `${COMPANION_BASE}/validator-pulse.png`,
    companionAlt:
      "Generated Echo walrus writing beside a glowing validator pulse orb.",
  },
  {
    id: "quality-respondent-100",
    name: "Quality respondent · 100+",
    earnedOn: "2026-04-18",
    tone: "walrus",
    rarity: "veteran",
    proof: "quality score",
    description:
      "One hundred accepted submissions with above-threshold quality signals.",
    companionSrc: `${COMPANION_BASE}/quality-respondent.png`,
    companionAlt:
      "Generated Echo walrus writing beside a glowing quality token.",
  },
  {
    id: "early-echoer",
    name: "Early echoer",
    earnedOn: "2026-01-04",
    tone: "ink",
    rarity: "genesis",
    proof: "launch era",
    description: "Earned by showing up in Echo's first public launch window.",
    companionSrc: `${COMPANION_BASE}/early-echoer.png`,
    companionAlt:
      "Generated Echo walrus writing launch notes beside a warm lantern.",
  },
  {
    id: "threshold-approver",
    name: "Threshold approver",
    earnedOn: "2026-02-15",
    tone: "violet",
    rarity: "k-of-n",
    proof: "quorum proof",
    description:
      "Helped a threshold approval group reach quorum for a successful unlock.",
    companionSrc: `${COMPANION_BASE}/threshold-approver.png`,
    companionAlt:
      "Generated Echo walrus writing beside three linked quorum nodes.",
  },
  {
    id: "time-lock-witness",
    name: "Time-lock witness",
    earnedOn: "2026-03-01",
    tone: "yellow",
    rarity: "patient",
    proof: "time proof",
    description:
      "Submitted before unlock and stayed accountable through the reveal window.",
    companionSrc: `${COMPANION_BASE}/time-lock-witness.png`,
    companionAlt:
      "Generated Echo walrus writing beside an hourglass and small lock.",
  },
  {
    id: "sybil-cleared",
    name: "Sybil-cleared respondent",
    earnedOn: "2026-02-28",
    tone: "sea",
    rarity: "verified",
    proof: "provenance",
    description:
      "Passed wallet provenance checks across independent form owners.",
    companionSrc: `${COMPANION_BASE}/sybil-cleared.png`,
    companionAlt:
      "Generated Echo walrus writing beside a shield and linked provenance dots.",
  },
  {
    id: "insight-source",
    name: "Insight source · cited 10x",
    earnedOn: "2026-04-30",
    tone: "walrus",
    rarity: "cited",
    proof: "cited source",
    description:
      "Submitted answers later cited by ten Insights answer threads.",
    companionSrc: `${COMPANION_BASE}/insight-source.png`,
    companionAlt:
      "Generated Echo walrus writing beneath glowing abstract answer cards.",
  },
  {
    id: "founding-builder",
    name: "Founding builder",
    earnedOn: "2026-01-12",
    tone: "warn",
    rarity: "1 of 50",
    proof: "cap backed",
    description: "Published one of the first fifty FormOwnerCap-backed forms.",
    companionSrc: `${COMPANION_BASE}/founding-builder.png`,
    companionAlt:
      "Generated Echo walrus writing beside abstract Sui-colored building blocks.",
  },
];

const TONE_THEME: Record<BadgeSample["tone"], ToneTheme> = {
  ink: {
    accent: "#0A0A0A",
    soft: "rgba(10,10,10,0.14)",
    glow: "rgba(10,10,10,0.12)",
  },
  sea: {
    accent: "#4DA2FF",
    soft: "rgba(77,162,255,0.22)",
    glow: "rgba(77,162,255,0.18)",
  },
  violet: {
    accent: "#A06EE9",
    soft: "rgba(160,110,233,0.24)",
    glow: "rgba(160,110,233,0.18)",
  },
  walrus: {
    accent: "#35BFC5",
    soft: "rgba(53,191,197,0.24)",
    glow: "rgba(53,191,197,0.18)",
  },
  yellow: {
    accent: "#D7F842",
    soft: "rgba(215,248,66,0.34)",
    glow: "rgba(180,200,30,0.16)",
  },
  warn: {
    accent: "#B45309",
    soft: "rgba(180,83,9,0.22)",
    glow: "rgba(180,83,9,0.16)",
  },
};

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
    <span className="echo-mono rep-preview-chip">
      <span aria-hidden="true" className="rep-preview-dot" />
      staging preview · sample badges
    </span>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  const m = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${m.toUpperCase()} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function HeroShelf() {
  return (
    <section
      className="echo-section"
      style={{ background: "var(--echo-paper)" }}
    >
      <div className="echo-container rep-hero-grid">
        <div className="rep-hero-copy">
          <div className="rep-eyebrow-row">
            <MonoLabel size={11} color="var(--echo-ink)">
              ● reputation · soulbound
            </MonoLabel>
            <span className="rep-muted-sep">·</span>
            <MonoLabel size={11}>non-transferable · on-chain</MonoLabel>
            <PreviewChip />
          </div>
          <motion.h1
            initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="rep-hero-title"
          >
            <span>your </span>
            <em>reputation</em>
            <span className="rep-hero-dot">.</span>
          </motion.h1>
          <p className="rep-hero-lede">
            <strong>Portable proof, not points.</strong> Soulbound badges turn
            useful participation into a credential another dapp can verify:
            minted to one wallet, locked against transfer, and tied back to the
            form provenance that earned it.
          </p>
          <p className="rep-preview-note">
            This staging page uses generated walrus-only companion artwork and
            sample badge data while the live FormOwnerCap event query is being
            wired in.
          </p>
          <div className="rep-hero-actions">
            <BrutalistInk size="lg" href="#gallery">
              browse companions ↓
            </BrutalistInk>
            <Link href="/dashboard" className="rep-text-link">
              back to dashboard
            </Link>
          </div>
        </div>
        <HeroCredential />
      </div>
    </section>
  );
}

function HeroCredential() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="rep-hero-art"
    >
      <div className="rep-hero-art-header">
        <MonoLabel size={9} color="#faf8f5">
          generated companion
        </MonoLabel>
        <span>0xECHO...SBT</span>
      </div>
      <div className="rep-hero-companion">
        <Image
          src={`${COMPANION_BASE}/validator-pulse.png`}
          alt="Generated Echo walrus writing in a worn book for reputation badges."
          width={1254}
          height={1254}
          priority
          className="rep-hero-companion-image"
        />
      </div>
      <div className="rep-hero-stamp">
        <span>9</span>
        <strong>new companions</strong>
      </div>
      <div className="rep-hero-metrics">
        <Metric label="transfer" value="locked" />
        <Metric label="proof" value="on-chain" />
        <Metric label="signal" value="queryable" />
      </div>
    </motion.div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rep-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BadgeCard({
  badge,
  delay = 0,
}: {
  badge: BadgeSample;
  delay?: number;
}) {
  const theme = TONE_THEME[badge.tone];

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className="echo-card rep-badge-card"
      style={{
        borderColor: theme.soft,
        boxShadow: `0 18px 44px ${theme.glow}`,
      }}
    >
      <span
        aria-hidden="true"
        className="rep-badge-accent"
        style={{ background: theme.accent }}
      />
      <header className="rep-badge-header">
        <MonoLabel size={9} color="var(--echo-mut)">
          credential
        </MonoLabel>
        <time dateTime={badge.earnedOn} className="echo-mono rep-earned-date">
          earned {formatDate(badge.earnedOn)}
        </time>
      </header>
      <div
        className="rep-companion-plate"
        style={{
          borderColor: theme.soft,
          background: `radial-gradient(circle at 50% 18%, ${theme.soft}, transparent 34%), linear-gradient(160deg, #191b24 0%, #0a0a0a 58%, #111827 100%)`,
        }}
      >
        <span className="rep-badge-proof">{badge.proof}</span>
        <div
          className="rep-companion-motion"
          style={{ animationDelay: `${delay * 2.4}s` }}
        >
          <Image
            src={badge.companionSrc}
            alt={badge.companionAlt}
            width={1254}
            height={1254}
            className="rep-companion-image"
            sizes="(max-width: 760px) 86vw, 320px"
          />
        </div>
      </div>
      <div className="rep-badge-copy">
        <h3>{badge.name}</h3>
        <p>{badge.description}</p>
      </div>
      <footer className="rep-badge-footer">
        <span className="rep-rarity" style={{ background: theme.accent }}>
          {badge.rarity}
        </span>
        <span className="rep-sbt-chip">soulbound</span>
        <span className="rep-sbt-chip">queryable</span>
      </footer>
    </motion.article>
  );
}

function GalleryAndRail() {
  return (
    <section className="echo-section" id="gallery">
      <div className="echo-container" style={{ paddingBlock: "48px 64px" }}>
        <header className="rep-gallery-header">
          <div>
            <MonoLabel>
              companion gallery · {BADGES.length} generated badges
            </MonoLabel>
            <h2 className="rep-gallery-title">
              portable proof, not <em>points</em>.
            </h2>
            <p className="rep-gallery-copy">
              Each production card should be a soulbound Sui object owned by the
              wallet that earned it. For this staging review, every badge now
              has a distinct original walrus-only companion scene.
            </p>
          </div>
          <PreviewChip />
        </header>

        <div className="rep-gallery-shell">
          <div className="rep-card-grid">
            {BADGES.map((badge, idx) => (
              <BadgeCard key={badge.id} badge={badge} delay={idx * 0.04} />
            ))}
          </div>

          <aside className="echo-card rep-side-rail">
            <div>
              <MonoLabel size={10}>ABOUT SOULBOUND</MonoLabel>
              <h3 className="rep-side-title">
                what a badge proves after it leaves Echo.
              </h3>
            </div>
            <ul className="rep-fact-list">
              <RailFact
                title="non-transferable"
                body="Minted to one wallet. The Move module rejects transfer, so reputation cannot be sold."
              />
              <RailFact
                title="provenance attached"
                body="The badge points back to the form event, owner cap, and quality threshold that produced it."
              />
              <RailFact
                title="readable by any dapp"
                body="Other apps can query the object and weight the signal without asking Echo for permission."
              />
              <RailFact
                title="generated companions"
                body="These staging images are original walrus-only Echo assets, not crawled or found artwork."
              />
            </ul>
            <div className="rep-side-footer">
              <MonoLabel size={9} color="var(--echo-mut)">
                live on-chain query · soon
              </MonoLabel>
              <Link href="/forms" className="rep-side-link">
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
    <li className="rep-rail-fact">
      <span aria-hidden="true" />
      <div>
        <div className="echo-mono rep-rail-title">{title}</div>
        <p>{body}</p>
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
      <div className="echo-container rep-footer-row">
        <MonoLabel size={10} color="var(--echo-mut)">
          echo · soulbound on sui
        </MonoLabel>
        <div className="rep-footer-links">
          <Link href="/dashboard">dashboard</Link>
          <Link href="/forms">forms</Link>
          <Link href="/insights">insights</Link>
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
      className="rep-floater"
    >
      <Image
        src={`${COMPANION_BASE}/quality-respondent.png`}
        alt=""
        width={1254}
        height={1254}
        className="rep-floater-image"
      />
    </Link>
  );
}

function ReputationStyles() {
  return (
    <style>{`
      .rep-preview-chip {
        align-items: center;
        gap: 8px;
        font-size: 10px;
        letter-spacing: 0.14em;
        padding: 6px 12px;
        border-radius: 999px;
        background: var(--echo-warn-bg);
        color: var(--echo-warn);
        border: 1px solid #f4d58a;
        font-weight: 700;
      }

      .rep-preview-dot {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: var(--echo-warn);
        display: inline-block;
      }

      .rep-hero-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(320px, 440px);
        gap: 52px;
        align-items: center;
        padding-block: 62px 70px;
      }

      .rep-hero-copy {
        max-width: 690px;
      }

      .rep-eyebrow-row {
        display: inline-flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 20px;
        flex-wrap: wrap;
      }

      .rep-muted-sep {
        color: #d6d6d6;
      }

      .rep-hero-title {
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        font-size: 112px;
        font-weight: 520;
        letter-spacing: 0;
        line-height: 0.9;
        margin: 18px 0 24px;
        color: var(--echo-ink);
      }

      .rep-hero-title em {
        color: var(--echo-sui-violet);
      }

      .rep-hero-dot {
        color: var(--echo-sui-violet);
        font-size: 0.62em;
        margin-left: 6px;
      }

      .rep-hero-lede,
      .rep-preview-note {
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        color: var(--echo-mut);
        max-width: 585px;
      }

      .rep-hero-lede {
        font-size: 18px;
        line-height: 1.55;
        margin: 0;
      }

      .rep-hero-lede strong {
        color: var(--echo-ink);
        font-weight: 700;
      }

      .rep-preview-note {
        font-size: 14px;
        line-height: 1.55;
        margin: 14px 0 30px;
      }

      .rep-hero-actions {
        display: flex;
        align-items: center;
        gap: 18px;
        flex-wrap: wrap;
      }

      .rep-text-link,
      .rep-side-link,
      .rep-footer-links a {
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        font-weight: 700;
      }

      .rep-text-link {
        color: var(--echo-mut);
        padding: 6px 0;
        border-bottom: 1px solid var(--echo-rail);
      }

      .rep-hero-art {
        position: relative;
        min-height: 430px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        overflow: hidden;
        background:
          radial-gradient(circle at 52% 22%, rgba(77, 162, 255, 0.32), transparent 34%),
          radial-gradient(circle at 74% 52%, rgba(160, 110, 233, 0.24), transparent 30%),
          repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.055) 0 1px, transparent 1px 34px),
          linear-gradient(160deg, #191b24 0%, #09090b 58%, #111827 100%);
        box-shadow: 0 26px 70px rgba(10, 10, 10, 0.2);
      }

      .rep-hero-art::before {
        content: "";
        position: absolute;
        inset: 28px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 8px;
        pointer-events: none;
      }

      .rep-hero-art-header {
        position: absolute;
        top: 22px;
        left: 22px;
        right: 22px;
        z-index: 4;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        color: #faf8f5;
      }

      .rep-hero-art-header span:last-child {
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 10px;
        font-weight: 700;
        color: rgba(250, 248, 245, 0.6);
      }

      .rep-hero-companion {
        position: absolute;
        z-index: 2;
        left: 50%;
        top: 52%;
        width: min(330px, 72vw);
        aspect-ratio: 1;
        transform: translate(-50%, -50%);
        filter: drop-shadow(0 28px 34px rgba(10, 10, 10, 0.18));
      }

      .rep-hero-companion-image {
        width: 100%;
        height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 28px 26px rgba(0, 0, 0, 0.34));
        animation: rep-companion-float 5.8s cubic-bezier(0.45, 0, 0.55, 1) infinite;
      }

      .rep-hero-stamp {
        position: absolute;
        right: 20px;
        top: 78px;
        z-index: 5;
        display: grid;
        gap: 2px;
        min-width: 116px;
        padding: 12px 14px;
        border: 2px solid var(--echo-ink);
        border-radius: 8px;
        background: var(--echo-paper);
        box-shadow: var(--echo-brut-shadow-sm);
      }

      .rep-hero-stamp span {
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        font-size: 42px;
        line-height: 0.9;
        font-weight: 650;
      }

      .rep-hero-stamp strong {
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 9px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .rep-hero-metrics {
        position: absolute;
        left: 22px;
        right: 22px;
        bottom: 22px;
        z-index: 4;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      .rep-metric {
        border: 1px solid rgba(10, 10, 10, 0.12);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.12);
        padding: 9px 10px;
        display: grid;
        gap: 3px;
        backdrop-filter: blur(10px);
      }

      .rep-metric span,
      .rep-metric strong {
        font-family: "JetBrains Mono", ui-monospace, monospace;
        text-transform: uppercase;
      }

      .rep-metric span {
        font-size: 9px;
        color: rgba(250, 248, 245, 0.62);
        letter-spacing: 0.1em;
      }

      .rep-metric strong {
        font-size: 10px;
        color: #faf8f5;
        letter-spacing: 0.08em;
      }

      .rep-gallery-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 32px;
        margin-bottom: 28px;
        flex-wrap: wrap;
      }

      .rep-gallery-title {
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        font-weight: 520;
        letter-spacing: 0;
        font-size: 56px;
        line-height: 1;
        margin: 10px 0 8px;
        color: var(--echo-ink);
      }

      .rep-gallery-copy {
        margin: 0;
        color: var(--echo-mut);
        font-size: 14px;
        line-height: 1.55;
        max-width: 590px;
      }

      .rep-gallery-shell {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 340px;
        gap: 28px;
        align-items: flex-start;
      }

      .rep-card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 18px;
      }

      .rep-badge-card {
        min-height: 408px;
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        position: relative;
        overflow: hidden;
        border-radius: 8px;
        transition:
          border-color 180ms ease,
          transform 180ms ease,
          box-shadow 180ms ease;
      }

      .rep-badge-card:hover {
        transform: translateY(-2px);
      }

      .rep-badge-card:hover .rep-companion-image {
        transform: translateY(-4px) scale(1.035) rotate(0.6deg);
      }

      .rep-badge-accent {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
      }

      .rep-badge-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .rep-earned-date {
        font-size: 9px;
        color: var(--echo-mut);
        letter-spacing: 0.12em;
      }

      .rep-companion-plate {
        position: relative;
        height: 238px;
        min-height: 238px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid;
        border-radius: 8px;
        overflow: hidden;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.1),
          inset 0 -40px 70px rgba(0, 0, 0, 0.22);
      }

      .rep-companion-plate::before {
        content: "";
        position: absolute;
        inset: 10px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 7px;
        pointer-events: none;
        z-index: 2;
      }

      .rep-companion-motion {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        transform-origin: 50% 54%;
        animation: rep-companion-float 5.4s cubic-bezier(0.45, 0, 0.55, 1) infinite;
      }

      .rep-companion-image {
        width: 100%;
        height: 100%;
        padding: 6px 18px 0;
        object-fit: contain;
        filter:
          drop-shadow(0 18px 22px rgba(0, 0, 0, 0.35))
          saturate(1.05);
        transform-origin: 50% 54%;
        transition:
          transform 180ms ease,
          filter 180ms ease;
      }

      .rep-badge-proof {
        position: absolute;
        left: 12px;
        top: 12px;
        z-index: 3;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.78);
        color: var(--echo-ink);
        border: 1px solid rgba(10, 10, 10, 0.1);
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 8.5px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        backdrop-filter: blur(10px);
      }

      .rep-badge-copy {
        display: grid;
        gap: 8px;
      }

      .rep-badge-copy h3 {
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        font-weight: 620;
        font-size: 19px;
        letter-spacing: 0;
        margin: 0;
        line-height: 1.2;
        color: var(--echo-ink);
      }

      .rep-badge-copy p {
        margin: 0;
        color: var(--echo-mut);
        font-size: 13px;
        line-height: 1.45;
      }

      .rep-badge-footer {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        padding-top: 12px;
        margin-top: auto;
        border-top: 1px solid var(--echo-rail);
      }

      .rep-rarity,
      .rep-sbt-chip {
        font-family: "JetBrains Mono", ui-monospace, monospace;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        border-radius: 999px;
        line-height: 1;
        white-space: nowrap;
      }

      .rep-rarity {
        padding: 6px 9px;
        color: var(--echo-ink);
        border: 1px solid rgba(10, 10, 10, 0.1);
      }

      .rep-sbt-chip {
        padding: 6px 8px;
        color: var(--echo-mut);
        background: var(--echo-rail-2);
      }

      .rep-side-rail {
        padding: 24px;
        position: sticky;
        top: 24px;
        display: flex;
        flex-direction: column;
        gap: 18px;
        border-radius: 8px;
        box-shadow: 0 16px 40px rgba(10, 10, 10, 0.05);
      }

      .rep-side-title {
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        font-weight: 560;
        letter-spacing: 0;
        font-size: 24px;
        line-height: 1.12;
        margin: 10px 0 0;
      }

      .rep-fact-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: 15px;
      }

      .rep-rail-fact {
        display: grid;
        grid-template-columns: 8px 1fr;
        gap: 11px;
        align-items: flex-start;
      }

      .rep-rail-fact > span {
        width: 8px;
        height: 8px;
        margin-top: 6px;
        background: var(--echo-ink);
        display: inline-block;
      }

      .rep-rail-title {
        font-size: 10px;
        letter-spacing: 0.12em;
        color: var(--echo-ink);
        font-weight: 800;
        margin-bottom: 5px;
      }

      .rep-rail-fact p {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
        font-size: 13px;
        line-height: 1.48;
        color: var(--echo-mut);
      }

      .rep-side-footer {
        margin-top: 2px;
        padding-top: 15px;
        border-top: 1px solid var(--echo-rail);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .rep-side-link {
        color: var(--echo-ink);
        border-bottom: 1px solid var(--echo-ink);
        padding-bottom: 1px;
        white-space: nowrap;
      }

      .rep-footer-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding-block: 24px;
      }

      .rep-footer-links {
        display: flex;
        gap: 22px;
        flex-wrap: wrap;
      }

      .rep-footer-links a {
        color: var(--echo-mut);
      }

      .rep-floater {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 30;
        border: 2px solid var(--echo-ink);
        border-radius: 999px;
        width: 74px;
        height: 74px;
        background: var(--echo-paper);
        box-shadow: var(--echo-brut-shadow);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .rep-floater-image {
        width: 100%;
        height: 100%;
        padding: 4px;
        object-fit: contain;
        animation: rep-companion-float 4.8s cubic-bezier(0.45, 0, 0.55, 1) infinite;
      }

      @keyframes rep-companion-float {
        0%,
        100% {
          transform: translateY(0) rotate(-0.4deg);
        }
        50% {
          transform: translateY(-6px) rotate(0.6deg);
        }
      }

      @media (max-width: 1120px) {
        .rep-hero-grid,
        .rep-gallery-shell {
          grid-template-columns: 1fr;
        }

        .rep-hero-art {
          max-width: 560px;
          width: 100%;
        }

        .rep-side-rail {
          position: static;
        }
      }

      @media (max-width: 760px) {
        .echo-dashboard .bld-navrail__inner {
          flex-wrap: wrap;
          row-gap: 14px;
        }

        .echo-dashboard .bld-navrail__inner > div:first-child {
          width: 100%;
          min-width: 0;
          flex-wrap: wrap;
        }

        .echo-dashboard .bld-nav-links {
          width: 100%;
          margin-left: 0;
          gap: 18px;
          overflow-x: auto;
          padding: 4px 0;
        }

        .echo-dashboard .bld-nav-right {
          width: 100%;
          justify-content: flex-start;
          flex-wrap: wrap;
        }

        .echo-dashboard .bld-brand__tag {
          display: none;
        }

        .rep-hero-grid {
          padding-block: 42px 50px;
          gap: 34px;
        }

        .rep-hero-title {
          font-size: 58px;
          line-height: 0.96;
        }

        .rep-hero-lede {
          font-size: 16px;
        }

        .rep-hero-art {
          min-height: 360px;
        }

        .rep-hero-stamp {
          top: 66px;
          right: 16px;
          min-width: 104px;
        }

        .rep-hero-metrics {
          grid-template-columns: 1fr;
        }

        .rep-gallery-title {
          font-size: 40px;
        }

        .rep-card-grid {
          grid-template-columns: 1fr;
        }

        .rep-badge-header,
        .rep-side-footer,
        .rep-footer-row {
          align-items: flex-start;
          flex-direction: column;
        }

        .rep-earned-date {
          line-height: 1.35;
        }

        .rep-floater {
          width: 62px;
          height: 62px;
          right: 16px;
          bottom: 16px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .rep-companion-image,
        .rep-companion-motion,
        .rep-hero-companion-image,
        .rep-floater-image {
          animation: none;
        }
      }
    `}</style>
  );
}

export function EchoReputationRedesign() {
  return (
    <div className="echo-dashboard echo-builder">
      <ReputationStyles />
      <EchoNavRail active="reputation" />
      <HeroShelf />
      <GalleryAndRail />
      <FooterRail />
      <Floater />
    </div>
  );
}
