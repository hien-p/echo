"use client";

import { AnimatePresence, motion, type Transition } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Globe,
  Lock,
  Users,
  Clock,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SectionCorners } from "@/components/shell";

/**
 * Privacy-tier explainer with a horizontal card scroller + click-to-
 * morph-expand modal. Adapted from the wireframe Showcase component;
 * each of the 5 cards is one of Echo's privacy tiers, and the expanded
 * modal explains the threat model + key flow.
 *
 * Replaces the previous flat 5-col PrivacyTiers grid — the tiers are
 * Echo's killer differentiator, so they deserve a beat of their own.
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
}

const TIERS: ReadonlyArray<TierCard> = [
  {
    id: "public",
    title: "Public",
    Icon: Globe,
    short: "Plaintext on Walrus. Anyone can read.",
    body: "Submissions are uploaded as JSON to Walrus content-addressed storage; the on-chain SubmissionRef anchors the blob id. No encryption, no decrypt step — judges, respondents, or any onchain reader can fetch the payload. Best for community-facing surveys, NPS, or hackathon feedback you intend to publish.",
  },
  {
    id: "admin",
    title: "Admin only",
    Icon: Lock,
    short: "Seal-encrypted to the FormOwnerCap holder.",
    body: "Payload is Seal IBE-encrypted to the form's tier identity before upload. Only the wallet holding the FormOwnerCap can request decryption from the Seal key servers. Respondents can't read their own submission after sending. Best for sensitive feedback (compensation, exit interviews) where the form owner is the only authorized reader.",
  },
  {
    id: "threshold",
    title: "Threshold m-of-n",
    Icon: Users,
    short: "k unique cap holders post on-chain witnesses to decrypt.",
    body: "Each admin posts a shared ApprovalWitness object via echo::form::post_approval. Once ≥ k unique-signer witnesses exist for the form's Seal identity, seal_approve_threshold_m_of_n takes the witness vector, asserts count ≥ k + binds-to-form + distinct-signers, and unlocks decrypt permanently. A votes-to-release primitive, not an ongoing access gate.",
  },
  {
    id: "timelocked",
    title: "Time-locked",
    Icon: Clock,
    short: "Seal refuses key-server signing until the unlock deadline.",
    body: "The form picks an unlock timestamp at create time. Seal's onchain time-lock predicate refuses key-server signing requests until the chain clock has passed it. After unlock, decryption becomes permissionless — anyone (you, respondents, the public) can fetch + decrypt. Sealed predictions, pre-registered hypotheses, exit-poll style surveys.",
  },
  {
    id: "conditional",
    title: "Conditional",
    Icon: ShieldCheck,
    short: "Decryption gated by an arbitrary on-chain Move predicate.",
    body: "Custom decrypt-time rule: hold N of an NFT collection, own a SuiNS name, hold X balance of a coin type, hit any Move-callable predicate. Useful for grant-application reads (only DAO members can decrypt), allowlisted research (only paid subscribers), or community-moderated feedback (only verified residents).",
  },
];

export function PrivacyTiersShowcase(): ReactNode {
  const [activeId, setActiveId] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const headingId = useId();

  const recompute = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const firstCard = track.querySelector<HTMLElement>("[data-card]");
    if (!firstCard) return;
    const cardWidth = firstCard.getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(track).columnGap || "0");
    const step = cardWidth + gap;
    if (step <= 0) {
      setPage(0);
      setPageCount(1);
      return;
    }
    const totalScrollable = track.scrollWidth - track.clientWidth;
    const pages = Math.max(1, Math.round(totalScrollable / step) + 1);
    const current = Math.round(track.scrollLeft / step);
    setPageCount(pages);
    setPage(Math.min(pages - 1, Math.max(0, current)));
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const onScroll = () => recompute();
    track.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => recompute());
    ro.observe(track);
    return () => {
      track.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [recompute]);

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

  const scrollByCards = useCallback((direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const firstCard = track.querySelector<HTMLElement>("[data-card]");
    if (!firstCard) return;
    const cardWidth = firstCard.getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(track).columnGap || "0");
    track.scrollBy({
      left: direction * (cardWidth + gap),
      behavior: "smooth",
    });
  }, []);

  const activeCard = activeId
    ? (TIERS.find((c) => c.id === activeId) ?? null)
    : null;

  return (
    <section
      aria-labelledby={headingId}
      className="relative border-y border-border bg-background"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col justify-center px-6 py-16 sm:px-10 sm:py-20 lg:border-r lg:border-border lg:px-14 lg:py-24">
          <span className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Privacy
          </span>
          <h2
            id={headingId}
            className="text-4xl font-medium leading-[1.05] tracking-tighter text-foreground sm:text-5xl lg:text-[3.5rem] xl:text-[4rem]"
          >
            Five tiers,
            <br />
            one form.
            <br />
            <span className="font-serif italic text-muted-foreground">
              Pick how locked.
            </span>
          </h2>
          <p className="mt-10 max-w-[28rem] text-sm leading-relaxed text-muted-foreground sm:text-base">
            Every Echo form picks one privacy model at create time. From
            plaintext-on-Walrus to multi-admin threshold decrypt to time-locked
            sealed envelopes — click any tier to read the threat model.
          </p>
        </div>

        <div className="relative flex flex-col overflow-hidden">
          <div
            ref={trackRef}
            className="flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto scroll-smooth px-6 py-16 sm:gap-6 sm:px-10 sm:py-20 lg:px-14 lg:py-24 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {TIERS.map((card) => (
              <Card
                key={card.id}
                card={card}
                hidden={activeId === card.id}
                onClick={() => setActiveId(card.id)}
              />
            ))}
            <div
              aria-hidden="true"
              className="shrink-0 basis-6 sm:basis-10 lg:basis-14"
            />
          </div>

          <div className="flex items-center justify-center gap-2 px-6 pb-10 sm:px-10 sm:pb-12 lg:px-14 lg:pb-14">
            <button
              type="button"
              onClick={() => scrollByCards(-1)}
              disabled={page === 0}
              aria-label="Previous tier"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div
              role="tablist"
              aria-label="Tier progress"
              className="flex h-8 items-center gap-2 rounded-full bg-muted px-4"
            >
              {Array.from({ length: pageCount }).map((_, i) => (
                <span
                  key={i}
                  role="tab"
                  aria-selected={i === page}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === page
                      ? "w-6 bg-foreground"
                      : "w-1.5 bg-muted-foreground/40"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => scrollByCards(1)}
              disabled={page >= pageCount - 1}
              aria-label="Next tier"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
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

function Card({
  card,
  hidden,
  onClick,
}: {
  card: TierCard;
  hidden: boolean;
  onClick: () => void;
}): ReactNode {
  const { Icon } = card;
  return (
    <motion.button
      type="button"
      data-card
      onClick={onClick}
      layoutId={`tier-card-${card.id}`}
      transition={MORPH_TRANSITION}
      style={{ visibility: hidden ? "hidden" : "visible" }}
      className="group relative flex aspect-[3/4] w-[280px] shrink-0 cursor-pointer snap-center flex-col justify-between rounded-2xl bg-muted p-6 text-left sm:w-[320px] sm:p-7 lg:w-[360px] lg:p-8"
    >
      <motion.div
        layoutId={`tier-icon-${card.id}`}
        transition={MORPH_TRANSITION}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-background/60 text-foreground"
      >
        <Icon className="h-4 w-4" strokeWidth={1.5} />
      </motion.div>
      <div className="space-y-5">
        <motion.h3
          layoutId={`tier-title-${card.id}`}
          transition={MORPH_TRANSITION}
          className="text-2xl font-medium leading-tight tracking-tight text-foreground sm:text-3xl"
        >
          {card.title}
        </motion.h3>
        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {card.short}
        </p>
        <motion.span
          layoutId={`tier-plus-${card.id}`}
          aria-hidden="true"
          transition={MORPH_TRANSITION}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/60 text-foreground"
        >
          <Plus className="h-4 w-4" strokeWidth={1.5} />
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
        className="absolute inset-0 cursor-default bg-background/60 backdrop-blur-xl"
      />

      <motion.div
        layoutId={`tier-card-${card.id}`}
        transition={MORPH_TRANSITION}
        className="relative z-10 flex aspect-[3/4] w-full max-w-[420px] flex-col justify-between rounded-2xl bg-muted p-8 sm:aspect-auto sm:max-w-[640px] sm:p-10 lg:p-12"
      >
        <motion.div
          layoutId={`tier-icon-${card.id}`}
          transition={MORPH_TRANSITION}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-background/60 text-foreground"
        >
          <Icon className="h-4 w-4" strokeWidth={1.5} />
        </motion.div>

        <div className="mt-8 space-y-6 sm:mt-12">
          <motion.h3
            layoutId={`tier-title-${card.id}`}
            transition={MORPH_TRANSITION}
            className="text-2xl font-medium leading-tight tracking-tight text-foreground sm:text-3xl lg:text-4xl"
          >
            {card.title}
          </motion.h3>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{
              duration: 0.35,
              delay: 0.18,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base"
          >
            {card.body}
          </motion.p>
          <motion.button
            type="button"
            onClick={onClose}
            layoutId={`tier-plus-${card.id}`}
            transition={MORPH_TRANSITION}
            aria-label="Close card"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/60 text-foreground transition-opacity hover:opacity-80"
          >
            <motion.span
              className="inline-flex"
              animate={{ rotate: 45 }}
              transition={MORPH_TRANSITION}
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
            </motion.span>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
