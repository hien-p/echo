/** The zod schema that is used to parse the env variables.
 * By using zod, we ensure that any errors will be caught at build time.
 */

import { z } from "zod";

export const clientConfigSchema = z.object({
  SUI_NETWORK: z.enum(["mainnet", "testnet", "devnet"]),
  SUI_FULLNODE_URL: z.url(),
  ENOKI_PUBLIC_KEY: z.string(),
  GOOGLE_CLIENT_ID: z.string(),
  ECHO_PACKAGE_ID: z.string(),
  WALRUS_NETWORK: z.enum(["mainnet", "testnet"]),
});

export const clientConfig = clientConfigSchema.parse({
  SUI_NETWORK: process.env.NEXT_PUBLIC_SUI_NETWORK,
  SUI_FULLNODE_URL: process.env.NEXT_PUBLIC_SUI_FULLNODE_URL,
  ENOKI_PUBLIC_KEY: process.env.NEXT_PUBLIC_ENOKI_PUBLIC_KEY,
  GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  ECHO_PACKAGE_ID: process.env.NEXT_PUBLIC_ECHO_PACKAGE_ID,
  WALRUS_NETWORK: process.env.NEXT_PUBLIC_WALRUS_NETWORK,
});
