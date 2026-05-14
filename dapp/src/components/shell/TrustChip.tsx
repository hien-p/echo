"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Trust badge that lives in the right cluster of the NavPill.
 *
 * Shows the four-layer privacy guarantee at a glance — E2E · Seal ·
 * Walrus · Sui — and on hover/focus, a popover explains what each
 * layer guarantees and what it does NOT promise. This is the
 * sui-stack-crm trust-badge idiom adapted for Echo: every page
 * makes the trust model visible instead of burying it in marketing.
 */

const LAYERS = [
  {
    label: "E2E",
    short: "Encrypted in your browser",
    detail:
      "Submission payloads are encrypted client-side before they leave your machine. Echo's API never sees plaintext for non-Public tiers.",
    color: "bg-emerald-500",
  },
  {
    label: "Seal",
    short: "MPC-gated decryption",
    detail:
      "Decryption keys are split across an MPC committee on Sui testnet. Only wallets explicitly listed on the form's Move ACL can recompose a key — not the operator, not the publisher.",
    color: "bg-violet-500",
  },
  {
    label: "Walrus",
    short: "Content-addressed storage",
    detail:
      "Encrypted blobs live on Walrus testnet. They're immutable, content-addressed, and readable from any aggregator — Echo's API is only one of many ways to fetch them.",
    color: "bg-amber-500",
  },
  {
    label: "Sui",
    short: "Onchain ACL + ownership",
    detail:
      "Each form is a Sui Move object. Membership and bounty pools are on-chain shared objects. If Echo disappears tomorrow, the data + access policy still exists, still readable through the SDKs.",
    color: "bg-blue-500",
  },
];

export function TrustChip() {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-background/80 transition hover:bg-background/10 hover:text-background"
        aria-label="Trust model: E2E · Seal · Walrus · Sui"
        aria-expanded={open}
      >
        <ShieldCheck size={14} strokeWidth={2} />
        <span className="hidden sm:inline">E2E</span>
        <span className="hidden text-background/40 sm:inline">·</span>
        <span className="hidden sm:inline">Seal</span>
        <span className="hidden text-background/40 sm:inline">·</span>
        <span className="hidden sm:inline">Walrus</span>
        <span className="hidden text-background/40 sm:inline">·</span>
        <span className="hidden sm:inline">Sui</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full z-50 mt-2 w-[340px] rounded-2xl border border-border bg-background p-4 text-foreground shadow-2xl shadow-foreground/10"
            role="dialog"
          >
            <div className="mb-3 flex items-start gap-2">
              <ShieldCheck
                size={16}
                strokeWidth={2}
                className="mt-0.5 shrink-0 text-emerald-500"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Echo&rsquo;s trust model
                </p>
                <p className="text-xs text-muted-foreground">
                  Four layers, each independently verifiable. None can read your
                  encrypted data on its own.
                </p>
              </div>
            </div>
            <ul className="flex flex-col gap-2.5">
              {LAYERS.map((l) => (
                <li key={l.label} className="flex gap-2.5">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1 inline-block h-2 w-2 shrink-0 rounded-full",
                      l.color,
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground">
                      {l.label}{" "}
                      <span className="font-normal text-muted-foreground">
                        — {l.short}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {l.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-border pt-2.5 text-[10px] uppercase tracking-widest text-muted-foreground">
              Adapted from the sui-stack-crm trust-badge pattern
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
