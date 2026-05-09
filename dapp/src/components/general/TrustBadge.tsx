"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Always-visible chip in the header that names the trust model. Borrowed
 * from sui-stack-crm's pattern of putting "E2E · Seal · Walrus · Sui" in
 * the title bar so the differentiation vs centralized form tools is legible
 * at first glance, not buried in the README.
 *
 * Click toggles a small popover that explains each layer in two sentences.
 */
export const TrustBadge = () => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="What this means"
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase",
          "border-emerald-300 bg-emerald-50 text-emerald-900",
          "hover:bg-emerald-100 cursor-pointer",
          "dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-900/40",
        )}
      >
        <ShieldCheck size={10} />
        <span className="hidden sm:inline">Sui · Walrus · Seal</span>
        <span className="sm:hidden">trust</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute right-0 mt-1 w-[320px] z-50 rounded-md border bg-popover text-popover-foreground shadow-lg p-3 text-xs leading-relaxed flex flex-col gap-2">
            <p className="font-medium text-sm">No-vendor-trust forms</p>
            <ul className="flex flex-col gap-1.5 text-muted-foreground">
              <li>
                <strong className="text-foreground">Sui</strong> — Form schema,
                submission events, and access caps live on chain. No
                Echo-controlled database.
              </li>
              <li>
                <strong className="text-foreground">Walrus</strong> — Form
                schemas, submission payloads, and uploaded files are stored as
                content-addressed blobs. Anyone with the blob ID can fetch the
                bytes.
              </li>
              <li>
                <strong className="text-foreground">Seal</strong> — For
                non-Public tiers, payloads are encrypted in your browser before
                upload. Only wallets matching the form&apos;s privacy rule can
                fetch decryption shares from the key server committee. Echo
                can&apos;t decrypt your data; neither can the Walrus operator.
              </li>
            </ul>
            <p className="text-muted-foreground">
              Even if Echo disappears tomorrow, your form data stays readable to
              the same wallets via the SDKs.
            </p>
          </div>
        </>
      )}
    </div>
  );
};
