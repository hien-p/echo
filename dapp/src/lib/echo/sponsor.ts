"use client";

/**
 * Client-side helper to run an Echo transaction through the Enoki gas-sponsorship
 * route. The user signs only — they never need SUI in their wallet.
 *
 * Flow:
 *   1. Build transactionKind bytes (no gas, no sender) and POST to /api/sponsor
 *   2. Server uses ENOKI_PRIVATE_KEY to create a sponsored transaction with
 *      allowed move call targets restricted to Echo submission/reputation
 *   3. Client signs the returned tx bytes via dApp Kit
 *   4. POST {digest, signature} to /api/sponsor/execute
 *   5. Server submits via Enoki, returns the final digest
 */

import { Transaction } from "@mysten/sui/transactions";
import type { ClientWithCoreApi } from "@mysten/sui/client";

interface DAppKitLike {
  signTransaction(args: { transaction: Transaction | string }): Promise<{
    bytes: string;
    signature: string;
  }>;
}

export async function executeSponsored(args: {
  tx: Transaction;
  sender: string;
  suiClient: ClientWithCoreApi;
  dAppKit: DAppKitLike;
}): Promise<{ digest: string }> {
  const txKindBytes = await args.tx.build({
    client: args.suiClient,
    onlyTransactionKind: true,
  });
  const transactionKindBytes = uint8ArrayToBase64(txKindBytes);

  const createResp = await fetch("/api/sponsor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transactionKindBytes,
      sender: args.sender,
    }),
  });
  if (!createResp.ok) {
    const err = await createResp.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ??
        `Sponsor create HTTP ${createResp.status}`,
    );
  }
  const { bytes, digest } = (await createResp.json()) as {
    bytes: string;
    digest: string;
  };

  const signed = await args.dAppKit.signTransaction({
    transaction: Transaction.from(bytes),
  });

  const execResp = await fetch("/api/sponsor/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ digest, signature: signed.signature }),
  });
  if (!execResp.ok) {
    const err = await execResp.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ??
        `Sponsor execute HTTP ${execResp.status}`,
    );
  }
  const { digest: finalDigest } = (await execResp.json()) as { digest: string };
  return { digest: finalDigest };
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  if (typeof btoa !== "undefined") return btoa(binary);
  return Buffer.from(bytes).toString("base64");
}
