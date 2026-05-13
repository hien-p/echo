import type { Metadata } from "next";
import { AppShell } from "@/components/shell";
import { InsightsConsole } from "./InsightsClient";

// next-on-pages requires every server-rendered route to opt into the
// edge runtime. build-walrus.sh strips this line for the static export.
export const runtime = "edge";

export const metadata: Metadata = {
  title: "Insights · Echo",
  description: "Conversational analytics over Echo submissions via Memwal.",
};

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const initialQuestion = Array.isArray(q) ? q[0] : q;

  // No kicker/title/subtitle — InsightsConsole ships its own hero
  // chat-prompt panel (Kraft-style), so the AppShell header would
  // be redundant chrome. Width=wide lets the console hero breathe.
  return (
    <AppShell width="wide">
      <InsightsConsole initialQuestion={initialQuestion} />
    </AppShell>
  );
}
