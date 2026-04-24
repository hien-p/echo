import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

export interface Account {
  keypair: Ed25519Keypair;
  address: string;
}

export const getNewAccount = () => {
  const keypair = new Ed25519Keypair();
  const address = keypair.getPublicKey().toSuiAddress();
  return { keypair, address };
};
