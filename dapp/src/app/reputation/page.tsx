import type { Metadata } from "next";
import { ReputationDashboard } from "./ReputationClient";

export const metadata: Metadata = {
  title: "Reputation · Echo",
  description: "Your soulbound reputation score and unclaimed credit tickets.",
};

export default function ReputationPage() {
  return (
    <section className="flex flex-col gap-md max-w-[768px] mx-auto p-md w-full">
      <header>
        <h1 className="text-2xl font-semibold">Reputation</h1>
        <p className="text-sm text-muted-foreground">
          Mint your soulbound badge once, then claim credit tickets that form
          owners issue you for quality submissions.
        </p>
      </header>
      <ReputationDashboard />
    </section>
  );
}
