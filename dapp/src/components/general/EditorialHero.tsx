"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { StoneReveal } from "@/components/marketing/StoneReveal";

/**
 * Synex-style editorial hero — generic, content-agnostic.
 *
 * Composition (port of the Synex spec):
 *   - warm paper background (#F2F2F0)
 *   - soft radial halo gradient at top center
 *   - optional eyebrow label
 *   - two-line H1: ghost line + solid line
 *   - optional subhead paragraph
 *   - optional inline pill below H1 (counts / tags / status)
 *   - two photoreal stones at bottom corners with mossy hover reveal
 *   - optional centered CTA card rising between the stones
 *   - bottom dark fade + scroll indicator with spinning star
 *
 * Consumed by /dashboard (admin overview hero). Pass per-page copy
 * via props; the visual treatment stays constant.
 */
export function EditorialHero({
  eyebrow,
  ghostLine,
  solidLine,
  description,
  pill,
  cta,
  minHeight = "min(100vh, 720px)",
}: {
  eyebrow?: string;
  ghostLine: string;
  solidLine: string;
  description?: string;
  /** Inline pill below H1 — e.g. "7 forms · 32 submissions". */
  pill?: ReactNode;
  /** Optional centered card rising between the stones (CTA, status). */
  cta?: ReactNode;
  minHeight?: string;
}) {
  return (
    <section
      className="relative -mx-4 overflow-hidden sm:-mx-8 lg:-mx-12"
      style={{
        backgroundColor: "#F2F2F0",
        color: "#05050C",
        fontFamily: "var(--font-display)",
        minHeight,
      }}
    >
      {/* Soft halo gradient at top center */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(220,220,215,0.6) 0%, transparent 70%)",
        }}
      />

      {/* Text content — centered column, top-anchored */}
      <div className="relative z-[3] flex flex-col items-center px-6 pt-24 text-center sm:pt-28 md:pt-36">
        {eyebrow && (
          <motion.span
            initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
            className="mb-3 text-xs font-medium sm:text-[13px] md:text-sm"
            style={{ color: "rgba(0,0,0,0.50)" }}
          >
            {eyebrow}
          </motion.span>
        )}

        <h1
          className="font-medium"
          style={{
            letterSpacing: "-1.36px",
            lineHeight: 1.05,
            fontFamily: "var(--font-display)",
          }}
        >
          <motion.span
            initial={{ opacity: 0, y: 24, filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            className="block text-[34px] sm:text-[44px] md:text-[56px] lg:text-[68px]"
            style={{ color: "rgba(0,0,0,0.20)" }}
          >
            {ghostLine}
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 24, filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, delay: 0.32, ease: "easeOut" }}
            className="block text-[34px] sm:text-[44px] md:text-[56px] lg:text-[68px]"
            style={{ color: "#05050C" }}
          >
            {solidLine}
          </motion.span>
        </h1>

        {pill && (
          <motion.div
            initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, delay: 0.45, ease: "easeOut" }}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-black/5 px-4 py-1.5 text-sm font-medium"
            style={{ color: "rgba(0,0,0,0.65)" }}
          >
            {pill}
          </motion.div>
        )}

        {description && (
          <motion.p
            initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, delay: 0.55, ease: "easeOut" }}
            className="mt-5 max-w-[460px] text-sm font-medium sm:text-base md:text-lg"
            style={{ color: "rgba(0,0,0,0.45)" }}
          >
            {description}
          </motion.p>
        )}
      </div>

      {/* Stones */}
      <StoneReveal
        side="left"
        zBase={1}
        zGrass={2}
        baseSrc="https://qclay.design/lovable/synex/stone-left.png"
        grassSrc="https://qclay.design/lovable/synex/stone-g-left.png"
      />
      <StoneReveal
        side="right"
        zBase={4}
        zGrass={5}
        baseSrc="https://qclay.design/lovable/synex/stone-right.png"
        grassSrc="https://qclay.design/lovable/synex/stone-g-right.png"
      />

      {/* Optional CTA card rising centered between stones */}
      {cta && (
        <motion.div
          initial={{ opacity: 0, y: 80, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="absolute bottom-0 left-0 right-0 z-[3] flex justify-center px-6"
          style={{ pointerEvents: "none" }}
        >
          <div className="pointer-events-auto mb-12">{cta}</div>
        </motion.div>
      )}

      {/* Bottom dark fade */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-[6]"
        style={{
          height: 220,
          background:
            "linear-gradient(to top, rgba(5,5,12,0.85) 0%, rgba(5,5,12,0.5) 40%, transparent 100%)",
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
        className="absolute bottom-2.5 left-0 right-0 z-20 mx-auto w-fit"
      >
        <div className="flex items-center gap-2">
          <motion.img
            src="https://qclay.design/lovable/synex/star.svg"
            alt=""
            aria-hidden="true"
            width={14}
            height={14}
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <span
            className="text-sm font-medium"
            style={{ letterSpacing: "-0.28px", color: "#FFF" }}
          >
            Scroll to dashboard
          </span>
        </div>
      </motion.div>
    </section>
  );
}
