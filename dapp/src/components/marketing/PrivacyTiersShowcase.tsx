"use client";

import { AnimatePresence, motion, type Transition } from "motion/react";
import {
  Plus,
  Globe,
  Lock,
  Users,
  Clock,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { SectionCorners } from "@/components/shell";

/**
 * Privacy tiers as a horizontal snap-scroll carousel. Plain dark cards
 * (icon + tier label + title + short blurb + plus affordance). Click any
 * card to morph into an expanded modal with the full threat-model body.
 * Pagination is arrow buttons + one dot per tier; the active dot tracks
 * the scroller's nearest card via a scroll listener.
 *
 * No mascot images, no WebGL/canvas shaders here on purpose — the
 * earlier version pulled in react-bits modules that weren't part of the
 * committed tree, breaking the CF build. Cards are static dark plates.
 */

const MORPH_TRANSITION: Transition = {
  duration: 0.55,
  ease: [0.22, 1, 0.36, 1],
};

interface TierCard {
  id: string;
  title: string;
  Icon: LucideIcon;
  short: string;
  body: string;
  accentText: string;
  accentHover: string;
}

const TIERS: ReadonlyArray<TierCard> = [
  {
    id: "public",
    title: "Public",
    Icon: Globe,
    short: "Plaintext on Walrus. Anyone can read.",
    body: "Submissions are uploaded as JSON to Walrus content-addressed storage; the on-chain SubmissionRef anchors the blob id. No encryption, no decrypt step — judges, respondents, or any onchain reader can fetch the payload. Best for community-facing surveys, NPS, or hackathon feedback you intend to publish.",
    accentText: "text-cyan-300/90",
    accentHover: "hover:ring-cyan-400/20",
  },
  {
    id: "admin",
    title: "Admin only",
    Icon: Lock,
    short: "Seal-encrypted to the FormOwnerCap holder.",
    body: "Payload is Seal IBE-encrypted to the form's tier identity before upload. Only the wallet holding the FormOwnerCap can request decryption from the Seal key servers. Respondents can't read their own submission after sending. Best for sensitive feedback (compensation, exit interviews) where the form owner is the only authorized reader.",
    accentText: "text-violet-300/90",
    accentHover: "hover:ring-violet-400/20",
  },
  {
    id: "threshold",
    title: "Threshold m-of-n",
    Icon: Users,
    short: "k unique cap holders post on-chain witnesses to decrypt.",
    body: "Each admin posts a shared ApprovalWitness object via echo::form::post_approval. Once ≥ k unique-signer witnesses exist for the form's Seal identity, seal_approve_threshold_m_of_n takes the witness vector, asserts count ≥ k + binds-to-form + distinct-signers, and unlocks decrypt permanently. A votes-to-release primitive, not an ongoing access gate.",
    accentText: "text-slate-300/90",
    accentHover: "hover:ring-slate-300/20",
  },
  {
    id: "timelocked",
    title: "Time-locked",
    Icon: Clock,
    short: "Seal refuses key-server signing until the unlock deadline.",
    body: "The form picks an unlock timestamp at create time. Seal's onchain time-lock predicate refuses key-server signing requests until the chain clock has passed it. After unlock, decryption becomes permissionless — anyone (you, respondents, the public) can fetch + decrypt. Sealed predictions, pre-registered hypotheses, exit-poll style surveys.",
    accentText: "text-amber-300/90",
    accentHover: "hover:ring-amber-400/20",
  },
  {
    id: "conditional",
    title: "Conditional",
    Icon: ShieldCheck,
    short: "Decryption gated by an arbitrary on-chain Move predicate.",
    body: "Custom decrypt-time rule: hold N of an NFT collection, own a SuiNS name, hold X balance of a coin type, hit any Move-callable predicate. Useful for grant-application reads (only DAO members can decrypt), allowlisted research (only paid subscribers), or community-moderated feedback (only verified residents).",
    accentText: "text-rose-300/90",
    accentHover: "hover:ring-rose-400/20",
  },
];

export function PrivacyTiersShowcase(): ReactNode {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const headingId = useId();
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId]);

  useEffect(() => {
    if (!activeId) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [activeId]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const cards = Array.from(el.children) as HTMLElement[];
      const center = el.scrollLeft + el.clientWidth / 2;
      let nearest = 0;
      let minDist = Infinity;
      cards.forEach((c, i) => {
        const cardCenter = c.offsetLeft + c.clientWidth / 2;
        const d = Math.abs(cardCenter - center);
        if (d < minDist) {
          minDist = d;
          nearest = i;
        }
      });
      setPage(nearest);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (idx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(TIERS.length - 1, idx));
    const card = el.children[clamped] as HTMLElement | undefined;
    if (card) {
      el.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
    }
    setPage(clamped);
  };

  const activeCard = activeId
    ? (TIERS.find((c) => c.id === activeId) ?? null)
    : null;

  return (
    <section
      id="tiers"
      aria-labelledby={headingId}
      className="relative scroll-mt-32 border-y border-border bg-background px-6 py-20 sm:px-10 sm:py-24 lg:px-14 lg:py-28"
    >
      <div className="mx-auto flex max-w-[1440px] flex-col gap-12 lg:gap-16">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-6 lg:max-w-[768px]"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Privacy
          </span>
          <h2
            id={headingId}
            className="text-4xl font-medium leading-[1.05] tracking-tighter text-foreground sm:text-5xl lg:text-[3.5rem] xl:text-[4rem]"
          >
            Five tiers,
            <br />
            one form.{" "}
            <span className="font-serif italic text-muted-foreground">
              Pick how locked.
            </span>
          </h2>
          <p className="max-w-[36rem] text-sm leading-relaxed text-muted-foreground sm:text-base">
            Every Echo form picks one privacy model at create time. From
            plaintext-on-Walrus to multi-admin threshold decrypt to time-locked
            sealed envelopes — click any tier to read the threat model.
          </p>
        </motion.div>

        <div
          ref={scrollerRef}
          className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-4 [scrollbar-width:none] sm:-mx-10 sm:px-10 lg:-mx-14 lg:px-14 [&::-webkit-scrollbar]:hidden"
        >
          {TIERS.map((card, i) => (
            <TierCarouselCard
              key={card.id}
              card={card}
              index={i}
              hidden={activeId === card.id}
              onClick={() => setActiveId(card.id)}
            />
          ))}
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => scrollTo(page - 1)}
            aria-label="previous tier"
            disabled={page === 0}
            className="flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-white/15 text-white/70 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
          >
            ‹
          </button>
          <div className="flex items-center gap-1.5">
            {TIERS.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => scrollTo(i)}
                aria-label={`go to ${c.title}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === page
                    ? "w-6 bg-foreground"
                    : "w-1.5 bg-foreground/25 hover:bg-foreground/40"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => scrollTo(page + 1)}
            aria-label="next tier"
            disabled={page === TIERS.length - 1}
            className="flex h-9 w-9 items-center justify-center rounded-full ring-1 ring-white/15 text-white/70 transition hover:bg-white/5 hover:text-white disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>

      <AnimatePresence>
        {activeCard ? (
          <ExpandedCard
            key="expanded"
            card={activeCard}
            onClose={() => setActiveId(null)}
          />
        ) : null}
      </AnimatePresence>
      <SectionCorners />
    </section>
  );
}

function TierCarouselCard({
  card,
  index,
  hidden,
  onClick,
}: {
  card: TierCard;
  index: number;
  hidden: boolean;
  onClick: () => void;
}): ReactNode {
  const { Icon } = card;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      layoutId={`tier-card-${card.id}`}
      transition={MORPH_TRANSITION}
      style={{ visibility: hidden ? "hidden" : "visible" }}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      animate={
        hidden
          ? undefined
          : {
              transition: {
                duration: 0.6,
                delay: index * 0.06,
                ease: [0.22, 1, 0.36, 1],
              },
            }
      }
      className={`group relative flex h-[360px] min-w-[280px] flex-1 shrink-0 basis-[calc(50%-0.5rem)] snap-start flex-col justify-between rounded-2xl bg-[#0a0a0c] p-7 text-left ring-1 ring-white/[0.06] transition hover:-translate-y-0.5 hover:ring-white/15 sm:basis-[calc(40%-0.5rem)] lg:basis-[calc(33.333%-0.667rem)] lg:p-8 ${card.accentHover}`}
    >
      <div className="flex items-start justify-between">
        <motion.div
          layoutId={`tier-icon-${card.id}`}
          transition={MORPH_TRANSITION}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-white/85 ring-1 ring-white/10"
        >
          <Icon className="h-4 w-4" strokeWidth={1.5} />
        </motion.div>
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${card.accentText}`}
        >
          Tier
        </span>
      </div>

      <div className="space-y-3">
        <motion.h3
          layoutId={`tier-title-${card.id}`}
          transition={MORPH_TRANSITION}
          className="text-2xl font-medium leading-[1.1] tracking-tight text-white sm:text-3xl"
        >
          {card.title}
        </motion.h3>
        <p className="max-w-[34ch] text-sm leading-relaxed text-white/65">
          {card.short}
        </p>
        <motion.span
          layoutId={`tier-plus-${card.id}`}
          aria-hidden="true"
          transition={MORPH_TRANSITION}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/85 ring-1 ring-white/10 transition group-hover:bg-white/15 group-hover:scale-105"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
        </motion.span>
      </div>
    </motion.button>
  );
}

function ExpandedCard({
  card,
  onClose,
}: {
  card: TierCard;
  onClose: () => void;
}): ReactNode {
  const { Icon } = card;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 sm:p-10">
      <motion.button
        type="button"
        aria-label="Close"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-0 cursor-default bg-background/70 backdrop-blur-xl"
      />

      <motion.div
        layoutId={`tier-card-${card.id}`}
        transition={MORPH_TRANSITION}
        className="relative z-10 flex w-full max-w-[540px] flex-col overflow-hidden rounded-2xl bg-[#0a0a0c] p-8 ring-1 ring-white/10 sm:p-10"
      >
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              layoutId={`tier-icon-${card.id}`}
              transition={MORPH_TRANSITION}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-white/85 ring-1 ring-white/10"
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
            </motion.div>
            <span
              className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${card.accentText}`}
            >
              Privacy tier
            </span>
          </div>
          <motion.button
            type="button"
            onClick={onClose}
            layoutId={`tier-plus-${card.id}`}
            transition={MORPH_TRANSITION}
            aria-label="Close card"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/85 ring-1 ring-white/10 transition hover:bg-white/15"
          >
            <motion.span
              className="inline-flex"
              initial={{ rotate: 0 }}
              animate={{ rotate: 45 }}
              transition={MORPH_TRANSITION}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
            </motion.span>
          </motion.button>
        </div>

        <motion.h3
          layoutId={`tier-title-${card.id}`}
          transition={MORPH_TRANSITION}
          className="text-3xl font-medium leading-[1.05] tracking-tight text-white sm:text-4xl"
        >
          {card.title}
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.35, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 text-[15px] leading-[1.65] text-white/70 sm:text-base"
        >
          {card.body}
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-white/40"
        >
          <kbd className="rounded-md border border-white/15 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/60">
            esc
          </kbd>
          <span>to close</span>
        </motion.div>
      </motion.div>
    </div>
  );
}
