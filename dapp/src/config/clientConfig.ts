/** The zod schema that is used to parse the env variables.
 * By using zod, we ensure that any errors will be caught at build time.
 */

import { z } from "zod";

export const clientConfigSchema = z.object({
  SUI_NETWORK: z.enum(["mainnet", "testnet", "devnet"]),
  SUI_FULLNODE_URL: z.url(),
  ENOKI_PUBLIC_KEY: z.string(),
  GOOGLE_CLIENT_ID: z.string(),
});

export const clientConfig = clientConfigSchema.parse({
  SUI_NETWORK: process.env.NEXT_PUBLIC_SUI_NETWORK,
  SUI_FULLNODE_URL: process.env.NEXT_PUBLIC_SUI_FULLNODE_URL,
  ENOKI_PUBLIC_KEY: process.env.NEXT_PUBLIC_ENOKI_PUBLIC_KEY,
  GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
});
