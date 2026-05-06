"use client";

import { formatAddress } from "@mysten/sui/utils";
import { useCurrentAccount } from "@mysten/dapp-kit-react";

export default function Home() {
  const currentAccount = useCurrentAccount();
  return (
    <div className="space-y-2">
      <h1 className="text-3xl font-semibold">Echo</h1>
      <p className="text-sm text-muted-foreground">
        Decentralized feedback & form platform — Walrus storage, Seal privacy
        tiers, on-chain composability.
      </p>
      <p className="text-base">
        Welcome,{" "}
        {currentAccount
          ? formatAddress(currentAccount.address)
          : "guest — sign in with zkLogin to start"}
        .
      </p>
    </div>
  );
}
