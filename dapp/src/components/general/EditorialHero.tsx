"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import AuroraBlur from "@/components/react-bits/aurora-blur";
import StaggeredText from "@/components/react-bits/staggered-text";

/**
 * Editorial hero, aligned with the homepage's aesthetic so /dashboard
 * stops feeling like a sibling site:
 *
 *   - bg-background (respects defaultTheme = dark from SuiProvider)
 *   - WebGL aurora shader bg (react-bits AuroraBlur, toned-down so it
 *     reads as ambience instead of a marketing demo)
 *   - clamp display type matching MarketingHero
 *     (text-[clamp(3rem,8vw,12rem)]) + font-serif italic accent on the
 *     last line — same pattern as "belongs to you." on /
 *   - WalrusBlobs anchored bottom corners (caller passes them)
 *   - optional CTA card rises centrally between the corner decorations
 *   - scroll indicator at the bottom
 *
 * Caller controls eyebrow / ghost line / solid line / accent / subhead
 * / pill / cta / decorations.
 */
export function EditorialHero({
  eyebrow,
  ghostLine,
  solidLine,
  accentLine,
  description,
  pill,
  cta,
  leftDecoration,
  rightDecoration,
  backDecoration,
  minHeight = "min(86vh, 620px)",
  scrollLabel = "Scroll to explore",
}: {
  eyebrow?: string;
  /** First line, faded — sets up the punchline. */
  ghostLine: string;
  /** Second line, full-strength. */
  solidLine: string;
  /** Optional third line rendered in font-serif italic (the
   *  "belongs to you." moment on /). */
  accentLine?: string;
  description?: string;
  pill?: ReactNode;
  cta?: ReactNode;
  leftDecoration?: ReactNode;
  rightDecoration?: ReactNode;
  backDecoration?: ReactNode;
  minHeight?: string;
  scrollLabel?: string;
}) {
  return (
    <section
      className="relative -mx-4 overflow-hidden bg-background text-foreground sm:-mx-8 lg:-mx-12"
      style={{ minHeight }}
    >
      {/* Aurora shader bg — same idiom as MarketingHero's ShaderPlane,
          but via the existing react-bits component. Walrus palette tints
          (steel-blue / violet / faint emerald / amber). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-70"
      >
        <AuroraBlur
          width="100%"
          height="100%"
          speed={0.55}
          opacity={0.85}
          bloomIntensity={2.6}
          brightness={1}
          saturation={1.2}
          verticalFade={1.25}
          noiseScale={2.3}
          layers={[
            { color: "#5B8DEF", speed: 0.32, intensity: 0.6 },
            { color: "#A78BFA", speed: 0.18, intensity: 0.45 },
            { color: "#34D399", speed: 0.24, intensity: 0.22 },
            { color: "#FBBF24", speed: 0.12, intensity: 0.18 },
          ]}
          skyLayers={[
            { color: "#0A0A0B", blend: 0.5 },
            { color: "#15151A", blend: 0.55 },
          ]}
        />
      </div>

      {/* Back decoration (z-0 — behind the H1 but above the aurora) */}
      <div className="absolute inset-0 z-[1]">{backDecoration}</div>

      {/* Text content — centered column, top-anchored */}
      <div className="relative z-[3] flex flex-col items-center px-6 pt-32 text-center sm:pt-36 md:pt-44">
        {eyebrow && (
          <motion.span
            initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
            className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-foreground/55 sm:text-sm"
          >
            {eyebrow}
          </motion.span>
        )}

        {/* Headline triplet — each line is a react-bits StaggeredText so
            the words rise + un-blur individually. The lines previously
            sat too close ("text dinh hoi gan"); bumped line-height
            1.02 → 1.12 and added explicit per-line top margin so the
            ghost/solid/accent lines breathe. */}
        <h1
          className="flex flex-col font-medium text-foreground"
          style={{ letterSpacing: "-0.02em", lineHeight: 1.12 }}
        >
          <StaggeredText
            as="span"
            text={ghostLine}
            segmentBy="words"
            direction="bottom"
            blur
            duration={0.8}
            delay={70}
            staggerDirection="forward"
            className="block text-[clamp(2.25rem,6vw,5.5rem)] text-foreground/35"
          />
          <StaggeredText
            as="span"
            text={solidLine}
            segmentBy="words"
            direction="bottom"
            blur
            duration={0.8}
            delay={70}
            staggerDirection="forward"
            className="mt-2 block text-[clamp(2.25rem,6vw,5.5rem)] sm:mt-3"
          />
          {accentLine && (
            <span className="mt-2 block text-[clamp(2.25rem,6vw,5.5rem)] sm:mt-3">
              <em className="font-serif text-foreground/85">
                <StaggeredText
                  as="span"
                  text={accentLine}
                  segmentBy="words"
                  direction="bottom"
                  blur
                  duration={0.85}
                  delay={80}
                  staggerDirection="forward"
                  className="inline"
                />
              </em>
            </span>
          )}
        </h1>

        {pill && (
          <motion.div
            initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, delay: 0.55, ease: "easeOut" }}
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-foreground/5 px-4 py-2 text-sm font-medium text-foreground/80 backdrop-blur"
          >
            {pill}
          </motion.div>
        )}

        {description && (
          <motion.p
            initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, delay: 0.7, ease: "easeOut" }}
            className="mt-6 max-w-[460px] text-base leading-relaxed text-foreground/65 sm:text-lg"
          >
            {description}
          </motion.p>
        )}
      </div>

      {/* Corner decorations */}
      {leftDecoration}
      {rightDecoration}

      {/* CTA */}
      {cta && (
        <motion.div
          initial={{ opacity: 0, y: 80, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="absolute bottom-0 left-0 right-0 z-[5] flex justify-center px-6"
          style={{ pointerEvents: "none" }}
        >
          <div className="pointer-events-auto mb-20">{cta}</div>
        </motion.div>
      )}

      {/* Bottom fade into the rest of the page */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-[6]"
        style={{
          height: 180,
          background:
            "linear-gradient(to top, var(--color-background) 0%, transparent 100%)",
        }}
      />

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, -4, 0] }}
        transition={{
          opacity: { duration: 0.6, delay: 1.2 },
          y: { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
        }}
        className="absolute bottom-3 left-0 right-0 z-20 mx-auto w-fit"
      >
        <div className="flex items-center gap-2 text-foreground/60">
          <motion.span
            aria-hidden="true"
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="inline-block h-2 w-2 rounded-full bg-foreground/70"
          />
          <span
            className="text-sm font-medium"
            style={{ letterSpacing: "-0.28px" }}
          >
            {scrollLabel}
          </span>
        </div>
      </motion.div>
    </section>
  );
}
