/**
 * SuiNS resolvers (testnet).
 *
 * Forward:  alice.sui                    → 0x…
 * Reverse:  0x…                          → alice (returns the leaf SLD,
 *                                          .sui suffix stripped so callers
 *                                          can format consistently)
 *
 * Both go through the Sui fullnode RPC's built-in name service methods —
 * `suix_resolveNameServiceAddress` and `suix_resolveNameServiceNames`.
 * The HTTP shim at api-testnet.suins.io / api.suins.io has been flaky
 * (path structure changed mid-2026); RPC is the durable path.
 *
 * Both functions return null on any error so callers never need try/catch
 * — UX should treat "not resolved" as the common case.
 */

const SUI_FULLNODE =
  process.env.NEXT_PUBLIC_SUI_FULLNODE_URL ??
  "https://fullnode.testnet.sui.io:443";

async function jsonRpcCall<T>(
  method: string,
  params: unknown[],
): Promise<T | null> {
  try {
    const r = await fetch(SUI_FULLNODE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { result?: T; error?: unknown };
    if (j.error) return null;
    return j.result ?? null;
  } catch {
    return null;
  }
}

export async function resolveNameToAddress(
  name: string,
): Promise<string | null> {
  const slug = name.replace(/\.sui$/i, "").trim();
  if (!slug) return null;
  const result = await jsonRpcCall<string>("suix_resolveNameServiceAddress", [
    `${slug}.sui`,
  ]);
  return typeof result === "string" && result.startsWith("0x") ? result : null;
}

export async function resolveAddressToName(
  address: string,
): Promise<string | null> {
  if (!address?.startsWith("0x")) return null;
  const result = await jsonRpcCall<{ data?: string[] }>(
    "suix_resolveNameServiceNames",
    [address],
  );
  const first = result?.data?.[0];
  if (!first) return null;
  // Strip the .sui suffix so callers can format consistently
  // (component re-adds it for display).
  return first.replace(/\.sui$/i, "");
}

export function shortAddress(address: string): string {
  if (!address?.startsWith("0x") || address.length < 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
