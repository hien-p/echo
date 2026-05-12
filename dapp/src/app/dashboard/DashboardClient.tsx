"use client";

import dynamic from "next/dynamic";

export const CrossFormDashboardClient = dynamic(
  () =>
    import("@/components/general/CrossFormDashboard").then((mod) => ({
      default: mod.CrossFormDashboard,
    })),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-muted-foreground">Loading dashboard…</p>
    ),
  },
);

export const BentoDashboardClient = dynamic(
  () =>
    import("@/components/general/BentoDashboard").then((mod) => ({
      default: mod.BentoDashboard,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] animate-pulse rounded-2xl bg-muted/40" />
    ),
  },
);

/**
 * SwissBentoOverview was removed from /dashboard per the deep-audit
 * recommendation (three competing overviews → one KPI strip). The
 * dynamic export stays here so a future home (e.g. `/`) can mount it
 * without re-creating the dynamic boundary.
 */
export const SwissBentoOverviewClient = dynamic(
  () =>
    import("@/components/general/swiss-bento/SwissBentoOverview").then(
      (mod) => ({ default: mod.SwissBentoOverview }),
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-[560px] animate-pulse rounded-2xl bg-[#0A0A0A]" />
    ),
  },
);

export const DashboardKpiStripClient = dynamic(
  () =>
    import("@/components/general/DashboardKpiStrip").then((mod) => ({
      default: mod.DashboardKpiStrip,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[124px] animate-pulse rounded-2xl bg-muted/40"
            />
          ))}
        </div>
        <div className="h-[192px] animate-pulse rounded-2xl bg-muted/40" />
      </div>
    ),
  },
);
