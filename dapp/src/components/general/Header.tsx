import Link from "next/link";
import { ConnectWalletMenu } from "./ConnectWalletMenu";

export const Header = () => {
  return (
    <header className="p-2xs bg-background border-b text-foreground sticky top-0 flex items-center justify-between">
      <div className="flex items-center gap-md">
        <Link href="/" className="text-xl font-semibold">
          Echo
        </Link>
        <nav className="flex items-center gap-sm text-sm text-muted-foreground">
          <Link href="/forms/new" className="hover:text-foreground">
            New form
          </Link>
          <Link href="/logs/" className="hover:text-foreground">
            Devlog
          </Link>
        </nav>
      </div>
      <ConnectWalletMenu />
    </header>
  );
};
