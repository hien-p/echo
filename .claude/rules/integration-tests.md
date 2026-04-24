---
paths:
  - "integration-tests/test/**/*.ts"
  - "integration-tests/src/**/*.ts"
---

# Integration Testing Rules

- Use Vitest for all tests (`import { describe, it, expect, inject } from "vitest"`).
- Use `inject()` to access shared state from `integration-tests/test/globalSetup.ts`: `objectChanges`, `adminAccount`, `localnetPort`, `graphqlPort`, `faucetPort`, and `suiToolsContainerId`.
- Do not start containers or publish packages in test files — that happens in `globalSetup.ts`.
- The default timeout is 120s to account for container operations.
- Docker must be running — tests will hang without it.
- Follow the pattern in `integration-tests/test/e2e.test.ts`.
- After changes, run `cd integration-tests && pnpm test`.
