import type { Metadata } from "next";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import {
  FeaturedForms,
  StackStory,
  Faq,
  FlowingServices,
  SocialProofBento,
  MarketingFooter,
} from "@/components/marketing/MarketingSections";
import { StackMarquee } from "@/components/marketing/StackMarquee";
import { PrivacyTiersShowcase } from "@/components/marketing/PrivacyTiersShowcase";
import { FormsInTheWild } from "@/components/marketing/FormsInTheWild";
import { FinalCTA } from "@/components/marketing/FinalCTA";

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
        <StackMarquee />
        <FeaturedForms />
        <FlowingServices />
        <PrivacyTiersShowcase />
        <FormsInTheWild />
        <SocialProofBento />
        <StackStory />
        <Faq />
        <FinalCTA />
        <MarketingFooter />
      </main>
    </>
  );
}
