"use client";

import { createDAppKit } from "@mysten/dapp-kit-react";
import { enokiWalletsInitializer } from "@mysten/enoki";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { clientConfig } from "./clientConfig";

export const dAppKit = createDAppKit({
  networks: [clientConfig.SUI_NETWORK],
  createClient(network) {
    return new SuiGrpcClient({
      network,
      baseUrl: clientConfig.SUI_FULLNODE_URL,
    });
  },
  walletInitializers: [
    enokiWalletsInitializer({
      apiKey: clientConfig.ENOKI_PUBLIC_KEY,
      providers: {
        ...(clientConfig.GOOGLE_CLIENT_ID && {
          google: {
            clientId: clientConfig.GOOGLE_CLIENT_ID,
            // Pin to origin "/" so we only need to register a single URL in
            // Google OAuth + Enoki, regardless of which page the user clicked
            // sign-in from. Without this, the SDK uses window.location.href
            // and every page (/forms/new, /logs, …) needs its own entry.
            redirectUrl:
              typeof window !== "undefined"
                ? `${window.location.origin}/`
                : undefined,
          },
        }),
      },
    }),
  ],
});

declare module "@mysten/dapp-kit-react" {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
