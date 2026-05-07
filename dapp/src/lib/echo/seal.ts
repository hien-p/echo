"use client";

/**
 * Seal IBE/threshold encryption helpers per Echo privacy tier.
 *
 * The chain stores plaintext blob IDs only for `Public` forms. For all other
 * tiers we encrypt the JSON payload here, hand the ciphertext to Walrus, and
 * record the ciphertext blob ID on chain. Decryption requires:
 *   - a `SessionKey` signed by the wallet
 *   - tx bytes that call `seal_approve*` Move functions matching the tier
 *
 * Both are constructed at decrypt-time by the admin or holder; we expose
 * just the encrypt path here. Decrypt helpers live in `seal-decrypt.ts`
 * once we wire admin dashboards.
 */

import {
  SealClient,
  SessionKey,
  type SealClientOptions,
  type KeyServerConfig,
} from "@mysten/seal";
import { Transaction } from "@mysten/sui/transactions";
import type { ClientWithExtensions, CoreClient } from "@mysten/sui/client";
import { PrivacyTier } from "./types";

type SealCompatibleSuiClient = ClientWithExtensions<{ core: CoreClient }>;

export interface BuildSealClientArgs {
  suiClient: SealCompatibleSuiClient;
  /** Public Seal key servers — testnet/mainnet IDs are environment-specific. */
  serverConfigs: KeyServerConfig[];
  verifyKeyServers?: boolean;
}

export function getSealClient(args: BuildSealClientArgs): SealClient {
  const opts: SealClientOptions = {
    suiClient: args.suiClient,
    serverConfigs: args.serverConfigs,
    verifyKeyServers: args.verifyKeyServers ?? true,
  };
  return new SealClient(opts);
}

export interface EncryptForTierArgs {
  client: SealClient;
  packageId: string;
  /** Tier-specific identity bytes. See `tierIdentity()` for the canonical form. */
  identity: Uint8Array;
  /** TSS threshold. For `AdminOnly` use 1; otherwise pass the form's `n`. */
  threshold: number;
  data: Uint8Array;
}

export async function encryptForTier(
  args: EncryptForTierArgs,
): Promise<{ ciphertext: Uint8Array; backupKey: Uint8Array }> {
  const result = await args.client.encrypt({
    threshold: args.threshold,
    packageId: args.packageId,
    id: bytesToHex(args.identity),
    data: args.data,
  });
  return {
    ciphertext: result.encryptedObject,
    backupKey: result.key,
  };
}

/**
 * Build the canonical Seal `id` for a given form + tier.
 *
 * The identity is opaque bytes the key servers and Move `seal_approve*`
 * functions agree on. We use `formId || tierByte || extra` so a single
 * key server release approves exactly one form/tier combination.
 */
export function tierIdentity(args: {
  formId: string;
  tier: PrivacyTier;
  /** For Conditional tier: the policy id used in the form. */
  conditionalPolicyId?: string;
  /** For TimeLocked tier: the unlock ms (big-endian u64). */
  unlockMs?: bigint;
}): Uint8Array {
  const formIdBytes = hexToBytes(args.formId.replace(/^0x/, ""));
  const tierByte = new Uint8Array([args.tier]);
  const extra = encodeTierExtra(args);
  return concat(formIdBytes, tierByte, extra);
}

function encodeTierExtra(args: {
  tier: PrivacyTier;
  conditionalPolicyId?: string;
  unlockMs?: bigint;
}): Uint8Array {
  if (args.tier === PrivacyTier.TimeLocked) {
    return u64ToBytes(args.unlockMs ?? BigInt(0));
  }
  if (args.tier === PrivacyTier.Conditional) {
    return new TextEncoder().encode(args.conditionalPolicyId ?? "");
  }
  return new Uint8Array(0);
}

/**
 * Build the seal_approve_* PTB body matching a form's privacy tier. Returns
 * the kind-only tx bytes that get passed to fetchKeys + decrypt.
 *
 * `senderAddress` is required for AdminOnly/Threshold/Conditional tiers
 * because the underlying `seal_approve_*` calls reference the FormOwnerCap
 * (an owned object) and the SDK pre-flights ownership against the sender
 * even when `onlyTransactionKind: true`. TimeLocked references no owned
 * objects, so sender is harmless either way.
 */
export async function buildSealApproveTxBytes(args: {
  packageId: string;
  formId: string;
  formOwnerCapId?: string;
  privacyTier: PrivacyTier;
  identity: Uint8Array;
  suiClient: SealCompatibleSuiClient;
  /** Wallet address that owns the FormOwnerCap. Required for non-TimeLocked tiers. */
  senderAddress?: string;
}): Promise<Uint8Array> {
  const tx = new Transaction();
  const idArg = tx.pure.vector("u8", Array.from(args.identity));
  switch (args.privacyTier) {
    case PrivacyTier.AdminOnly:
      if (!args.formOwnerCapId)
        throw new Error("AdminOnly decrypt requires the FormOwnerCap id.");
      tx.moveCall({
        target: `${args.packageId}::form::seal_approve_admin_only`,
        arguments: [
          idArg,
          tx.object(args.formId),
          tx.object(args.formOwnerCapId),
        ],
      });
      break;
    case PrivacyTier.Threshold:
      if (!args.formOwnerCapId)
        throw new Error("Threshold decrypt requires the FormOwnerCap id.");
      tx.moveCall({
        target: `${args.packageId}::form::seal_approve_threshold`,
        arguments: [
          idArg,
          tx.object(args.formId),
          tx.object(args.formOwnerCapId),
        ],
      });
      break;
    case PrivacyTier.TimeLocked:
      tx.moveCall({
        target: `${args.packageId}::form::seal_approve_time_locked`,
        arguments: [idArg, tx.object(args.formId), tx.object("0x6")],
      });
      break;
    case PrivacyTier.Conditional:
      if (!args.formOwnerCapId)
        throw new Error("Conditional decrypt requires the FormOwnerCap id.");
      tx.moveCall({
        target: `${args.packageId}::form::seal_approve_conditional`,
        arguments: [
          idArg,
          tx.object(args.formId),
          tx.object(args.formOwnerCapId),
        ],
      });
      break;
    default:
      throw new Error("Public tier needs no Seal decrypt.");
  }
  if (args.senderAddress) tx.setSender(args.senderAddress);
  return tx.build({ client: args.suiClient, onlyTransactionKind: true });
}

export { SessionKey };

// ---- byte helpers ----

function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2) throw new Error("invalid hex length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function u64ToBytes(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  const mask = BigInt(0xff);
  let v = value;
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(v & mask);
    v = v >> BigInt(8);
  }
  return out;
}
