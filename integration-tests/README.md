# Integration Tests

This package provides a scaffold for performing integration tests for a move package, using Vitest and TestContainers, by:

- spinning up a disposable local Sui network
- funding a fresh account using a local faucet
- publishing your contracts
- signing and executing any transactions to test the possible use cases

## Prerequisites

- Install the required dependencies in the `integration-tests` folder:

```
pnpm install
```

- Install Docker

## Quickstart

1. Set your local contract path in the `local` field in [config.ts](./test/config.ts)
2. Run `pnpm run test`. The Vitest setup will:
   - Start Postgres and a Sui localnet using test containers.
   - Create a new admin wallet
   - Request SUI from the faucet
   - Publish the package of the specified path
   - Print the object changes and keep the package id in a global variable

During development, it might be more productive to use `pnpm run test:hot` so that you don't need to wait for the [globalSetup.ts](./test/globalSetup.ts) script to end every time that you add a new test / update an existing one.

When integrating with a CI/CD pipeline, you can use `pnpm run test`

## Code Generation

This package includes [`@mysten/codegen`](https://www.npmjs.com/package/@mysten/codegen) for generating type-safe TypeScript bindings from your Move contracts.

### Setup

1. Define your packages in [`sui-codegen.config.ts`](./sui-codegen.config.ts). For local packages (not registered on MVR), use the `@local-pkg` scope:

```ts
{
  package: '@local-pkg/your-package',
  path: '../path/to/your/move/package',
}
```

If your package is registered on [MVR](https://www.mvr.land), use the MVR name and network instead:

```ts
{
  package: '@your-mvr-scope/your-package',
  packageName: 'your-package',
  network: 'testnet',
}
```

2. Generate package summaries by running `sui move summary` in the root of your Move package.

3. Run code generation:

```
pnpm codegen
```

This generates TypeScript code in `./src/generated/`.

### Using generated code

The generated code provides type-safe functions for calling Move functions and BCS definitions for parsing Move types. When using `@local-pkg` packages, configure your `SuiGrpcClient` with MVR overrides to resolve the package name:

```ts
import { SuiGrpcClient } from "@mysten/sui/grpc";

const client = new SuiGrpcClient({
  network: "localnet",
  baseUrl: "http://localhost:9000",
  mvr: {
    overrides: {
      packages: {
        "@local-pkg/your-package": YOUR_PACKAGE_ID,
      },
    },
  },
});
```
