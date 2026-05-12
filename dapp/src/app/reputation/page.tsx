import type { Metadata } from "next";
import { AppShell } from "@/components/shell";
import { ReputationDashboard } from "./ReputationClient";

export const metadata: Metadata = {
  title: "Reputation · Echo",
  description: "Your soulbound reputation score and unclaimed credit tickets.",
};

export default function ReputationPage() {
  return (
    <AppShell
      kicker="Reputation"
      title="Soulbound badges"
      subtitle="Mint your reputation badge once, then claim credit tickets that form owners issue you for quality submissions."
      width="narrow"
    >
      <ReputationDashboard />
    </AppShell>
  );
}
