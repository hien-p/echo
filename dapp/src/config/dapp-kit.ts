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
