---
paths:
  - "dapp/src/config/**/*.ts"
  - "publish/src/env.ts"
  - "**/.env.example"
---

# Environment & Config Rules

- Validate env access with Zod in the relevant config module. Avoid scattering raw `process.env` reads throughout application code.
- Dapp client config lives in `dapp/src/config/clientConfig.ts`. Publish config lives in `publish/src/env.ts`.
- In the dapp, `NEXT_PUBLIC_*` env vars are parsed into plain config keys such as `clientConfig.SUI_NETWORK`. In `publish/`, server-only vars stay unprefixed (`SUI_NETWORK`, `SUI_FULLNODE_URL`, `ADMIN_SECRET_KEY`, `ADMIN_ADDRESS`, `MOVE_PACKAGE_PATH`).
- Client-side vars must use the `NEXT_PUBLIC_` prefix. Vars without the prefix are server-only and must not be exposed through `clientConfig`.
- Never commit real secrets (`ADMIN_SECRET_KEY`, private keys, API tokens) to any `.env.example`. Use blank placeholders or comments only.
- When adding a new env var:
  1. Add it to the relevant `.env.example` with a helpful example value or short comment.
  2. Add it to the Zod schema in the matching config file.
  3. Mark optional fields with `.optional()` only when the value is genuinely optional for that config module.
- In `publish/src/env.ts`, it is fine for command-specific values to stay optional in the schema when different scripts require different keys. Enforce `ADMIN_SECRET_KEY` in `deploy` and `ADMIN_ADDRESS` in `deploy-bytes`.
- Never hardcode network names (`"testnet"`, `"mainnet"`) or RPC URLs in source code — always read from config.
- `publish/src/env.ts` may include `localnet` in addition to `mainnet`, `testnet`, and `devnet`.
- `dapp/src/config/clientConfig.ts` is for browser-safe config only. Never import it in API routes, server-only modules, or `publish/`.
- `publish/src/env.ts` is server-only. Do not use `NEXT_PUBLIC_*` names there unless the same value truly needs to be exposed to the browser elsewhere.
- Follow the patterns in `dapp/src/config/clientConfig.ts` and `publish/src/env.ts`.
- After dapp config changes, run `cd dapp && pnpm build` to verify Zod parsing succeeds.
