"use client";

import dynamic from "next/dynamic";
import {
  useCurrentAccount,
  useDAppKit,
  useWalletConnection,
} from "@mysten/dapp-kit-react";

const ConnectButton = dynamic(
  () => import("@mysten/dapp-kit-react/ui").then((mod) => mod.ConnectButton),
  { ssr: false },
);
import { formatAddress } from "@mysten/sui/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

export const ConnectWalletMenu = () => {
  const currentAccount = useCurrentAccount();
  const connection = useWalletConnection();
  const { switchAccount, disconnectWallet } = useDAppKit();

  if (currentAccount && connection.isConnected) {
    const accounts = connection.wallet.accounts;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="flex flex-row items-center gap-x-4xs">
          <span>{formatAddress(currentAccount.address)}</span>
          <ChevronDown size={16} />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {accounts
            .filter((account) => account.address !== currentAccount.address)
            .map((account) => (
              <DropdownMenuItem
                key={account.address}
                onSelect={() => switchAccount({ account })}
              >
                {formatAddress(account.address)}
              </DropdownMenuItem>
            ))}
          <DropdownMenuItem onSelect={() => disconnectWallet()}>
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return <ConnectButton />;
};
