# Counter Backend E2E Test

This project is a minimal example of writing e2e integration tests for a Node.js/Express.js and a Next.js backend that interact with the Sui blockchain. It demonstrates how to test blockchain operations end-to-end, including reading from and writing to smart contracts deployed on Sui.

We deploy a simple `counter` contract on Sui, and build two separate backends (one in [Node.js](https://nodejs.org/en) with [Express.js](https://expressjs.com/), and one in [Next.js](https://nextjs.org/)) that allow us to read and increment the on-chain `counter`, including integration tests with [vitest](https://vitest.dev/).

## Project Structure

```
counter-backend-e2e-test/
├── README.md
├── express-api/ # Express.js REST API
├── next-api/    # Next.js API routes
└── move/        # Smart contract with counter logic
```

## Quickstart

### Prerequisites

1. **Sui CLI**: Install the [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install)
2. **Node.js**: Version 18 or higher
3. **pnpm**: Package manager

### 1. Deploy the Smart Contract

First, publish the Move counter contract to Sui:

```bash
cd move/counter
sui move build
sui client publish
```

Note the `Package ID` and `Counter Object ID` from the output.

### 2. Set Up Environment Variables

Copy the environment files and fill in the required values:

**For Express API:**

```bash
cd express-api
cp .env.example .env
```

**For Next.js API:**

```bash
cd next-api
cp .env.example .env
```

Edit both `.env` files with:

- `SUI_FULLNODE_URL`: Sui network full node url (depending on the network where you published your contracts)
- `PACKAGE_ID`: Package ID from contract deployment
- `COUNTER_ID`: Counter object ID from deployment
- `ADMIN_SECRET_KEY`: Base64 encoded private key for transactions

### 3. Install Dependencies and Run Tests

**Express.js Backend:**

```bash
cd express-api
npm install
npm test          # Run integration tests
npm dev           # Start development server
```

**Next.js Backend:**

```bash
cd next-api
pnpm install
pnpm test          # Run integration tests
pnpm dev           # Start development server
```

## API Specification

Each API exposes the same 3 self-explanatory and public endpoints:

| HTTP Method | Node.js-Express.js URL | Next.js URL      |
| ----------- | ---------------------- | ---------------- |
| GET         | `/health`              | `/api/health`    |
| GET         | `/counter`             | `/api/counter`   |
| POST        | `/increment`           | `/api/increment` |

### API Documentation (Swagger)

Both APIs include Swagger UI for interactive API documentation:

- **Express.js**: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
- **Next.js**: [http://localhost:3000/api/docs](http://localhost:3000/docs)

## Vitest specifics

- **E2E Flow Testing** using the `/counter` endpoint to read the current value of the counter, then calling the `/increment` endpoint to update it, waiting for the transaction to be available on the full node, and re-reading the new value using the `/counter` endpoint
- **Sequential execution** using `describe.sequential()` to ensure proper test order
- **HTTP API testing** using [supertest](https://www.npmjs.com/package/supertest) to make requests to Express endpoints, or just call the API function for testing the NextJS API Routes
- **Environment variables parsing** using the [dotenv](https://www.npmjs.com/package/dotenv) library

### Vitest setup

For Node.js-Express.js, we need to:

1. Install the required npm dependencies with:

```
npm install -D vitest supertest @types/supertest
```

2. Create the [test/](express-api/test/) directory with the test file [counter.test.ts](express-api/test/counter.test.ts)

For Next.js, we need to:

1. Install the required dependencies with:

```
pnpm install -D vitest jsdom vite-tsconfig-paths
pnpm install dotenv
```

2. Add the `vitest.config.mts` configuration file:

```
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    setupFiles: "dotenv/config",
  },
});
```

3. Create the [test/](next-api/test/) directory with the test file [counter.test.ts](next-api/test/counter.test.ts)

### Vitest project structure

The test files are just placed in a `test/` directory, at the same level with the corresponding `src/`:

- express.js: [express-api/test/counter.test.ts](express-api/test/counter.test.ts)
- next.js: [next-api/test/counter.test.ts](next-api/test/counter.test.ts)

## Smart Contract Details

The Move smart contract [counter.move](move/counter/sources/counter.move) is a minimal toy example that implements:

- **Shared Object**: Counter is accessible by anyone
- **Simple State**: Single `u64` value tracking count
- **Increment Function**: Public function to increase counter value
- **Initialization**: Creates shared counter object with value 0
