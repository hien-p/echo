"use client";

import { AnimatePresence, motion, type Transition } from "motion/react";
import dynamic from "next/dynamic";
import Image from "next/image";
import {
  Plus,
  X,
  Globe,
  Lock,
  Users,
  Clock,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { SectionCorners } from "@/components/shell";

/**
 * Privacy tiers as a refined vertical bento mosaic. Each card carries
 * a subtle WebGL/canvas ambient (silk-waves, metallic-swirl, grain-wave,
 * aurora-blur) — all rendered behind a strong overlay so typography is
 * the hero. Palette is unified: dark base + one accent hue per tier,
 * not a rainbow. Click any card to morph-expand into a compact modal
 * (max-w-540, icon+title row, top-right close, ESC hint).
 *
 * WebGL contexts only mount when the card scrolls into view via
 * IntersectionObserver to keep the initial paint cheap.
 */

const MORPH_TRANSITION: Transition = {
  duration: 0.55,
  ease: [0.22, 1, 0.36, 1],
};

const SilkWaves = dynamic(() => import("@/components/react-bits/silk-waves"), {
  ssr: false,
});
const MetallicSwirl = dynamic(
  () => import("@/components/react-bits/metallic-swirl"),
  { ssr: false },
);
const GrainWave = dynamic(() => import("@/components/react-bits/grain-wave"), {
  ssr: false,
});
const AuroraBlur = dynamic(
  () => import("@/components/react-bits/aurora-blur"),
  { ssr: false },
);

interface ShaderEntry {
  Component: ComponentType<Record<string, unknown>>;
  props: Record<string, unknown>;
}

interface TierCard {
  id: string;
  title: string;
  Icon: LucideIcon;
  short: string;
  body: string;
  span: string;
  minH: string;
  imageSrc: string;
  imagePosition: string;
  pixelTone: string;
  // Subtle hue tint via accent color tokens.
  accentText: string; // accent for tier label
  accentHover: string; // ring color on hover
  // Strong overlay so the shader doesn't fight the copy.
  overlay: string;
  shader: ShaderEntry;
}

const TIERS: ReadonlyArray<TierCard> = [
  {
    id: "public",
    title: "Public",
    Icon: Globe,
    short: "Plaintext on Walrus. Anyone can read.",
    body: "Submissions are uploaded as JSON to Walrus content-addressed storage; the on-chain SubmissionRef anchors the blob id. No encryption, no decrypt step — judges, respondents, or any onchain reader can fetch the payload. Best for community-facing surveys, NPS, or hackathon feedback you intend to publish.",
    span: "md:col-span-3 lg:col-span-2 lg:row-span-2",
    minH: "min-h-[280px] lg:min-h-[440px]",
    imageSrc: "/assets/frame/walrus-hero.webp",
    imagePosition: "50% 42%",
    pixelTone: "96, 191, 255",
    accentText: "text-cyan-300/90",
    accentHover: "hover:ring-cyan-400/20",
    overlay:
      "bg-gradient-to-b from-background/30 via-background/60 to-background/95",
    shader: {
      Component: SilkWaves as ComponentType<Record<string, unknown>>,
      props: {
        speed: 0.35,
        scale: 2.5,
        colors: [
          "#040a14",
          "#06121f",
          "#0a1f33",
          "#13334d",
          "#1c4666",
          "#246082",
          "#3a7fa3",
          "#5a9cc4",
        ],
        brightness: 0.55,
      },
    },
  },
  {
    id: "admin",
    title: "Admin only",
    Icon: Lock,
    short: "Seal-encrypted to the FormOwnerCap holder.",
    body: "Payload is Seal IBE-encrypted to the form's tier identity before upload. Only the wallet holding the FormOwnerCap can request decryption from the Seal key servers. Respondents can't read their own submission after sending. Best for sensitive feedback (compensation, exit interviews) where the form owner is the only authorized reader.",
    span: "md:col-span-3 lg:col-span-4",
    minH: "min-h-[240px]",
    imageSrc: "/assets/frame/aurora.webp",
    imagePosition: "50% 50%",
    pixelTone: "167, 139, 250",
    accentText: "text-violet-300/90",
    accentHover: "hover:ring-violet-400/20",
    overlay:
      "bg-gradient-to-r from-background/40 via-background/55 to-background/90",
    shader: {
      Component: MetallicSwirl as ComponentType<Record<string, unknown>>,
      props: {
        speed: 0.3,
        zoom: 1.4,
        iterations: 6,
      },
    },
  },
  {
    id: "threshold",
    title: "Threshold m-of-n",
    Icon: Users,
    short: "k unique cap holders post on-chain witnesses to decrypt.",
    body: "Each admin posts a shared ApprovalWitness object via echo::form::post_approval. Once ≥ k unique-signer witnesses exist for the form's Seal identity, seal_approve_threshold_m_of_n takes the witness vector, asserts count ≥ k + binds-to-form + distinct-signers, and unlocks decrypt permanently. A votes-to-release primitive, not an ongoing access gate.",
    span: "md:col-span-3 lg:col-span-2",
    minH: "min-h-[240px]",
    imageSrc: "/assets/frame/dither-plate.svg",
    imagePosition: "50% 50%",
    pixelTone: "203, 213, 225",
    accentText: "text-slate-300/90",
    accentHover: "hover:ring-slate-300/20",
    overlay:
      "bg-gradient-to-b from-background/40 via-background/65 to-background/95",
    shader: {
      Component: GrainWave as ComponentType<Record<string, unknown>>,
      props: {
        speed: 0.35,
        waveCount: 18,
        waveAmplitude: 0.6,
        waveFrequency: 1.4,
        lineThickness: 0.9,
        grainIntensity: 0.5,
        startColor: "#7c8aa3",
        endColor: "#2a3344",
        darkBackground: "#070a10",
      },
    },
  },
  {
    id: "timelocked",
    title: "Time-locked",
    Icon: Clock,
    short: "Seal refuses key-server signing until the unlock deadline.",
    body: "The form picks an unlock timestamp at create time. Seal's onchain time-lock predicate refuses key-server signing requests until the chain clock has passed it. After unlock, decryption becomes permissionless — anyone (you, respondents, the public) can fetch + decrypt. Sealed predictions, pre-registered hypotheses, exit-poll style surveys.",
    span: "md:col-span-3 lg:col-span-2",
    minH: "min-h-[240px]",
    imageSrc: "/assets/frame/walrus-face.webp",
    imagePosition: "54% 45%",
    pixelTone: "251, 191, 36",
    accentText: "text-amber-300/90",
    accentHover: "hover:ring-amber-400/20",
    overlay:
      "bg-gradient-to-b from-background/40 via-background/65 to-background/95",
    shader: {
      Component: AuroraBlur as ComponentType<Record<string, unknown>>,
      props: {
        speed: 0.5,
        noiseScale: 1.5,
        movementX: 0.4,
        movementY: 0.1,
        bloomIntensity: 1.4,
        verticalFade: 0.6,
        layers: [
          { color: "#a16207", speed: 0.4, intensity: 0.55 },
          { color: "#d97706", speed: 0.3, intensity: 0.45 },
          { color: "#7c2d12", speed: 0.5, intensity: 0.4 },
        ],
        skyLayers: [
          { color: "#0a0703", blend: 1 },
          { color: "#1a0f04", blend: 0.7 },
        ],
        brightness: 0.7,
      },
    },
  },
  {
    id: "conditional",
    title: "Conditional",
    Icon: ShieldCheck,
    short: "Decryption gated by an arbitrary on-chain Move predicate.",
    body: "Custom decrypt-time rule: hold N of an NFT collection, own a SuiNS name, hold X balance of a coin type, hit any Move-callable predicate. Useful for grant-application reads (only DAO members can decrypt), allowlisted research (only paid subscribers), or community-moderated feedback (only verified residents).",
    span: "md:col-span-6 lg:col-span-2",
    minH: "min-h-[240px]",
    imageSrc: "/assets/frame/walrus-standalone.webp",
    imagePosition: "50% 48%",
    pixelTone: "251, 113, 133",
    accentText: "text-rose-300/90",
    accentHover: "hover:ring-rose-400/20",
    overlay:
      "bg-gradient-to-b from-background/40 via-background/65 to-background/95",
    shader: {
      Component: AuroraBlur as ComponentType<Record<string, unknown>>,
      props: {
        speed: 0.45,
        noiseScale: 2,
        movementX: -0.3,
        movementY: 0.2,
        bloomIntensity: 1.3,
        verticalFade: 0.7,
        layers: [
          { color: "#9f1239", speed: 0.4, intensity: 0.5 },
          { color: "#831843", speed: 0.3, intensity: 0.45 },
          { color: "#581c4f", speed: 0.5, intensity: 0.4 },
        ],
        skyLayers: [
          { color: "#0a0306", blend: 1 },
          { color: "#1a0810", blend: 0.7 },
        ],
        brightness: 0.65,
      },
    },
  },
];

export function PrivacyTiersShowcase(): ReactNode {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const headingId = useId();
  // Two cards visible per page on lg+, one on small screens. Total 5
  // tiers → 3 pages on lg, 5 on small. Dot count = TIERS.length so the
  // user sees one dot per tier regardless of viewport.
  const pageCount = TIERS.length;

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

  const activeCard = activeId
    ? (TIERS.find((c) => c.id === activeId) ?? null)
    : null;

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollTo = (idx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(pageCount - 1, idx));
    const card = el.children[clamped] as HTMLElement | undefined;
    if (card) {
      el.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
    }
    setPage(clamped);
  };

  // Track scroll position → derive active dot.
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

  return (
    <section
      aria-labelledby={headingId}
      className="relative border-y border-border bg-background px-6 py-20 sm:px-10 sm:py-24 lg:px-14 lg:py-28"
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
            disabled={page === pageCount - 1}
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

function BentoCard({
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
  const ref = useRef<HTMLButtonElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);

  const Shader = card.shader.Component;

  return (
    <motion.button
      ref={ref}
      type="button"
      onClick={onClick}
      layoutId={`tier-card-${card.id}`}
      transition={MORPH_TRANSITION}
      style={{ visibility: hidden ? "hidden" : "visible" }}
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-80px" }}
      animate={
        hidden
          ? undefined
          : {
              transition: {
                duration: 0.7,
                delay: index * 0.08,
                ease: [0.22, 1, 0.36, 1],
              },
            }
      }
      className={`group relative isolate flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl bg-[#0a0a0c] p-6 text-left ring-1 ring-white/[0.06] transition-all duration-300 hover:-translate-y-0.5 hover:ring-white/15 sm:p-7 lg:p-8 ${card.span} ${card.minH} ${card.accentHover}`}
    >
      <PixelImageLayer card={card} eager={index < 2} />
      {/* Ambient shader — mounts only when in view */}
      <div className="absolute inset-0 -z-30 opacity-70" aria-hidden="true">
        {inView ? <Shader {...card.shader.props} /> : null}
      </div>
      {/* Readability overlay */}
      <div
        className={`pointer-events-none absolute inset-0 -z-10 ${card.overlay}`}
        aria-hidden="true"
      />

      <div className="flex items-start justify-between">
        <motion.div
          layoutId={`tier-icon-${card.id}`}
          transition={MORPH_TRANSITION}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-white/85 ring-1 ring-white/10 backdrop-blur-md"
        >
          <Icon className="h-4 w-4" strokeWidth={1.5} />
        </motion.div>
        <span
          className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${card.accentText}`}
        >
          Tier
        </span>
      </div>

      <div className="space-y-3 lg:space-y-4">
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
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/85 ring-1 ring-white/10 backdrop-blur-md transition group-hover:bg-white/15 group-hover:scale-105"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
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
  const Shader = card.shader.Component;
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
        <PixelImageLayer card={card} eager />
        {/* Ambient shader inside modal */}
        <div className="absolute inset-0 -z-30 opacity-70" aria-hidden="true">
          <Shader {...card.shader.props} />
        </div>
        <div
          className={`pointer-events-none absolute inset-0 -z-10 ${card.overlay}`}
          aria-hidden="true"
        />

        {/* Header row: icon + tier label + close button */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              layoutId={`tier-icon-${card.id}`}
              transition={MORPH_TRANSITION}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-white/85 ring-1 ring-white/10 backdrop-blur-md"
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/85 ring-1 ring-white/10 backdrop-blur-md transition hover:bg-white/15"
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
          transition={{
            duration: 0.35,
            delay: 0.2,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="mt-5 text-[15px] leading-[1.65] text-white/70 sm:text-base"
        >
          {card.body}
        </motion.p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: 0.35,
            delay: 0.35,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="mt-8 flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-white/40"
        >
          <kbd className="rounded-md border border-white/15 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/60">
            esc
          </kbd>
          <span>to close</span>
        </motion.div>
      </motion.div>

      {/* Mobile-only floating close (in case kbd hint isn't reachable) */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close (mobile)"
        className="absolute right-4 top-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full bg-foreground/10 text-foreground ring-1 ring-foreground/15 backdrop-blur-md transition hover:bg-foreground/20 sm:hidden"
      >
        <X className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}

function PixelImageLayer({
  card,
  eager = false,
}: {
  card: TierCard;
  eager?: boolean;
}): ReactNode {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-20"
      aria-hidden="true"
    >
      <Image
        src={card.imageSrc}
        alt=""
        fill
        priority={eager}
        sizes="(max-width: 768px) 100vw, 38vw"
        className="scale-110 object-cover opacity-[0.34] saturate-[0.85] transition duration-500 [image-rendering:pixelated] group-hover:scale-[1.14] group-hover:opacity-[0.45]"
        style={{ objectPosition: card.imagePosition }}
      />
      <div
        className="absolute inset-0 opacity-45 mix-blend-screen"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(${card.pixelTone}, 0.2) 1px, transparent 1px), linear-gradient(0deg, rgba(${card.pixelTone}, 0.16) 1px, transparent 1px)`,
          backgroundSize: "9px 9px",
        }}
      />
      <div
        className="absolute inset-0 opacity-70 mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 20%, rgba(255,255,255,0.22) 0 1px, transparent 1px), radial-gradient(circle at 72% 68%, rgba(255,255,255,0.16) 0 1px, transparent 1px)",
          backgroundSize: "14px 14px, 18px 18px",
        }}
      />
      <div
        className="absolute inset-0 opacity-35 mix-blend-color-dodge"
        style={{
          backgroundImage: `linear-gradient(135deg, transparent 0 44%, rgba(${card.pixelTone}, 0.32) 44% 56%, transparent 56% 100%)`,
          backgroundSize: "18px 18px",
        }}
      />
    </div>
  );
}
