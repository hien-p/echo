import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { fromBase64 } from "@mysten/sui/utils";

/**
 * Returns an Ed25519Keypair signer derived from the provided secret key.
 * Accepts either:
 *   - bech32 `suiprivkey1…` (what `sui keytool export` emits)
 *   - base64 33-byte Sui keystore format (legacy, what `sui.keystore` stores)
 */
export const getSigner = (secretKey: string) => {
  if (secretKey.startsWith("suiprivkey")) {
    const { secretKey: raw } = decodeSuiPrivateKey(secretKey);
    return Ed25519Keypair.fromSecretKey(raw);
  }
  return Ed25519Keypair.fromSecretKey(fromBase64(secretKey).slice(1));
};
