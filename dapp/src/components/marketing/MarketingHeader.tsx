"use client";

import Link from "next/link";
import { motion } from "motion/react";

const links = [
  {
    label: "Try a form",
    href: "/forms/0x3121c7bf1d27de41aea9157c75a397c7899e5cb69cbc6d15e0a48ab9da2ac0e1",
  },
  { label: "Build", href: "/app/forms/new" },
  { label: "Dashboard", href: "/app/dashboard" },
  { label: "Devlog", href: "/logs/" },
];

export function MarketingHeader() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed left-0 right-0 top-0 z-50 px-4 py-6 sm:px-12 sm:py-8 lg:px-24"
    >
      <div className="mx-auto flex max-w-360 items-center justify-between gap-4">
        <Link
          href="/"
          className="flex h-12 shrink-0 items-center justify-center rounded-2xl bg-foreground/90 px-5 text-base font-semibold tracking-tight text-background shadow-lg backdrop-blur transition hover:opacity-90 sm:h-14 sm:text-lg"
        >
          Echo
        </Link>
        <nav className="hidden items-center gap-1 rounded-2xl bg-foreground/90 p-1.5 text-background shadow-lg backdrop-blur md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-xl px-4 py-2 text-sm font-medium text-background/80 transition hover:bg-background/15 hover:text-background"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/app"
          className="rounded-2xl bg-foreground/90 px-5 py-3 text-sm font-semibold text-background shadow-lg backdrop-blur transition hover:opacity-90 md:hidden"
        >
          Open app
        </Link>
      </div>
    </motion.header>
  );
}
