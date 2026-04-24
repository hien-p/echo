import type { SuiCodegenConfig } from "@mysten/codegen";

const config: SuiCodegenConfig = {
  output: "./src/generated",
  generateSummaries: true,
  prune: true,
  packages: [
    {
      package: "@local-pkg/counter",
      path: "../examples/counter-backend-e2e-test/move/counter",
    },
    // If your package is registered on MVR, use the MVR name and network instead of a local path:
    // {
    // 	package: '@your-mvr-scope/your-package',
    // 	packageName: 'your-package',
    // 	network: 'testnet',
    // },
  ],
};

export default config;
