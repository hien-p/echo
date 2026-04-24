"use client";

import { Transaction } from "@mysten/sui/transactions";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { cn } from "@/lib/utils";

type FeatureNameProps = {
  packageId: string;
  className?: string;
};

export const FeatureName = ({ packageId, className }: FeatureNameProps) => {
  const currentAccount = useCurrentAccount();
  const dAppKit = useDAppKit();

  const handleAction = async () => {
    if (!currentAccount) return;

    // Read package IDs from validated env/config or server props, never from hardcoded literals.
    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::module::function`,
      arguments: [],
    });
    await dAppKit.signAndExecuteTransaction({
      transaction: tx,
      account: currentAccount,
    });
  };

  return (
    <section className={cn("flex flex-col gap-2xs", className)}>
      <button
        className="rounded-md border px-sm py-2xs"
        disabled={!currentAccount}
        onClick={() => void handleAction()}
        type="button"
      >
        {currentAccount ? "Run action" : "Connect wallet to continue"}
      </button>
    </section>
  );
};
