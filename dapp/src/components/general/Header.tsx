import Link from "next/link";
import { ConnectWalletMenu } from "./ConnectWalletMenu";

export const Header = () => {
  return (
    <header className="p-2xs bg-background border-b text-foreground sticky top-0 flex items-center justify-between">
      <Link href="/" className="text-xl font-semibold">
        dApp Template
      </Link>
      <ConnectWalletMenu />
    </header>
  );
};
