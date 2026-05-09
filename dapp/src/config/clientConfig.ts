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
  /**
   * JSON-encoded array of Seal key-server configs:
   *   [{"objectId": "0x...", "weight": 1}, ...]
   * Empty/unset means Seal encryption is disabled — non-Public tiers will
   * still work but submissions are uploaded plaintext with a UI warning.
   */
  SEAL_KEY_SERVERS: z.string().default(""),
  /**
   * Sui address holding demo FormOwnerCaps. When set, the DemoAdminToggle
   * pill is shown in the header; flipping it on routes admin reads through
   * /api/demo/admin/* (server-side Seal decrypt) instead of wallet-driven
   * decrypt. Demo-only — server holds decrypt capability for these caps.
   */
  DEMO_ADMIN_ADDRESS: z.string().default(""),
  /**
   * Optional absolute origin for /api/* requests. When the dapp is served
   * from a static host (Walrus Sites) but the API routes live on a separate
   * origin (Cloudflare Pages/Worker), set this to e.g.
   *   https://echo-20u.pages.dev
   * — every client-side `fetch("/api/...")` then prepends this prefix and
   * goes cross-origin. Empty (default) keeps fetches relative for the
   * single-origin Cloudflare Pages deploy.
   */
  API_BASE_URL: z.string().default(""),
});

export const clientConfig = clientConfigSchema.parse({
  SUI_NETWORK: process.env.NEXT_PUBLIC_SUI_NETWORK,
  SUI_FULLNODE_URL: process.env.NEXT_PUBLIC_SUI_FULLNODE_URL,
  ENOKI_PUBLIC_KEY: process.env.NEXT_PUBLIC_ENOKI_PUBLIC_KEY,
  GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  ECHO_PACKAGE_ID: process.env.NEXT_PUBLIC_ECHO_PACKAGE_ID,
  WALRUS_NETWORK: process.env.NEXT_PUBLIC_WALRUS_NETWORK,
  SEAL_KEY_SERVERS: process.env.NEXT_PUBLIC_SEAL_KEY_SERVERS ?? "",
  DEMO_ADMIN_ADDRESS: process.env.NEXT_PUBLIC_DEMO_ADMIN_ADDRESS ?? "",
  API_BASE_URL: (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, ""),
});

/**
 * Build a fully-qualified URL for an /api path, honoring API_BASE_URL when
 * set. Use this everywhere instead of raw `fetch("/api/...")` so the
 * Walrus Sites build (which has no /api routes) cleanly reaches the
 * Cloudflare Pages origin that does.
 */
export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${clientConfig.API_BASE_URL}${normalized}`;
}
