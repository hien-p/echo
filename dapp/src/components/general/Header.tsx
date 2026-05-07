import Link from "next/link";
import { ConnectWalletMenu } from "./ConnectWalletMenu";
import { DemoAdminToggle } from "./DemoAdminToggle";

export const Header = () => {
  return (
    <header className="p-2xs bg-background border-b text-foreground sticky top-0 flex items-center justify-between">
      <div className="flex items-center gap-md">
        <Link href="/" className="text-xl font-semibold">
          Echo
        </Link>
        <nav className="flex items-center gap-sm text-sm text-muted-foreground">
          <Link href="/forms" className="hover:text-foreground">
            My forms
          </Link>
          <Link href="/forms/new" className="hover:text-foreground">
            New form
          </Link>
          <Link href="/reputation" className="hover:text-foreground">
            Reputation
          </Link>
          <Link href="/insights" className="hover:text-foreground">
            Insights
          </Link>
          <Link href="/logs/" className="hover:text-foreground">
            Devlog
          </Link>
        </nav>
      </div>
      <div className="flex items-center gap-sm">
        <DemoAdminToggle />
        <ConnectWalletMenu />
      </div>
    </header>
  );
};
