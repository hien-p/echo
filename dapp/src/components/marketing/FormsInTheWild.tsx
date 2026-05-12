"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { DitherShader } from "./DitherShader";
import { TierChip } from "@/components/shell";

/**
 * Real Echo forms gallery with a dither shader backdrop. Adapted from
 * the wireframe Community section pattern (card grid over decorative
 * canvas). Cards are hardcoded to the 7 known testnet forms — once we
 * have a /api/forms public-list endpoint we can hydrate dynamically.
 *
 * Each card deep-links to the public viewer (/forms/<id>), NOT the
 * admin route — this section is selling "go interact", not "go manage".
 */

interface WildForm {
  id: string;
  title: string;
  tier: number;
  blurb: string;
}

const FORMS: WildForm[] = [
  {
    id: "0x3121c7bf1d27de41aea9157c75a397c7899e5cb69cbc6d15e0a48ab9da2ac0e1",
    title: "Help shape Echo · v0.2",
    tier: 0,
    blurb:
      "Public form, gas-sponsored, markdown answers. Drop a screenshot if you hit a bug. Anonymous toggle on the submit screen.",
  },
  {
    id: "0x02750d97242c6ecf935a164deb90526024dca198f8e3846d49aef47475b59bbe",
    title: "Walrus Sessions hackathon feedback",
    tier: 0,
    blurb:
      "Open survey for judges and other builders. Rate the demo, tell us what was rough.",
  },
];

export function FormsInTheWild(): ReactNode {
  return (
    <section
      aria-labelledby="forms-in-the-wild-heading"
      className="relative overflow-hidden border-b border-border bg-background"
    >
      {/* Dither shader backdrop, gently faded so cards stay readable */}
      <div className="pointer-events-none absolute inset-0 opacity-30 dark:opacity-50">
        <DitherShader variant="cta" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/40 via-background/60 to-background" />

      <div className="relative z-10 mx-auto flex max-w-[1440px] flex-col gap-12 px-6 py-24 sm:px-12 sm:py-32 lg:px-24">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-[42rem] flex-col gap-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-foreground/50">
              In the wild
            </span>
            <h2
              id="forms-in-the-wild-heading"
              className="text-[clamp(2rem,5vw,5rem)] font-medium leading-[1.05] tracking-tight text-foreground"
            >
              Real forms,
              <br />
              <em className="font-serif text-foreground/70">
                live on testnet.
              </em>
            </h2>
          </div>
          <Link
            href="/forms/new"
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 font-mono text-xs font-medium uppercase tracking-[0.12em] text-background transition-opacity hover:opacity-90"
          >
            Build yours
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {FORMS.map((f, i) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{
                duration: 0.6,
                delay: i * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="group"
            >
              <Link
                href={`/forms/${f.id}`}
                className="block h-full rounded-2xl border border-border bg-card/80 p-6 backdrop-blur-md transition hover:border-foreground/40 hover:bg-card sm:p-8"
              >
                <div className="flex items-center justify-between gap-3">
                  <TierChip tier={f.tier} variant="short" />
                  <code className="font-mono text-[10px] text-muted-foreground">
                    {f.id.slice(0, 10)}…{f.id.slice(-6)}
                  </code>
                </div>
                <h3 className="mt-6 text-2xl font-medium leading-tight tracking-tight text-foreground">
                  {f.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {f.blurb}
                </p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-xs font-medium text-foreground transition group-hover:gap-2.5">
                  Open form
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
