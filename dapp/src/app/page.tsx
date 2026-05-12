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
import { Features2 } from "@/components/blocks/features-2";
import Stats1 from "@/components/blocks/stats-1";
import { HowItWorks1 } from "@/components/blocks/how-it-works-1";
import Cta1 from "@/components/blocks/cta-1";

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
        {/* RB Pro auto-cycling carousel of Echo's three pillars */}
        <Features2 />
        <PrivacyTiers />
        {/* RB Pro stats — animated metrics counter */}
        <Stats1 />
        <StackStory />
        {/* RB Pro how-it-works — step-by-step flow visual */}
        <HowItWorks1 />
        <Faq />
        {/* RB Pro CTA with parallax / cursor effect */}
        <Cta1 />
        <MarketingFooter />
      </main>
    </>
  );
}
