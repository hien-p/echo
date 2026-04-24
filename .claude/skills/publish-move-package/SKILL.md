---
name: publish-move-package
description: >-
  Publish a Sui Move package with the `publish/` scripts, either via direct deploy
  with an admin key or by generating unsigned bytes for multi-sig/KMS signing. Use
  when the user asks to deploy, publish, or push a Move contract to devnet,
  testnet, mainnet, or localnet. Do not use for scaffolding contracts or building
  frontend features.
argument-hint: "<deploy | deploy-bytes>"
disable-model-invocation: true
---

# Publish Move Package

## Task

Publish a Sui Move package to a target network using the `publish/` scripts.

## Inputs

- `$ARGUMENTS`: either `deploy` (direct publish with admin key) or `deploy-bytes` (unsigned bytes for multi-sig/KMS).
- If empty, ask the user which mode they need:
  - **`deploy`** — development phase, signs with `ADMIN_SECRET_KEY`.
  - **`deploy-bytes`** — production phase, generates unsigned tx bytes for external signing.

## Preconditions

- Working directory is the monorepo root.
- `pnpm install` has been run.
- Sui CLI is installed (`sui --version`).
- The Move package compiles: `sui move build --path <MOVE_PACKAGE_PATH>`.
- `publish/.env` exists with the required variables filled in.
- `publish/src/env.ts` is the source of truth for publish config. It is server-only and uses plain env names, not `NEXT_PUBLIC_*`.

## Steps

### Mode A: `deploy` (development)

1. Verify `publish/.env` contains:
   - `SUI_NETWORK` — target network (`localnet`, `devnet`, `testnet`, `mainnet`).
   - `SUI_FULLNODE_URL` — RPC endpoint for the target network.
   - `ADMIN_SECRET_KEY` — base64-encoded deployer secret key.
   - `MOVE_PACKAGE_PATH` — relative path to the Move package (e.g. `../move/my_package`).
   - Values are plain server env vars, not `NEXT_PUBLIC_*`.

2. Run the deploy script:

```bash
cd publish && pnpm run deploy
```

3. On success, the script writes `publish/data/publish.json` with the full transaction response including the package ID and created objects.

4. If the frontend needs the package ID, add a feature-specific `NEXT_PUBLIC_<FEATURE>_PACKAGE_ID` entry to `dapp/.env.example` and `dapp/src/config/clientConfig.ts`.

### Mode B: `deploy-bytes` (production)

1. Verify `publish/.env` contains:
   - `SUI_NETWORK` — target network (`localnet`, `devnet`, `testnet`, `mainnet`).
   - `SUI_FULLNODE_URL` — RPC endpoint.
   - `ADMIN_ADDRESS` — address of the account that will sign later.
   - `MOVE_PACKAGE_PATH` — relative path to the Move package.
   - Values are plain server env vars, not `NEXT_PUBLIC_*`.

2. Run the deploy-bytes script:

```bash
cd publish && pnpm run deploy-bytes
```

3. On success, the script writes `publish/data/publish-bytes.txt` with base64-encoded unsigned transaction bytes.

4. Share the bytes file with the signing team.

## Constraints

- **This skill is manual-only** (`disable-model-invocation: true`) — it has external side effects.
- Do not run `deploy` with a mainnet admin key unless the user explicitly confirms.
- Do not commit `publish/.env` — it contains secrets. Only `publish/.env.example` is committed.
- Do not modify the publish scripts (`publish/src/`) unless the user specifically asks.
- `publish/data/` is gitignored — do not attempt to commit output files.
- Do not call `sui client publish` directly from the repo root or from tests when the publish scripts already cover the workflow.
- Do not import `dapp/src/config/clientConfig.ts` in publish code. Use `publish/src/env.ts`.

## Verification

- [ ] Move package compiles before publishing: `sui move build --path <MOVE_PACKAGE_PATH>`.
- [ ] For `deploy`: `publish/data/publish.json` exists and contains a successful transaction.
- [ ] For `deploy-bytes`: `publish/data/publish-bytes.txt` exists and contains base64 bytes.
- [ ] No secrets in committed files: `publish/.env` is gitignored.
- [ ] If the frontend needs the package ID, it is copied into `dapp/.env.example` and `dapp/src/config/clientConfig.ts` as a `NEXT_PUBLIC_*_PACKAGE_ID` entry.

## Failure handling

- **"MOVE_PACKAGE_PATH is not defined":** Add `MOVE_PACKAGE_PATH` to `publish/.env`.
- **"ADMIN_SECRET_KEY is not defined":** Add the deployer key to `publish/.env` (deploy mode only).
- **"ADMIN_ADDRESS is not defined":** Add the signer address to `publish/.env` (deploy-bytes mode only).
- **Publish transaction failed:** Check the error in console output. Common causes: insufficient gas, package already published at address, dependency resolution failure.
- **`sui move build` fails:** Fix the contract first using the `scaffold-move-package` skill or manually.
- **Frontend still points at the old package:** Update the relevant `NEXT_PUBLIC_*_PACKAGE_ID` entry in `dapp/.env.example` and `dapp/src/config/clientConfig.ts`, and wire local env files before building the dapp.
