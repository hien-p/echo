"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight,
  Lock,
  Sparkles,
  ShieldCheck,
  Clock,
  Users,
  Database,
  Zap,
  Brain,
  Globe,
} from "lucide-react";

/**
 * Adapted from agency-template Services / About / FAQ sections —
 * Echo content, Tailwind 4 + motion entries, no GSAP. Keeps the
 * "scroll into reveal" feel without the dep weight.
 */

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-100px" },
  transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const },
};

// ──────────────────────────────────────────────────────────────────────
//  PRIVACY TIERS — Echo's killer differentiator
// ──────────────────────────────────────────────────────────────────────

const tiers = [
  {
    icon: Globe,
    name: "Public",
    blurb: "Plaintext on Walrus. Anyone can read.",
    color: "text-emerald-400",
  },
  {
    icon: Lock,
    name: "Admin only",
    blurb: "Seal-encrypted to the FormOwnerCap holder.",
    color: "text-blue-400",
  },
  {
    icon: Users,
    name: "Threshold m-of-n",
    blurb: "k unique cap holders post on-chain witnesses to decrypt.",
    color: "text-violet-400",
  },
  {
    icon: Clock,
    name: "Time-locked",
    blurb: "Seal refuses key-server signing until the unlock deadline.",
    color: "text-amber-400",
  },
  {
    icon: ShieldCheck,
    name: "Conditional",
    blurb: "Decryption gated by an arbitrary on-chain Move predicate.",
    color: "text-rose-400",
  },
];

