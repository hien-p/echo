/**
 * Anonymous-submission nullifier derivation.
 *
 * Each (wallet, form) pair maps to a deterministic 32-byte commitment. The
 * wallet signs a canonical message; SHA-256 over the signature gives the
 * nullifier. Properties:
 *
 *   - Deterministic: the same wallet asked to sign the same message always
 *     produces the same signature (Ed25519 signatures are deterministic
 *     under RFC 8032), so the chain catches double-submits.
 *   - Per-form scoped: the message includes the form id, so a wallet's
 *     commitment for form A is unrelated to its commitment for form B.
 *   - Untraceable from chain: the on-chain SubmissionRef stores only the
 *     hash. Linking it back to the wallet requires the wallet to sign the
 *     same message again — chain observers can't.
 *
 * Trust caveat: This relies on Ed25519's deterministic signature scheme.
 * Wallets that sign with randomized k-values would produce different
 * signatures each call and break determinism — current Sui wallet stacks
 * use deterministic Ed25519 (RFC 8032), so this is safe in practice.
 */

const PERSONAL_PREFIX = "\x19Sui Echo Nullifier\n";

interface PersonalMessageSigner {
  signPersonalMessage(input: {
    message: Uint8Array;
  }): Promise<{ signature: string }>;
}

export interface DeriveCommitmentArgs {
  formId: string;
  walletAddress: string;
  signer: PersonalMessageSigner;
}

export async function deriveCommitment(
  args: DeriveCommitmentArgs,
): Promise<Uint8Array> {
  const message = canonicalMessage(args.formId, args.walletAddress);
  const messageBytes = new TextEncoder().encode(message);
  const sig = await args.signer.signPersonalMessage({ message: messageBytes });
  // dApp Kit returns base64; we hash the raw bytes for the nullifier.
  const sigBytes = base64ToBytes(sig.signature);
  return sha256(sigBytes);
}

/**
 * Build the canonical message that the wallet signs. The form id and
 * wallet address are both included so the nullifier is unique per (form,
 * wallet) pair. The prefix mirrors Ethereum's personal_sign convention so
 * the bytes never accidentally collide with a real Sui transaction.
 */
export function canonicalMessage(
  formId: string,
  walletAddress: string,
): string {
  const norm = (s: string) => s.toLowerCase().replace(/^0x/, "");
  return (
    `${PERSONAL_PREFIX}` +
    `form=0x${norm(formId)}\n` +
    `address=0x${norm(walletAddress)}`
  );
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const hash = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes as unknown as ArrayBuffer,
  );
  return new Uint8Array(hash);
}

function base64ToBytes(s: string): Uint8Array {
  const bin =
    typeof atob !== "undefined"
      ? atob(s)
      : Buffer.from(s, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
