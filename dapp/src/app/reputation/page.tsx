import type { Metadata } from "next";
import { EchoReputationRedesign } from "./EchoReputationRedesign";

export const metadata: Metadata = {
  title: "Reputation · Echo",
  description:
    "Preview Echo's soulbound reputation badges: portable proof earned from FormOwnerCap-backed activity, non-transferable on Sui, and queryable by other dapps.",
};

export default function ReputationPage() {
  return <EchoReputationRedesign />;
}
