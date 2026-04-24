# dapp-template

The dapp template built by SolEng to bootstrap production battle-ready dapps easily and quickly.

Including UI dapp, move contracts, typescript sdk and e2e tests.

## Prerequisites

1. Use the correct node version in [.nvmrc](.nvmrc):

```bash
nvm use
```

2. Install the [sui cli](https://docs.sui.io/guides/developer/getting-started/sui-install)
3. Install the [MVR cli](https://docs.suins.io/move-registry/tooling/mvr-cli)
4. Install the [Mysten Codegen](https://sdk.mystenlabs.com/codegen)

## Project Structure

This project is a monorepo utilizing [pnpm workspaces](https://pnpm.io/workspaces)

The project is comprised by 5 main directories:

1. [dapp](dapp): This directory holds a NextJS dapp starter template
2. [move](move): This directory is just a placeholder. You should store your Move contracts here.
3. [publish](publish): This directory holds a NodeJS project with helpful scripts to publish your contracts.
4. [integration-tests](integration-tests): This directory holds a NodeJS project with helpful scripts to publish and test the contracts in a temporary env using [TestContainers](https://testcontainers.com/).
5. [examples](examples): This directory holds simplified examples of dapps/backends/contracts that use the best practices.

### QuickStart

## Git Workflow

We follow a structured git workflow to ensure our codebase works smoothly across multiple environments (production, staging) and to make post-launch maintenance easier.

### Branches

#### Long-Living Branches

| Branch    | Environment | Sui Network | Description                                                                                                                                  |
| --------- | ----------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`    | Production  | mainnet     | Deployed to production (automatically on each push). Connected to Sui mainnet and holds stable, release-ready code.                          |
| `staging` | Staging     | testnet     | Used for testing and QA before production. Connected to Sui testnet. All new features are merged and tested here before promotion to `main`. |

#### Support Branches

| Branch Type                    | Origin    | Target    | Purpose                                                                                                                                                         |
| ------------------------------ | --------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature/*` or `author-name/*` | `staging` | `staging` | For new features or enhancements. Each feature branch is created from `staging`, tested via staging deployments, and merged back into `staging` once validated. |
| `hotfix/*` or `author-name/*`  | `main`    | `main`    | For urgent fixes to production. Created directly from `main`, merged back to `main`, and immediately back-merged to `staging` to keep histories in sync.        |

> **Note:** Branch naming convention (`feature/*` vs `author-name/*`) is pending final decision and will be determined separately.

### Branch Protection Rules

Ensure your repository has the same branch protection ruleset configured as the [dapp-template repository](https://github.com/MystenLabs/dapp-template/settings/rules/8725524). This helps maintain code quality and prevents accidental pushes to protected branches.

### CI/CD: Vitest PR Checks

This template includes GitHub Actions that run Vitest tests on every PR, for testing:

- The endpoints of your [dapp](dapp)
- The integration tests in the [integration-tests](integration-tests) directory

#### 1. Create the workflow files

- Copy [`.github/workflows/integration-tests.yml`](.github/workflows/integration-tests.yml) and [`.github/workflows/dapp-tests.yml`](.github/workflows/dapp-tests.yml) to your repository root.

#### 2. Add GitHub Secrets

In the case that your dapp tests need secret env vars, go to your repository: **Settings → Secrets and variables → Actions → Repository secrets → New repository secret**

Add these secrets (values from your `.env`):
| Secret Name | Description |
|-------------|-------------|
| `NEXT_PUBLIC_SUI_NETWORK` | `testnet` or `mainnet` |
| `NEXT_PUBLIC_SUI_FULLNODE_URL` | Your Sui RPC URL |

Add any additional secrets your app requires.

#### 3. Require status checks (recommended)

To block PRs from merging until tests pass:

1. Go to **Settings → Rules → Rulesets → New branch ruleset**
2. Name: `test-covered`
3. Target branches: `main` (and `staging` if needed)
4. Enable **"Require status checks to pass"**
5. Search and add the `test` check (only appears after the workflow has run once)
6. Click **Create**

> **Tip:** The `test` check won't appear in the dropdown until the workflow has run at least once. Create a test PR first to trigger it.

### Environment Variables

- Each deployment environment (Vercel, Pulumi, etc.) manages its own environment variables
- `.env.example` is committed to the repository as a reference template only
- Real `.env` files are git-ignored and environment-specific

**Important:** Never hardcode network values (e.g., `"testnet"`) in code. Always use environment variables like `SUI_NETWORK` for network-specific configurations

### Ruleset json file

To use the ruleset you can import the following json file into the github repository on the settings page.

```json
{
  "id": 8725524,
  "name": "gitflow",
  "target": "branch",
  "source_type": "Repository",
  "source": "MystenLabs/dapp-template",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "exclude": [],
      "include": ["refs/heads/main"]
    }
  },
  "rules": [
    {
      "type": "deletion"
    },
    {
      "type": "non_fast_forward"
    },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": false,
        "required_reviewers": [],
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "automatic_copilot_code_review_enabled": false,
        "allowed_merge_methods": ["squash", "rebase"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          {
            "context": "Vercel",
            "integration_id": 8329
          }
        ]
      }
    },
    {
      "type": "copilot_code_review",
      "parameters": {
        "review_on_push": false,
        "review_draft_pull_requests": false
      }
    },
    {
      "type": "required_deployments",
      "parameters": {
        "required_deployment_environments": ["Preview"]
      }
    },
    {
      "type": "copilot_code_review"
    }
  ],
  "bypass_actors": []
}
```
