"use client";

import Link from "next/link";
import { formatAddress } from "@mysten/sui/utils";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { ArrowRight, FileEdit, Inbox, Sparkles } from "lucide-react";

export default function Home() {
  const currentAccount = useCurrentAccount();
  const greeting = currentAccount
    ? formatAddress(currentAccount.address)
    : "guest";

  return (
    <section className="flex flex-col gap-md max-w-[1024px] mx-auto p-md w-full">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Welcome, {greeting}
        </p>
        <h1 className="text-3xl font-semibold">Echo</h1>
        <p className="text-sm text-muted-foreground max-w-[640px]">
          Decentralized feedback & form platform. Schemas + submissions stored
          on Walrus, encryption tiers via Seal, on-chain composability via Sui.
          Nobody builds this on Google Forms.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <LandingCard
          href="/forms/new"
          icon={<FileEdit size={18} />}
          title="Create a form"
          body="Drag-drop builder · 5 templates · 5 privacy tiers."
        />
        <LandingCard
          href="/forms"
          icon={<Inbox size={18} />}
          title="My forms"
          body="See submissions, run payouts, decrypt encrypted tiers."
        />
        <LandingCard
          href="/insights"
          icon={<Sparkles size={18} />}
          title="Insights"
          body="Ask natural-language questions across your responses."
        />
      </div>

      <div className="text-xs text-muted-foreground flex flex-wrap gap-3 pt-2">
        <Link href="/reputation" className="underline hover:text-foreground">
          /reputation
        </Link>
        <Link href="/logs" className="underline hover:text-foreground">
          /logs
        </Link>
        <a
          href="https://github.com/hien-p/echo"
          className="underline hover:text-foreground"
          target="_blank"
          rel="noreferrer"
        >
          source
        </a>
      </div>
    </section>
  );
}

function LandingCard({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="border rounded p-4 bg-card hover:bg-accent transition-colors flex flex-col gap-2 group"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 font-medium">
          {icon} {title}
        </span>
        <ArrowRight
          size={14}
          className="text-muted-foreground group-hover:translate-x-0.5 transition-transform"
        />
      </div>
      <p className="text-sm text-muted-foreground">{body}</p>
    </Link>
  );
}
