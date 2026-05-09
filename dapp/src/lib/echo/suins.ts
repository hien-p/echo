/**
 * SuiNS resolvers (testnet).
 *
 * Forward:  alice.sui                    → 0x…
 * Reverse:  0x…                          → alice (returns the leaf SLD)
 *
 * Both use the public SuiNS testnet API. Reverse lookup hits
 *   /api/address/<address>/default
 * which returns the address's "default" name record (set via
 * `SuinsRegistration::set_target_address` + reverse mapping). If no record
 * exists, returns null and callers fall back to a shortened hex display.
 *
 * Both endpoints return null on any HTTP/JSON error so callers never need
 * try/catch — UX should treat "not resolved" as the common case.
 */

const SUINS_API = "https://api-testnet.suins.io/api";

export async function resolveNameToAddress(
  name: string,
): Promise<string | null> {
  const slug = name.replace(/\.sui$/i, "").trim();
  if (!slug) return null;
  try {
    const resp = await fetch(`${SUINS_API}/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      data?: { targetAddress?: string };
      targetAddress?: string;
    };
    const t = json.data?.targetAddress ?? json.targetAddress ?? null;
    return t && t.startsWith("0x") ? t : null;
  } catch {
    return null;
  }
}

export async function resolveAddressToName(
  address: string,
): Promise<string | null> {
  if (!address?.startsWith("0x")) return null;
  try {
    const resp = await fetch(
      `${SUINS_API}/address/${encodeURIComponent(address)}/default`,
      { cache: "no-store" },
    );
    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      data?: { name?: string };
      name?: string;
    };
    const n = json.data?.name ?? json.name ?? null;
    return typeof n === "string" && n.length > 0 ? n : null;
  } catch {
    return null;
  }
}

export function shortAddress(address: string): string {
  if (!address?.startsWith("0x") || address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
