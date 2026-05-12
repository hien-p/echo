import type { Metadata } from "next";
import { AppShell } from "@/components/shell";
import { DashboardHero } from "./DashboardHero";
import {
  BentoDashboardClient,
  CrossFormDashboardClient,
  DashboardKpiStripClient,
} from "./DashboardClient";

export const metadata: Metadata = {
  title: "Dashboard · Echo",
  description:
    "Cross-form triage queue. Filter, tag, and prioritize submissions across every form you own.",
};

export const runtime = "edge";

/**
 * /dashboard now inherits the same dark palette as the homepage
 * (defaultTheme="dark" on SuiProvider). The editorial hero uses
 * `bg-background` + aurora shader, matching the MarketingHero's
 * dark-aurora idiom — no more warm-paper outlier.
 */
export default function DashboardPage() {
  return (
    <>
      <DashboardHero />
      <AppShell width="wide" className="-mt-8 sm:-mt-12">
        <div className="flex flex-col gap-10">
          <section id="kpis" className="scroll-mt-24">
            <DashboardKpiStripClient />
          </section>
          <div
            id="bento"
            className="flex flex-col gap-8 scroll-mt-24 border-t border-border pt-8"
          >
            <BentoDashboardClient />
            <section
              id="triage"
              className="flex flex-col gap-3 border-t border-border pt-8"
            >
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Triage queue
              </h2>
              <CrossFormDashboardClient />
            </section>
          </div>
        </div>
      </AppShell>
    </>
  );
}
