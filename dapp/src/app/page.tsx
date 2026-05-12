import type { Metadata } from "next";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import {
  PrivacyTiers,
  FeaturedForms,
  StackStory,
  Faq,
  MarketingFooter,
} from "@/components/marketing/MarketingSections";
// RB Pro blocks unmounted from the marketing landing — they ship with
// SaaS/security/creator placeholder content that doesn't apply to Echo,
// and several of them use Tailwind 4 t-shirt max-w classes that this
// project's @theme shadows onto spacing tokens (word-per-line bug).
// Reinstate one block at a time only AFTER customizing its content +
// auditing every max-w-* usage.
//
// import { Features2 } from "@/components/blocks/features-2";
// import Stats1 from "@/components/blocks/stats-1";
// import { HowItWorks1 } from "@/components/blocks/how-it-works-1";
// import Cta1 from "@/components/blocks/cta-1";

export const metadata: Metadata = {
  title: "Echo · Decentralized Feedback & Forms on Walrus",
  description:
    "Walrus-native form platform — gas-sponsored answers, Seal-encrypted private tiers, on-chain composability via Sui. Built for the Walrus Sessions hackathon.",
};

export default function Home() {
  return (
    <>
      <MarketingHeader />
      <main className="-mx-2xs -my-2xs flex min-h-screen flex-col bg-background">
        <MarketingHero />
        <FeaturedForms />
        <PrivacyTiers />
        <StackStory />
        <Faq />
        <MarketingFooter />
      </main>
    </>
  );
}
