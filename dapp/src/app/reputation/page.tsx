import type { Metadata } from "next";
import { EchoReputationRedesign } from "./EchoReputationRedesign";

export const metadata: Metadata = {
  title: "Reputation · Echo",
  description:
    "Echo's tx-backed soulbound reputation surface: FormOwnerCap-gated credit tickets, claim events, and portable proof on Sui.",
};

export default function ReputationPage() {
  return <EchoReputationRedesign />;
}
