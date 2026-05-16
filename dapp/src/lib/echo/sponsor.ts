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
import type { ClientWithCoreApi, SuiClientTypes } from "@mysten/sui/client";
import { apiUrl } from "@/config/clientConfig";

interface DAppKitLike {
  signTransaction(args: { transaction: Transaction | string }): Promise<{
    bytes: string;
    signature: string;
  }>;
}

interface SponsoredResult {
  digest: string;
  /** Populated when waitForEffects=true. Contains the executed tx's effects. */
  effects?: SuiClientTypes.TransactionEffects;
}

export async function executeSponsored(args: {
  tx: Transaction;
  sender: string;
  suiClient: ClientWithCoreApi;
  dAppKit: DAppKitLike;
  /** The form's own Echo package id (derived from its on-chain type) so
   *  the sponsor allowlist matches forms from any package version. */
  packageId?: string;
  /** Polls getTransaction after execute to surface effects. Default false. */
  waitForEffects?: boolean;
}): Promise<SponsoredResult> {
  const txKindBytes = await args.tx.build({
    client: args.suiClient,
    onlyTransactionKind: true,
  });
  const transactionKindBytes = uint8ArrayToBase64(txKindBytes);

  const createResp = await fetch(apiUrl("/api/sponsor"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transactionKindBytes,
      sender: args.sender,
      packageId: args.packageId,
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

  const execResp = await fetch(apiUrl("/api/sponsor/execute"), {
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

  if (!args.waitForEffects) return { digest: finalDigest };

  // Poll getTransaction until effects show up (Enoki's executeSponsored
  // returns immediately after submission; the chain may take 1-2s).
  const client = args.suiClient as unknown as {
    getTransaction(input: {
      digest: string;
      include: { effects: true };
    }): Promise<{
      $kind: "Transaction" | "FailedTransaction";
      Transaction?: { effects?: SuiClientTypes.TransactionEffects };
      FailedTransaction?: { effects?: SuiClientTypes.TransactionEffects };
    }>;
  };
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const r = await client.getTransaction({
        digest: finalDigest,
        include: { effects: true },
      });
      const effects = r.Transaction?.effects ?? r.FailedTransaction?.effects;
      if (effects) return { digest: finalDigest, effects };
    } catch {
      /* not yet visible */
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  return { digest: finalDigest };
}

/**
 * Walletless sibling of `executeSponsored` — signs the sponsored tx with
 * a fresh client-side Ed25519 keypair instead of dApp Kit. Used when a
 * respondent submits a public form without connecting MetaMask/Slush:
 * the keypair is generated, used once, then thrown away. The Sui address
 * derived from it appears as the on-chain `submitter`; for anonymous
 * submissions it doesn't matter (the nullifier hash is what's recorded).
 *
 * Caller passes the keypair so anonymous-mode flows can also use it to
 * sign the deterministic nullifier message.
 */
export async function executeSponsoredWithKeypair(args: {
  tx: Transaction;
  keypair: import("@mysten/sui/keypairs/ed25519").Ed25519Keypair;
  suiClient: ClientWithCoreApi;
  /** The form's own Echo package id (see executeSponsored). */
  packageId?: string;
  waitForEffects?: boolean;
}): Promise<SponsoredResult> {
  const senderAddress = args.keypair.getPublicKey().toSuiAddress();
  const txKindBytes = await args.tx.build({
    client: args.suiClient,
    onlyTransactionKind: true,
  });
  const transactionKindBytes = uint8ArrayToBase64(txKindBytes);

  const createResp = await fetch(apiUrl("/api/sponsor"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transactionKindBytes,
      sender: senderAddress,
      packageId: args.packageId,
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

  // Decode base64 → Uint8Array → sign with the ephemeral keypair.
  const sponsoredBytes = base64ToUint8Array(bytes);
  const { signature } = await args.keypair.signTransaction(sponsoredBytes);

  const execResp = await fetch(apiUrl("/api/sponsor/execute"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ digest, signature }),
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

function base64ToUint8Array(b64: string): Uint8Array {
  const binary =
    typeof atob !== "undefined"
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  if (typeof btoa !== "undefined") return btoa(binary);
  return Buffer.from(bytes).toString("base64");
}
