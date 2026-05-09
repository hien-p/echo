"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { resolveAddressToName, shortAddress } from "@/lib/echo/suins";

/**
 * Renders an address as its SuiNS default name (e.g., `alice.sui`) when one
 * is registered on testnet, otherwise falls back to a shortened hex.
 *
 * - 1-hour staleTime so the same address re-renders without re-querying.
 * - Returns the bare hex slice while loading so layout doesn't shift.
 * - Optional `linkTo` prop wraps the rendered name in a NextLink.
 * - Tooltip always shows the full address for verification.
 */
export function SuiNSName({
  address,
  linkTo,
  className,
  showAt = true,
}: {
  address: string;
  /** If set, wraps the name in a Link to this href. */
  linkTo?: string;
  className?: string;
  /** Render `@alice.sui` style with the leading "@" — turn off for code-style display. */
  showAt?: boolean;
}) {
  const q = useQuery({
    queryKey: ["suins", "reverse", address],
    queryFn: () => resolveAddressToName(address),
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    enabled: !!address?.startsWith("0x"),
    refetchOnWindowFocus: false,
  });

  const fallback = shortAddress(address);
  const name = q.data;
  const display = name ? `${showAt ? "@" : ""}${name}.sui` : fallback;

  const node = (
    <span title={address} className={className}>
      {display}
    </span>
  );
  if (linkTo) {
    return (
      <Link href={linkTo} className="hover:underline">
        {node}
      </Link>
    );
  }
  return node;
}
