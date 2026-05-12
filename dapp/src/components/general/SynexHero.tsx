"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { StoneReveal } from "@/components/marketing/StoneReveal";
import { TIER_META } from "@/components/shell/TierChip";

/**
 * Synex-style editorial hero for /forms/[id]/admin.
 *
 * Composition (port of the Synex spec, adapted for FormAdmin):
 *   - warm paper background (#F2F2F0)
 *   - soft radial halo gradient at top center
 *   - eyebrow label "Form admin · <tier>"
 *   - two-line H1: ghost line ("Decrypt, triage,") + solid line
 *     ("steward your responses.") in display type
 *   - subhead description (form's own description)
 *   - photoreal stones (left + right) with mossy hover reveal
 *   - dashboard preview rising centered between stones (here: a small
 *     "view live form" card peeking up from the bottom edge)
 *   - bottom dark fade for contrast under the scroll indicator
 *   - scroll-to-explore label
 *
 * Sits ABOVE the existing FormAdmin body inside /forms/[id]/admin/page.tsx.
 * The dark fade at the bottom transitions visually into the BentoAdmin
 * tiles below.
 */
export function SynexHero({
  title,
  description,
  privacyTier,
  formId,
  submissionCount,
  status,
}: {
  title: string;
  description?: string;
  privacyTier: number;
  formId: string;
  submissionCount: number;
  status: string;
}) {
  const tierMeta = TIER_META[privacyTier] ?? TIER_META[0];

  return (
    <section
      className="relative -mx-4 overflow-hidden sm:-mx-8 lg:-mx-12"
      style={{
        backgroundColor: "#F2F2F0",
        color: "#05050C",
        fontFamily: "var(--font-display)",
        minHeight: "min(100vh, 720px)",
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
        {/* Eyebrow */}
        <motion.span
          initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
          className="mb-3 text-xs font-medium sm:text-[13px] md:text-sm"
          style={{ color: "rgba(0,0,0,0.50)" }}
        >
          Form admin · {tierMeta.label} · {status}
        </motion.span>

        {/* Headline — two lines, ghost + solid */}
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
            Decrypt, triage,
          </motion.span>
          <motion.span
            initial={{ opacity: 0, y: 24, filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.7, delay: 0.32, ease: "easeOut" }}
            className="block text-[34px] sm:text-[44px] md:text-[56px] lg:text-[68px]"
            style={{ color: "#05050C" }}
          >
            steward your responses.
          </motion.span>
        </h1>

        {/* Form title pill (since the user landed on this admin for a
            specific form, surface its title editorially below the H1) */}
        <motion.div
          initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.7, delay: 0.45, ease: "easeOut" }}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-black/5 px-4 py-1.5 text-sm font-medium"
          style={{ color: "rgba(0,0,0,0.65)" }}
        >
          <span>{title}</span>
          <span style={{ color: "rgba(0,0,0,0.30)" }}>·</span>
          <span style={{ color: "rgba(0,0,0,0.40)" }}>
            {submissionCount} submission{submissionCount === 1 ? "" : "s"}
          </span>
        </motion.div>

        {/* Subhead */}
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

      {/* Stones — anchored bottom-corners with mossy hover reveal */}
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

      {/* "View live form" card — sits between the stones (analogue of
          Synex's product Dashboard.png screenshot rising centrally). */}
      <motion.div
        initial={{ opacity: 0, y: 80, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 1, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="absolute bottom-0 left-0 right-0 z-[3] flex justify-center px-6"
        style={{ pointerEvents: "none" }}
      >
        <Link
          href={`/forms/${formId}`}
          className="pointer-events-auto mb-12 inline-flex items-center gap-3 rounded-2xl bg-white px-5 py-3 text-sm font-medium shadow-xl"
          style={{
            color: "#05050C",
            boxShadow:
              "0 -8px 80px rgba(0,0,0,0.12), 0 40px 120px rgba(0,0,0,0.10)",
          }}
        >
          <span
            className="inline-flex h-2 w-2 rounded-full"
            style={{ backgroundColor: "#16a34a" }}
            aria-hidden="true"
          />
          View live respondent form
          <span aria-hidden="true">→</span>
        </Link>
      </motion.div>

      {/* Bottom dark fade — contrast for the scroll indicator */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 right-0 z-[6]"
        style={{
          height: 220,
          background:
            "linear-gradient(to top, rgba(5,5,12,0.85) 0%, rgba(5,5,12,0.5) 40%, transparent 100%)",
        }}
      />

      {/* Scroll indicator — bottom center */}
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
            Scroll for admin tools
          </span>
        </div>
      </motion.div>
    </section>
  );
}
