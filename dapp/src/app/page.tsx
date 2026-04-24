"use client";

import { formatAddress } from "@mysten/sui/utils";
import { useCurrentAccount } from "@mysten/dapp-kit-react";

export default function Home() {
  const currentAccount = useCurrentAccount();
  return (
    <div className="text-xl">
      Hello,{" "}
      {currentAccount ? formatAddress(currentAccount.address) : "Sui Friend"}!
    </div>
  );
}
