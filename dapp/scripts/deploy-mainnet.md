# Mainnet deploy runbook — Echo on Walrus Sites

End-to-end checklist for publishing the Echo Move package to **Sui mainnet** and the SPA to **Walrus Sites mainnet**, using the wallet currently active in `sui client`.

Each step is a separate command you run. Mainnet is irreversible — no step is automated by this repo.

---

## 0. Prerequisites

- **Sui CLI active address** controls funds + caps:
  - `sui client active-address` should print the address you intend to deploy as.
  - This runbook uses `0x010030a0afc40b6d8fe99cee368cab5652baa0d36b7be60a9b017d5228c0bdfd` as the example — substitute yours.
- **Mainnet balances** (check with `sui client switch --env mainnet && sui client balance`):
  - ≥ 0.5 SUI (Move publish gas + tx fees during caps transfer)
  - ≥ 5 WAL (`site-builder publish ./out` at ~200 epochs runs in this range; verify with `walrus info` once on v2)
- **Walrus CLI v2.x** — `walgo doctor` will refuse to run with v1.x against site-builder v2.2.1.

## 1. Update walrus to v2.x

```sh
suiup install walrus@mainnet     # or `walrus@testnet` per walgo doctor
walrus --version                  # confirm 2.x
walgo doctor                      # all green, version mismatch gone
```

## 2. Switch sui CLI to mainnet

```sh
sui client switch --env mainnet
sui client active-env             # → mainnet
sui client balance                # confirm SUI + WAL on the active address
```

## 3. Fill publish/.env.mainnet

```sh
cp publish/env.mainnet.example publish/.env.mainnet
```

Then export the Ed25519 secret key for the active address and paste it into `publish/.env.mainnet` → `ADMIN_SECRET_KEY=`:

```sh
sui keytool export --key-identity $(sui client active-address)
# Copy the `suiPrivateKey` value (starts with `suiprivkey1...`).
```

`publish/.env.mainnet` is intentionally **not** committed — keep ADMIN_SECRET_KEY out of git.

## 4. Publish the Echo Move package to mainnet

```sh
cd publish
env-cmd -f .env.mainnet pnpm deploy
```

The script writes `publish/data/publish.json` with `packageId`, digest, and effects. Copy the `packageId` value.

> **Cost:** roughly 0.02–0.05 SUI for the publish tx. Irreversible.

## 5. Wire the mainnet package id into the dapp

Edit `dapp/.env.mainnet`:

```diff
- NEXT_PUBLIC_ECHO_PACKAGE_ID=""
+ NEXT_PUBLIC_ECHO_PACKAGE_ID="0x<paste packageId from step 4>"
```

Same file: also paste the mainnet **Seal key servers** array and (if you registered a separate Enoki app for mainnet) the new `NEXT_PUBLIC_ENOKI_PUBLIC_KEY` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

Mainnet secrets (`ENOKI_PRIVATE_KEY`, `OPENROUTER_API_KEY`, etc.) go in **`dapp/.env.local`** on the build host — never in `.env.mainnet`.

## 6. Build the static SPA against mainnet env

```sh
cd dapp
pnpm build:walrus:mainnet
```

This runs `env-cmd -f .env.mainnet bash scripts/build-walrus.sh`, which:

- parks `src/app/api` and `src/middleware.ts` (static export can't host API routes)
- strips `runtime = "edge"` from every page that has it
- injects `generateStaticParams` stubs into dynamic routes
- runs `next build` with `WALRUS_BUILD=1`
- copies the static assets into `dapp/out/`
- restores all parked/stripped files via the EXIT trap

Expect ~200–400 files in `dapp/out/`.

## 7. Publish to Walrus Sites mainnet

```sh
cd dapp
site-builder --context mainnet publish ./out --epochs 200
```

`~/.config/walrus/sites-config.yaml` already has the mainnet context (package `0x26eb7e…0ad27`). Output is a Sui object id — that's your site's anchor. The portal URL follows the pattern `https://<base36(objectId)>.wal.app`.

> **Cost:** denominated in WAL, proportional to total bytes × epochs. For a typical Next SPA expect 1–3 WAL for 200 epochs.

## 8. (Optional) Bind a SuiNS name to the site

```sh
walgo domain                       # prints CLI guidance for the SuiNS binding tx
```

Or follow [`docs.walrus.site/sites/portal#suins`](https://docs.walrus.site/sites/portal#suins) — bind the site object id to a `.sui` name you own, then the site is reachable at `https://yourname.wal.app`.

## 9. Post-deploy

- Update Google OAuth client → add your new portal URL (`https://<id>.wal.app` and any SuiNS binding) to **Authorised redirect URIs**, or sign-in stays broken with `redirect_uri_mismatch`.
- Update Enoki dashboard → same origin list.
- Update CLAUDE.md / README to note that mainnet is now live; flip the `cf-deploy.yml` mainnet gate when ready.

---

## What's already in place for you

- `~/.config/walrus/client_config.yaml` — mainnet + testnet contexts.
- `~/.config/walrus/sites-config.yaml` — mainnet + testnet contexts.
- `dapp/scripts/build-walrus.sh` — runs once via `pnpm build:walrus` (uses ambient env) or `pnpm build:walrus:mainnet` (wraps with `env-cmd`).
- `move/echo/` — Move package, currently published only to testnet.
- `publish/env.mainnet.example` — template; copy to `.env.mainnet` and fill `ADMIN_SECRET_KEY`.

## Rollback

If step 4 fails or you want to discard a published package, you can't — Sui mainnet packages are immutable. You can publish a new version and migrate caps + form objects to it, but the old `packageId` lives forever.
