import type { Metadata } from "next";
import { Suspense } from "react";
import { EchoInsightsRedesign } from "./EchoInsightsRedesign";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Insights · Echo",
  description: "Conversational analytics over Echo submissions via Memwal.",
};

/**
 * /insights — Echo redesign. The client component reads `?q=`
 * via useSearchParams(), so the page itself stays a thin server
 * shell with no `await searchParams` — that keeps it compatible
 * with the static export used by `pnpm build:walrus`.
 *
 * Suspense boundary is required by Next 15: any child that calls
 * `useSearchParams()` during the static prerender must sit under
 * one, otherwise the build bails out with a CSR fallback warning.
 */
export default function InsightsPage() {
  return (
    <Suspense fallback={null}>
      <EchoInsightsRedesign />
    </Suspense>
  );
}
