import type { Metadata } from "next";
import { EchoReputationRedesign } from "./EchoReputationRedesign";

export const metadata: Metadata = {
  title: "Reputation · Echo",
  description:
    "Preview of the Soulbound reputation badges respondents earn on Echo — non-transferable, on-chain, queryable by other dapps.",
};

export default function ReputationPage() {
  return <EchoReputationRedesign />;
}
