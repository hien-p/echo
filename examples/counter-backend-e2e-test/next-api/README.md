### dApp

This is the Next.js scaffold of the `dapp-template` built by SolEng.
It is bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Quickstart

### Prepare the environment variables

1. Install [Vercel CLI](https://vercel.com/docs/cli)
2. Link local code to Vercel project:
   1. cd into the root of the repo
   2. ```
      vercel link
      ```
3. Prepare your `.env` file:

   If the environment variables are already set up on Vercel, you can just pull their values with:

   ```
   vercel env pull dapp/.env
   ```

   A new [.env](.env) file should have been created, including multiple vercel-related (and other) env vars. This file is not tracked by Git, since it can contain secrets.

   If this is the first time setting up the project using the dapp-template, create a [.env](.env) file following the structure of the [.env.example](.env.example) one:

   ```
   NEXT_PUBLIC_SUI_NETWORK="testnet"
   NEXT_PUBLIC_SUI_FULLNODE_URL="https://mysten-rpc.testnet.sui.io:443"
   NEXT_PUBLIC_ENOKI_PUBLIC_KEY=""
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
   ```

### Run the local development server

```
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## UI Theming

### Tech Stack

- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [PostCSS](https://postcss.org/)

### Design Tokens

Design tokens are defined as CSS variables in [`globals.css`](./src/app/globals.css).

The `:root` and `.dark` selectors define two categories of tokens:

| Category     | Prefix                                     | Description                                                                                                                                                                                                                         | Example usage                        |
| ------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Coloring** | Variant (e.g. `--primary`, `--background`) | Consumed by `--color-*` utilities in the `@theme` block. Defaults are aligned with shadcn/ui components. Should also be used in custom components for consistency. **Heavily customized per product.**                              | `bg-primary text-primary-foreground` |
| **Sizing**   | `--size-*` → `--spacing-*`, `--radius-*`   | Base size scale (`--size-*`) feeds into spacing and radius tokens. Reusable across products. Canonical definitions live in [Figma](https://www.figma.com/design/gJvboyotCv3bDDhcL0a3QF/0.0---DS---Slush?node-id=11033-64025&m=dev). | `p-md m-lg space-x-sm rounded-lg`    |

### Dark Mode

The `.dark` selector overrides only **color variables** and is applied after `@theme inline`.  
Enable dark mode globally by adding the `dark` class to `<html>` or the app root.

### Customization Guidelines

- **Colors & Typography** → project-specific. Override in `:root` / `.dark`.
- **Spacing & Radius** → shared across projects. Keep token names stable; only adjust values if the base scale itself changes.

## Wallet Connection

The dapp template allows connecting your Sui wallet either using the classic browser extensions (eg Slush, Phantom) or signing in with Google with Enoki.

### Tech Stack

- [Sui dApp kit](https://sdk.mystenlabs.com/dapp-kit)
- [Enoki TS SDK](https://docs.enoki.mystenlabs.com/ts-sdk)

### Customisation

- [Remove Enoki Sign In from wallet modal](https://docs.enoki.mystenlabs.com/ts-sdk/sign-in#removing-enoki-wallets-from-the-connectbutton-modal)
- [Use custom buttons for enoki signin](https://docs.enoki.mystenlabs.com/ts-sdk/sign-in#using-custom-login-buttons)
- [Add other auth providers for Enoki Sign In](https://docs.enoki.mystenlabs.com/ts-sdk/register#react-integration)

### Add a specific Google project (can be generalised to other auth providers)

The current `GOOGLE_CLIENT_ID` is a draft one used for the dapp template.
Whenever we want to add google sign in to a new product, we have to:

1. Create the google project in the google console, under the `Solutions Engineering` team [here](https://console.cloud.google.com/apis/credentials?project=solutions-engineering-418016) (reminder to update the allowlisted redirect uris accordingly)
2. Create the Enoki project in Enoki Portal [here](https://portal.enoki.mystenlabs.com/teams/solutions-eng)
3. Create an Enoki public api key in the `Overview` tab of the project, as we did for the dApp Template [here](https://portal.enoki.mystenlabs.com/teams/solutions-eng/apps/dapp-template)
4. Connect the authentication provider to the Enoki project in the `Auth Providers` tab of the project in Enoki portal, as we did [here](https://portal.enoki.mystenlabs.com/teams/solutions-eng/apps/dapp-template/auth)
5. Update the corresponding env variables in the `dapp/.env`:

```
NEXT_PUBLIC_ENOKI_PUBLIC_KEY=""
NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
```
