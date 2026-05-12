import Link from "next/link";
import type { ReactNode } from "react";
import { DitherShader } from "./DitherShader";

/**
 * Penultimate landing section — a card with Echo CTA on the left and
 * a dither shader on the right. Ported from wireframe FinalCTA but
 * with arbitrary widths (max-w-[28rem] not max-w-md — the project's
 * Tailwind 4 theme shadows t-shirt keys) and Echo copy.
 *
 * Sits between Faq and MarketingFooter on `/`.
 */
export function FinalCTA(): ReactNode {
  return (
    <section className="bg-background p-6 sm:p-10 lg:p-14">
      <div className="overflow-hidden rounded-3xl border border-border bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-50">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,420px)]">
          <div className="flex min-h-80 flex-col justify-center px-8 py-12 sm:px-12 sm:py-16 lg:border-r lg:border-neutral-200 lg:px-14 lg:py-20 dark:lg:border-neutral-800">
            <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
              Ship today
            </span>
            <h2 className="mt-4 max-w-[28rem] text-3xl font-medium leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.5rem]">
              Build a form. Share a link. Own the answers.
            </h2>
            <p className="mt-6 max-w-[34rem] text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
              Schemas + replies on Walrus. Optional Seal encryption. On-chain
              composability via Sui. Gas sponsored — your respondents need zero
              SUI.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/forms/new"
                className="inline-flex items-center gap-2 rounded-full bg-neutral-950 px-5 py-3.5 font-mono text-xs font-medium uppercase tracking-[0.12em] text-neutral-50 transition-opacity hover:opacity-90 dark:bg-neutral-50 dark:text-neutral-950"
              >
                Start building
                <span aria-hidden="true">→</span>
              </Link>
              <Link
                href="/forms/0x3121c7bf1d27de41aea9157c75a397c7899e5cb69cbc6d15e0a48ab9da2ac0e1"
                className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-5 py-3.5 font-mono text-xs font-medium uppercase tracking-[0.12em] text-neutral-700 transition hover:border-neutral-400 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-600"
              >
                Try a live form
              </Link>
            </div>
          </div>

          <div className="relative min-h-80 p-2 lg:min-h-[360px]">
            <div className="relative h-full w-full overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800">
              <DitherShader variant="cta" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
