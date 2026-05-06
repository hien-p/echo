"use client";

/**
 * Browser-side adapter that exposes a dApp Kit wallet connection as a
 * `@mysten/sui` Signer. Walrus only calls `toSuiAddress()` and
 * `signAndExecuteTransaction()`, so we override those and stub the rest
 * of the abstract surface with defensive errors.
 */

import { Signer } from "@mysten/sui/cryptography";
import type { PublicKey, SignatureScheme } from "@mysten/sui/cryptography";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import type { Transaction } from "@mysten/sui/transactions";

interface DAppKitLike {
  signAndExecuteTransaction(args: {
    transaction: Transaction | string;
  }): Promise<unknown>;
}

interface AccountLike {
  address: string;
}

export class WalletBackedSigner extends Signer {
  constructor(
    private readonly dAppKit: DAppKitLike,
    private readonly account: AccountLike,
  ) {
    super();
  }

  toSuiAddress(): string {
    return this.account.address;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sign(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
    throw new Error(
      "WalletBackedSigner.sign is not supported; signing happens inside the connected wallet.",
    );
  }

  getKeyScheme(): SignatureScheme {
    return "ED25519";
  }

  getPublicKey(): PublicKey {
    throw new Error(
      "WalletBackedSigner does not expose the underlying wallet public key.",
    );
  }

  // The Signer abstract class declares this with a specific return type;
  // we cast our delegated result back to that shape since dApp Kit's
  // response is a structural superset of what Walrus consumes.
  async signAndExecuteTransaction({
    transaction,
  }: {
    transaction: Transaction;
    client: ClientWithCoreApi;
  }): ReturnType<Signer["signAndExecuteTransaction"]> {
    const result = await this.dAppKit.signAndExecuteTransaction({
      transaction,
    });
    return result as Awaited<ReturnType<Signer["signAndExecuteTransaction"]>>;
  }
}

export function makeWalletSigner(
  dAppKit: DAppKitLike,
  account: AccountLike,
): WalletBackedSigner {
  return new WalletBackedSigner(dAppKit, account);
}
