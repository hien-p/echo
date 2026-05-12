import type { Metadata } from "next";
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
    <section className="flex flex-col gap-8 max-w-[1280px] mx-auto p-md w-full">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-medium tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Bento overview · cross-form triage queue · jump into any form to
          decrypt or tag.
        </p>
      </header>
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
    </section>
  );
}
