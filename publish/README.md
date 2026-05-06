# Publish utilities — Echo

Used to publish the `move/echo` package to a Sui network.

This package provides two main utilities:

1. [development phase] Publish a Move package to a chosen Sui network
2. [production phase] Get the unsigned bytes of the publish transaction to sign them by a multi-sig account / KMS.

## Echo deploy quickstart

```bash
# 1. (one-time) create an admin keypair and fund it from the testnet faucet
sui client new-address ed25519        # save the resulting Bech32 secret + address
sui client switch --address <new-addr>
sui client faucet                     # uses the default faucet for the active network

# 2. fill publish/.env (see .env.example) with the new ADMIN_SECRET_KEY
#    MOVE_PACKAGE_PATH=../move/echo is already set.

# 3. publish from the repo root
pnpm --filter publish run deploy

# 4. Open publish/data/publish.json — copy the `packageId` value into
#    dapp/.env as NEXT_PUBLIC_ECHO_PACKAGE_ID, then `pnpm build` the dapp.
```

After step 4 the form-builder at `/forms/new` will pick up the package ID and unblock saves.

## Prerequisites

- Install the required dependencies in the `publish` folder:

```
pnpm install
```

- For the use cases (1) and (2), install Sui CLI.
- For the use case (3), install Docker.

## Use Case (1): [development phase] Publish a move package to a Sui Network

1. Create a `.env` file following the structure of the [.env.example](./.env.example).
2. Fill in the variables:

- `SUI_NETWORK`: The identifier of the Sui network that we are targeting (mainnet, testnet, devnet, localnet)
- `SUI_FULLNODE_URL`: RPC URL for the target network.
- `ADMIN_SECRET_KEY`: base64-encoded secret key for the deployer.
- `MOVE_PACKAGE_PATH`: path to the Move package you want to publish.

The `ADMIN_ADDRESS` env var is not required for this use case.

3. Run the following command to build and publish the package via [publish.ts](./src/scripts/publish.ts). The script publishes the package, and then stores the response in the file `data/publish.json` so that you can capture the package and object IDs for your app:

```
pnpm run deploy
```

## Use Case (2): [production phase] Get the unsigned bytes for publishing a package

1. Create a `.env` file following the structure of the [.env.example](./.env.example).
2. Fill in the variables:

- `SUI_FULLNODE_URL`: RPC URL for the target network.
- `ADMIN_ADDRESS`: the address of the account that will later sign the publish transaction.
- `MOVE_PACKAGE_PATH`: path to the Move package you want to publish.

The `ADMIN_SECRET_KEY` env var is not required for this use case.

3. Run the following command to build and publish the package via [publishBytes.ts](./src/scripts/publishBytes.ts). The script builds the tx for publushing the package, and then stores the unsigned transaction bytes in base64 format in the file `data/publish-bytes.txt` so that you can share them with the team that performs the signing.

```
pnpm run deploy-bytes
```
