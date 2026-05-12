import type { Metadata } from "next";
import { AppShell } from "@/components/shell";
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
    <AppShell
      kicker="Overview"
      title="Dashboard"
      subtitle="Bento overview · cross-form triage queue · jump into any form to decrypt or tag."
      width="wide"
    >
      <div className="flex flex-col gap-8">
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
  );
}
