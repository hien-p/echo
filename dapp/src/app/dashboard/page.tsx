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
 * The hero stays warm-paper editorial (brand chrome on entry). Below
 * the hero, the interior is force-dark "operator console" surface —
 * one cohesive palette for KPI strip + bento + triage queue. The
 * `dark` class wrapper applies the dark CSS-variable set to every
 * descendant; the hero is unaffected because its background is set
 * via inline style, not a Tailwind class.
 *
 * See plans/reports/deep-260512-dashboard-uiux-audit.md for the audit
 * that motivated the route-scoped dark mode.
 */
export default function DashboardPage() {
  return (
    <>
      <DashboardHero />
      <div className="dark bg-background text-foreground">
        <AppShell width="wide" className="-mt-12 sm:-mt-16">
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
      </div>
    </>
  );
}
