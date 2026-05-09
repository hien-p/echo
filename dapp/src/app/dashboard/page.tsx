import type { Metadata } from "next";
import { CrossFormDashboardClient } from "./DashboardClient";

export const metadata: Metadata = {
  title: "Dashboard · Echo",
  description:
    "Cross-form triage queue. Filter, tag, and prioritize submissions across every form you own.",
};

export const runtime = "edge";

export default function DashboardPage() {
  return (
    <section className="flex flex-col gap-md max-w-[1100px] mx-auto p-md w-full">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Every submission across every form you own. Tag, prioritize, and jump
          into the per-form admin when you need to decrypt.
        </p>
      </header>
      <CrossFormDashboardClient />
    </section>
  );
}
