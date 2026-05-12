import { cn } from "@/lib/utils";

/**
 * Section eyebrow label — uppercase tracked, muted, single source of
 * truth so every section across the dapp reads with the same voice.
 */
export function Kicker({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-xs font-semibold uppercase tracking-widest text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
