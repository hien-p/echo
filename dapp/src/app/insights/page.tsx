import type { Metadata } from "next";
import { AppShell } from "@/components/shell";
import { InsightsConsole } from "./InsightsClient";

export const metadata: Metadata = {
  title: "Insights · Echo",
  description: "Conversational analytics over Echo submissions via Memwal.",
};

export default function InsightsPage() {
  // No kicker/title/subtitle — InsightsConsole ships its own hero
  // chat-prompt panel (Kraft-style), so the AppShell header would
  // be redundant chrome. Width=wide lets the console hero breathe.
  return (
    <AppShell width="wide">
      <InsightsConsole />
    </AppShell>
  );
}