export function PrivacyTiers() {
  return (
    <section
      id="tiers"
      className="relative bg-background px-6 py-32 sm:px-12 lg:px-24"
    >
      <div className="mx-auto max-w-[1440px]">
        <motion.div {...fadeUp} className="flex flex-col gap-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-foreground/50">
            Privacy
          </span>
          <h2 className="max-w-[48rem] text-[clamp(2rem,5vw,5rem)] font-medium leading-[1.05] tracking-tight text-foreground">
            Five tiers, one form.
            <br />
            <em className="font-serif text-foreground/70">Pick how locked.</em>
          </h2>
        </motion.div>

        <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          {tiers.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{
                duration: 0.6,
                delay: i * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="group flex h-full flex-col gap-4 rounded-2xl border border-border bg-muted/40 p-6 transition hover:border-foreground/40 hover:bg-muted/60"
            >
              <t.icon size={24} className={t.color} strokeWidth={1.75} />
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {t.name}
              </h3>
              <p className="text-sm leading-relaxed text-foreground/60">
                {t.blurb}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  FEATURED FORMS
// ──────────────────────────────────────────────────────────────────────

const featuredForms = [
  {
    id: "0x3121c7bf1d27de41aea9157c75a397c7899e5cb69cbc6d15e0a48ab9da2ac0e1",
    title: "Help shape Echo · v0.2",
    blurb: "Public · gas sponsored · markdown answers · drop screenshots.",
    tier: "Public",
  },
];

export function FeaturedForms() {
  return (
    <section
      id="forms"
      className="relative bg-foreground px-6 py-32 text-background sm:px-12 lg:px-24"
    >
      <div className="mx-auto max-w-[1440px]">
        <motion.div {...fadeUp} className="flex flex-col gap-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-background/50">
            Try one
          </span>
          <h2 className="max-w-[48rem] text-[clamp(2rem,5vw,5rem)] font-medium leading-[1.05] tracking-tight">
            Live forms,
            <br />
            <em className="font-serif text-background/70">
              on Walrus right now.
            </em>
          </h2>
        </motion.div>

        <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2">
          {featuredForms.map((f) => (
            <motion.div
              key={f.id}
              {...fadeUp}
              className="group flex flex-col gap-6 rounded-2xl border border-background/15 bg-background/5 p-8 transition hover:border-background/40 hover:bg-background/10"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
                  {f.tier}
                </span>
                <code className="text-[11px] text-background/40">
                  {f.id.slice(0, 10)}…{f.id.slice(-6)}
                </code>
              </div>
              <h3 className="text-2xl font-medium tracking-tight">{f.title}</h3>
              <p className="text-sm leading-relaxed text-background/70">
                {f.blurb}
              </p>
              <Link
                href={`/forms/${f.id}`}
                className="mt-auto inline-flex items-center gap-2 self-start rounded-full bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition group-hover:gap-3"
              >
                Open form <ArrowRight size={16} />
              </Link>
            </motion.div>
          ))}
          <motion.div
            {...fadeUp}
            className="flex flex-col items-start gap-6 rounded-2xl border-2 border-dashed border-background/20 bg-background/5 p-8 transition hover:border-background/40"
          >
            <Sparkles size={24} className="text-background/60" />
            <h3 className="text-2xl font-medium tracking-tight">
              Build your own
            </h3>
            <p className="text-sm leading-relaxed text-background/70">
              Drag-drop builder, 14 field types, 5 privacy tiers, gas-sponsored
              submissions. Yours in under a minute.
            </p>
            <Link
              href="/forms/new"
              className="mt-auto inline-flex items-center gap-2 rounded-full border border-background/30 px-5 py-2.5 text-sm font-semibold text-background transition hover:border-background hover:bg-background hover:text-foreground"
            >
              Open builder <ArrowRight size={16} />
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  STACK STORY
// ──────────────────────────────────────────────────────────────────────

const stack = [
  {
    icon: Database,
    name: "Walrus",
    blurb:
      "Schemas, metadata, and submission payloads — every byte content-addressed and replicated across the storage network. Image proxy with magic-byte sniffing solves the missing content-type so embeds work anywhere.",
  },
  {
    icon: Lock,
    name: "Seal",
    blurb:
      "Threshold-encryption identity per form + tier. Real m-of-n via on-chain ApprovalWitness — votes-to-decrypt, not just ‘any cap holder reads’.",
  },
  {
    icon: ShieldCheck,
    name: "Sui",
    blurb:
      "Form objects, FormOwnerCap, SubmissionRef anchored on chain. Composability via Move: bounty pools, reputation badges, credit tickets.",
  },
  {
    icon: Zap,
    name: "Enoki",
    blurb:
      "Gas sponsorship — respondents (and walletless ephemeral keypairs) submit without holding any SUI. Ed25519 keypair generated client-side, used once, discarded.",
  },
  {
    icon: Brain,
    name: "Memwal",
    blurb:
      "RAG over submissions. Natural-language queries across every form you own — ‘what are the top three complaints from this week?’.",
  },
];

export function StackStory() {
  return (
    <section
      id="stack"
      className="relative bg-background px-6 py-32 sm:px-12 lg:px-24"
    >
      <div className="mx-auto max-w-[1440px]">
        <motion.div {...fadeUp} className="flex flex-col gap-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-foreground/50">
            Stack
          </span>
          <h2 className="max-w-[48rem] text-[clamp(2rem,5vw,5rem)] font-medium leading-[1.05] tracking-tight text-foreground">
            Five primitives,
            <br />
            <em className="font-serif text-foreground/70">one product.</em>
          </h2>
        </motion.div>

        <div className="mt-16 flex flex-col gap-4">
          {stack.map((s, i) => (
            <motion.div
              key={s.name}
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{
                duration: 0.6,
                delay: i * 0.06,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="group grid grid-cols-[auto_minmax(0,1fr)] items-start gap-6 border-b border-border py-8 transition hover:border-foreground/40 sm:grid-cols-[120px_220px_minmax(0,1fr)] sm:gap-12"
            >
              <s.icon
                size={36}
                strokeWidth={1.5}
                className="text-foreground/70 transition group-hover:text-foreground"
              />
              <h3 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
                {s.name}
              </h3>
              <p className="text-base leading-relaxed text-foreground/60">
                {s.blurb}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  FAQ
// ──────────────────────────────────────────────────────────────────────

const faqs = [
  {
    q: "How is this different from a Google Form?",
    a: "Schemas + answers live on Walrus content-addressed storage; you own them. Optional Seal encryption for private answers. On-chain composability — bounty pools auto-pay top responders, reputation badges issue from completed forms, threshold decryption for multi-admin governance. Gas-sponsored, walletless-respondent, anonymous-mode-with-Sybil-resistance. Nothing else does any of this on Google Forms.",
  },
  {
    q: "Do respondents need a wallet?",
    a: "No. The takeover viewer ships an ephemeral Ed25519 keypair, signs the gas-sponsored Enoki tx with it, and discards it. The respondent never sees a wallet popup. Walletless mode is Public-tier only; encrypted tiers still ask for a wallet so the Seal trust model isn't surprising.",
  },
  {
    q: "Can answers stay private?",
    a: "Yes. Five tiers: Public, AdminOnly (Seal-encrypted to FormOwnerCap), Threshold m-of-n (k unique witnesses to decrypt), Time-locked (Seal refuses signing until deadline), Conditional (Move predicate gates decryption). All real, all working on testnet today.",
  },
  {
    q: "What about anonymous submissions?",
    a: "Toggle ‘submit anonymously’ on the review screen. Your wallet signs a one-time deterministic message, we hash the signature into a 32-byte nullifier, only the hash hits the chain. One anonymous submission per wallet per form — Sybil-resistant without doxxing.",
  },
  {
    q: "Where do uploaded images and videos go?",
    a: "Drag-drop / paste / pick — uploads go straight to Walrus via the publisher proxy. Both images (incl. animated GIFs) and videos (mp4/webm/mov) supported. We re-emit through our own /api/walrus/blob/[id] proxy that sniffs magic bytes and sets content-type, so embeds work in <img> and <video> tags everywhere — paste the URL into a GitHub README or Notion and it just renders.",
  },
  {
    q: "Is there a dashboard?",
    a: "Yes — cross-form triage queue at /dashboard. Filter, tag (new / open / addressed / spam / archived), prioritize, bulk export to CSV. Realtime new-submission toasts plus per-form webhooks (Slack / Discord / Linear / Zapier) so you don't need to camp the page.",
  },
];

function FaqItem({ q, a, index }: { q: string; a: string; index: number }) {
  return (
    <motion.details
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{
        duration: 0.5,
        delay: index * 0.05,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="group border-b border-border py-6 sm:py-8"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-4 text-foreground transition hover:text-foreground">
        <span className="text-xl font-medium tracking-tight sm:text-2xl">
          {q}
        </span>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-foreground/60 transition group-open:rotate-45 group-open:border-foreground group-open:text-foreground">
          +
        </span>
      </summary>
      <p className="mt-4 max-w-[48rem] text-base leading-relaxed text-foreground/70">
        {a}
      </p>
    </motion.details>
  );
}

export function Faq() {
  return (
    <section
      id="faq"
      className="relative bg-background px-6 py-32 sm:px-12 lg:px-24"
    >
      <div className="mx-auto max-w-[1440px]">
        <motion.div {...fadeUp} className="flex flex-col gap-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-foreground/50">
            FAQ
          </span>
          <h2 className="max-w-[48rem] text-[clamp(2rem,5vw,5rem)] font-medium leading-[1.05] tracking-tight text-foreground">
            Things people ask.
          </h2>
        </motion.div>
        <div className="mt-12">
          {faqs.map((f, i) => (
            <FaqItem key={f.q} q={f.q} a={f.a} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  FOOTER
// ──────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────
//  SCROLL-REVEAL TEXT (FlowingServices) — agency `services.tsx` pattern
//  but motion-only (no GSAP). Each line reveals letter-by-letter as it
//  scrolls into view; used as a "what Echo does" flowing menu under
//  StackStory.
// ──────────────────────────────────────────────────────────────────────

function SplitChars({ children }: { children: string }) {
  return (
    <>
      {children.split(" ").map((word, wi, all) => (
        <span key={wi} className="inline-block whitespace-nowrap">
          {word.split("").map((char, ci) => (
            <motion.span
              key={ci}
              className="inline-block"
              initial={{ y: "60%", opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{
                duration: 0.6,
                delay: wi * 0.04 + ci * 0.015,
                ease: [0.22, 1, 0.36, 1] as const,
              }}
            >
              {char}
            </motion.span>
          ))}
          {wi < all.length - 1 && <span className="inline-block">&nbsp;</span>}
        </span>
      ))}
    </>
  );
}

const services = [
  "Walrus-native forms",
  "Seal-encrypted privacy",
  "Walletless answers",
  "Anonymous nullifiers",
  "Bounty payouts",
  "Soulbound reputation",
  "Memwal RAG insights",
];

export function FlowingServices() {
  return (
    <section
      id="services"
      className="relative bg-background px-6 py-32 sm:px-12 lg:px-24"
    >
      <div className="mx-auto max-w-[1440px]">
        <motion.div {...fadeUp} className="flex flex-col gap-4">
          <span className="text-xs font-semibold uppercase tracking-widest text-foreground/50">
            Capabilities
          </span>
          <h2 className="max-w-3xl text-[clamp(2rem,5vw,5rem)] font-medium leading-[1.05] tracking-tight text-foreground">
            What Echo does, <br />
            <em className="font-serif text-foreground/70">end to end.</em>
          </h2>
        </motion.div>

        <div className="mt-16 flex flex-col">
          {services.map((s) => (
            <div
              key={s}
              className="group flex items-center justify-between gap-6 border-b border-border py-6 text-[clamp(1.5rem,4vw,3.5rem)] font-medium leading-tight tracking-tight text-foreground transition hover:bg-foreground/5 sm:py-8"
            >
              <span className="flex-1 overflow-hidden">
                <SplitChars>{s}</SplitChars>
              </span>
              <span
                className="text-foreground/30 transition group-hover:translate-x-1 group-hover:text-foreground"
                aria-hidden="true"
              >
                →
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  BENTO SOCIAL PROOF — agency `social-proof.tsx` pattern, 4-col grid
//  with mixed row heights. Echo content: built-for-Sessions, stack,
//  metrics, walrus storage, hackathon framing.
// ──────────────────────────────────────────────────────────────────────

export function SocialProofBento() {
  const cards = [
    {
      // Big quote tile — col-span-2, row-span-2
      kind: "quote" as const,
      colSpan: "lg:col-span-2 lg:row-span-2",
      body: (
        <>
          <svg
            className="mb-6 h-10 w-10 text-foreground/20"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z" />
          </svg>
          <blockquote className="text-2xl font-medium leading-snug text-foreground sm:text-3xl">
            We started with &ldquo;Google Forms but decentralized&rdquo; and
            ended up shipping the most composable feedback primitive on Sui.
            Five privacy tiers, walletless submit, on-chain bounties.
          </blockquote>
          <p className="mt-6 text-sm font-medium text-foreground/70">
            built for Walrus Sessions · hien-p
          </p>
        </>
      ),
    },
    {
      kind: "stat" as const,
      colSpan: "",
      stat: "5 tiers",
      label: "Public · AdminOnly · Threshold · Time-locked · Conditional",
    },
    {
      kind: "stat" as const,
      colSpan: "",
      stat: "0 SUI",
      label: "Respondents pay no gas — Enoki sponsors every submission",
    },
    {
      kind: "stat" as const,
      colSpan: "",
      stat: "Walletless",
      label: "Ephemeral Ed25519 keypair signs once, then discarded",
    },
    {
      kind: "stat" as const,
      colSpan: "",
      stat: "Top 1%",
      label: "Walrus-native form platform in the ecosystem",
    },
    {
      // Wide bottom tile — col-span-3
      kind: "story" as const,
      colSpan: "lg:col-span-3",
      body: (
        <>
          <p className="flex-1 text-xl font-medium leading-relaxed text-foreground sm:text-2xl">
            Schemas + answers content-addressed on Walrus. Optional Seal
            encryption for private tiers. Memwal RAG for natural-language
            queries across submissions. Bounty pools auto-pay top responders.
            Soulbound reputation badges issued from issued credit tickets.
          </p>
          <div className="mt-6 flex items-center justify-between border-t border-border pt-6">
            <span className="text-base font-semibold text-foreground">
              Echo · Walrus Sessions 2026
            </span>
            <Link
              href="https://github.com/hien-p/echo"
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 text-foreground transition hover:bg-foreground hover:text-background"
              aria-label="GitHub repository"
            >
              <ArrowRight size={16} />
            </Link>
          </div>
        </>
      ),
    },
  ];

  return (
    <section
      id="social-proof"
      className="relative bg-background px-6 py-32 sm:px-12 lg:px-24"
    >
      <div className="mx-auto max-w-[1440px]">
        <motion.div
          {...fadeUp}
          className="mb-12 flex flex-wrap items-end justify-between gap-6 lg:mb-16"
        >
          <div className="flex flex-col gap-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-foreground/50">
              Why it matters
            </span>
            <h2 className="max-w-3xl text-[clamp(2rem,5vw,5rem)] font-medium leading-[1.05] tracking-tight text-foreground">
              Forms that move <br />
              <em className="font-serif text-foreground/70">
                at hackathon speed.
              </em>
            </h2>
          </div>
          <Link
            href="/forms/new"
            className="hidden items-center justify-center rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition hover:opacity-80 sm:inline-flex"
          >
            Build your first form
          </Link>
        </motion.div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 lg:grid-rows-[minmax(220px,auto)_minmax(220px,auto)_minmax(180px,auto)]">
          {cards.map((c, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30, scale: 0.97 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{
                duration: 0.7,
                delay: i * 0.08,
                ease: [0.22, 1, 0.36, 1] as const,
              }}
              className={`flex flex-col rounded-2xl bg-muted/50 p-6 sm:p-8 ${c.colSpan}`}
            >
              {c.kind === "quote" || c.kind === "story" ? (
                c.body
              ) : (
                <>
                  <div className="flex-1">
                    <p className="text-3xl font-semibold text-foreground sm:text-4xl">
                      {c.stat}
                    </p>
                    <p className="mt-2 text-sm text-foreground/60">{c.label}</p>
                  </div>
                </>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function MarketingFooter() {
  return (
    <footer
      id="contact"
      className="relative bg-foreground px-6 pt-24 pb-12 text-background sm:px-12 sm:pt-32 lg:px-24"
    >
      <div className="mx-auto max-w-[1440px]">
        <a
          href="https://github.com/hien-p/echo"
          target="_blank"
          rel="noreferrer"
          className="block text-[clamp(2.5rem,7vw,7rem)] font-medium leading-[1.05] tracking-tight transition hover:opacity-80"
        >
          github.com/hien-p/echo
        </a>

        <div className="mt-16 flex flex-wrap items-center justify-between gap-6 border-t border-background/15 pt-8 text-sm text-background/70">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/" className="hover:text-background">
              Home
            </Link>
            <Link href="/app" className="hover:text-background">
              App
            </Link>
            <Link href="/forms/new" className="hover:text-background">
              Build a form
            </Link>
            <Link href="/logs/" className="hover:text-background">
              Devlog
            </Link>
            <a
              href="https://github.com/hien-p/echo"
              className="hover:text-background"
              target="_blank"
              rel="noreferrer"
            >
              Source
            </a>
          </div>
          <div className="text-xs text-background/50">
            Built for the Walrus Sessions hackathon · Sui · Walrus · Seal ·
            Memwal · Enoki
          </div>
        </div>
      </div>
    </footer>
  );
}
