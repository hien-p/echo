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
