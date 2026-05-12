import type { Metadata } from "next";
import { AppShell } from "@/components/shell";
import { DashboardHero } from "./DashboardHero";
import {
  BentoDashboardClient,
  CrossFormDashboardClient,
} from "./DashboardClient";

export const metadata: Metadata = {
  title: "Dashboard · Echo",
  description:
    "Cross-form triage queue. Filter, tag, and prioritize submissions across every form you own.",
};

export const runtime = "edge";

export default function DashboardPage() {
  return (
    <>
      <DashboardHero />
      <AppShell width="wide" className="-mt-12 sm:-mt-16">
        <div id="bento" className="flex flex-col gap-8 scroll-mt-24">
          <BentoDashboardClient />
          <section
            id="triage"
            className="flex flex-col gap-3 border-t border-border pt-8"
          >
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Triage queue
            </h2>
            <CrossFormDashboardClient />
          </section>
        </div>
      </AppShell>
    </>
  );
}
