/**
 * Submission gating — client-side enforcement of FormSchema.gating predicates.
 *
 * Trust caveat: this is purely a client check. A motivated submitter can
 * bypass it by calling `submission::submit` directly via PTB. To make it
 * ironclad, the Move module would need a corresponding gate that takes the
 * gating witness (coin, NFT, SuiNS NameRecord) as a tx input. Out of scope
 * for v0.2 — the dapp gate stops 99% of submissions and that's enough for
 * the demo's anti-sybil story.
 */
import type { FormSchema } from "./types";

const SUINS_API = "https://api-testnet.suins.io/api";

export interface GatingResult {
  ok: boolean;
  reason?: string;
  predicate?: string;
}

interface MinimalSuiClient {
  getBalance(input: {
    owner: string;
    coinType: string;
  }): Promise<{ totalBalance: string }>;
  listOwnedObjects(input: {
    owner: string;
    type: string;
    limit: number;
  }): Promise<{ objects: unknown[] }>;
}

/**
 * Check whether a wallet satisfies a form's gating predicate. Returns
 * { ok: true } when there's no gating, no wallet, or the predicate matches.
 * Otherwise returns { ok: false, reason } — surface this in the UI as a
 * banner, not a thrown error.
 */
export async function checkGating(
  schema: FormSchema | null | undefined,
  walletAddress: string | undefined,
  suiClient: MinimalSuiClient,
): Promise<GatingResult> {
  const gating = schema?.gating;
  if (!gating) return { ok: true };
  if (!walletAddress) return { ok: true };

  if (gating.type === "token" && gating.coinType) {
    const balance = await suiClient.getBalance({
      owner: walletAddress,
      coinType: gating.coinType,
    });
    const required = BigInt(gating.minAmount ?? "1");
    const have = BigInt(balance.totalBalance ?? "0");
    if (have < required) {
      return {
        ok: false,
        predicate: "token",
        reason: `Requires ≥ ${required} of ${shorten(gating.coinType)}. Wallet holds ${have}.`,
      };
    }
    return { ok: true, predicate: "token" };
  }

  if (gating.type === "nft" && gating.nftType) {
    const owned = await suiClient.listOwnedObjects({
      owner: walletAddress,
      type: gating.nftType,
      limit: 1,
    });
    if (owned.objects.length === 0) {
      return {
        ok: false,
        predicate: "nft",
        reason: `Requires owning a ${shorten(gating.nftType)} NFT.`,
      };
    }
    return { ok: true, predicate: "nft" };
  }

  if (gating.type === "suins" && gating.domain) {
    const target = await resolveSuiNSTarget(gating.domain);
    if (!target) {
      return {
        ok: false,
        predicate: "suins",
        reason: `Domain ${gating.domain} could not be resolved.`,
      };
    }
    if (target.toLowerCase() !== walletAddress.toLowerCase()) {
      return {
        ok: false,
        predicate: "suins",
        reason: `Requires controlling ${gating.domain}. Resolves to ${shorten(target)} not your wallet.`,
      };
    }
    return { ok: true, predicate: "suins" };
  }

  return { ok: true };
}

async function resolveSuiNSTarget(domain: string): Promise<string | null> {
  try {
    const resp = await fetch(`${SUINS_API}/${encodeURIComponent(domain)}`, {
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as {
      data?: { targetAddress?: string };
      targetAddress?: string;
    };
    return json.data?.targetAddress ?? json.targetAddress ?? null;
  } catch {
    return null;
  }
}

function shorten(s: string): string {
  if (s.length <= 32) return s;
  return `${s.slice(0, 16)}…${s.slice(-8)}`;
}

/**
 * Same shape as checkGating but pulls the predicate from
 * schema.decryptCondition (used by the Conditional privacy tier) instead
 * of schema.gating (used by submit-time gating). Caller decides what to
 * do on { ok: false } — typically: disable Decrypt button + show reason.
 */
export async function checkDecryptCondition(
  schema: FormSchema | null | undefined,
  walletAddress: string | undefined,
  suiClient: MinimalSuiClient,
): Promise<GatingResult> {
  const cond = schema?.decryptCondition;
  if (!cond) return { ok: true };
  // Run the same predicate logic as checkGating by temporarily wrapping.
  return checkGating(
    { version: 1, fields: [], gating: cond } as FormSchema,
    walletAddress,
    suiClient,
  );
}
