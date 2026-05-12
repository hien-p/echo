"use client";

import { Kicker } from "./Kicker";
import { DisplayHeading } from "./DisplayHeading";

/**
 * Standard section opener: small Kicker label above an oversized
 * DisplayHeading with optional italic-serif accent. Use this at the
 * top of every marketing-side AND interior section so headings read
 * as the same product.
 */
export function SectionHeader({
  kicker,
  title,
  accent,
  size = "lg",
  className,
}: {
  kicker: string;
  title: React.ReactNode;
  accent?: React.ReactNode;
  size?: "lg" | "xl";
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-4 ${className ?? ""}`}>
      <Kicker>{kicker}</Kicker>
      <DisplayHeading size={size} accent={accent}>
        {title}
      </DisplayHeading>
    </div>
  );
}
