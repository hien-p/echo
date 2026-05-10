import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

/**
 * Vitest's `project.provide()` serializes everything to JSON, which
 * strips class methods like `Ed25519Keypair.signTransaction`. Account
 * therefore carries the secret key as a bech32 string (the
 * `suiprivkey1…` format Sui CLI emits) and tests reconstruct the
 * keypair locally via `loadAccountKeypair()` on first use.
 */
export interface Account {
  secretKey: string;
  address: string;
}

export const getNewAccount = (): Account => {
  const keypair = new Ed25519Keypair();
  return {
    secretKey: keypair.getSecretKey(),
    address: keypair.getPublicKey().toSuiAddress(),
  };
};

/**
 * Recreate the Ed25519Keypair on the test side from the serialized
 * secret. Pass the `Account` object received via `inject(...)`.
 */
export const loadAccountKeypair = (account: Account): Ed25519Keypair => {
  const { secretKey } = decodeSuiPrivateKey(account.secretKey);
  return Ed25519Keypair.fromSecretKey(secretKey);
};
