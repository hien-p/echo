---
paths:
  - "dapp/src/components/**/*.tsx"
  - "dapp/src/contexts/**/*.tsx"
---

# React Component Rules

- Add `"use client"` only when the component uses hooks, event handlers, or browser APIs.
- Use named exports, not default exports. Pages in `dapp/src/app/` can use default exports.
- Merge Tailwind classes with `cn()` from `@/lib/utils`, not string concatenation.
- For reusable wrapper primitives, follow the `data-slot` pattern used in `dapp/src/components/ui/dropdown-menu.tsx`.
- Add new shadcn/ui primitives from the app directory: `cd dapp && npx shadcn@latest add <component>`.
- Import icons from `lucide-react`.
- Put reusable UI primitives in `dapp/src/components/ui/`.
- Put feature-specific components in `dapp/src/components/general/`.
- Keep components focused. If a file grows past ~200 lines, look for natural extractions.

## React 19 and Rendering

- Prefer regular `ref` props in app code over new `forwardRef` wrappers unless a library type requires `forwardRef`.
- Prefer `use()` for new internal context reads when it improves control flow; keep existing `useContext()` code unless you are already touching it.
- Do not define components inside other components; it remounts them on each render.
- If a value can be computed from current props or state, derive it during render instead of mirroring it with `useEffect` and `setState`.
- If a side effect happens because the user clicked, submitted, or dragged, do it in the event handler instead of toggling state and reacting in an effect.
- When next state depends on previous state, use functional updates (`setState((curr) => ...)`) to avoid stale closures and extra callback dependencies.
- Use explicit conditionals when `0`, `NaN`, or an empty string would be a confusing render result.
- Keep server-to-client props narrow and serializable. Pass only the fields the client component actually needs, and do not pass both raw data and transformed copies of the same data across the boundary.
- Do not pass non-serializable values from server files into client components: functions, `Transaction` instances, Sui client instances, Maps, Sets, or class instances.
- Prefer clear composition over proliferating boolean props like `isX` and `hasY`. For complex reusable flows, favor explicit variants, compound components, or provider-backed composition instead of render-prop or boolean-mode APIs.
- Prefer children composition over `renderHeader`, `renderFooter`, or similar render-prop customization when the parent is mostly providing structure.

## Data and Performance

- Prefer the existing TanStack Query layer and `@mysten/dapp-kit-react` hooks over ad hoc `useEffect(() => { fetch(...) })` data loading in client components.
- Lazy-load heavy or browser-only UI with `next/dynamic` or conditional `import()` when it is not needed on first render.
- Defer non-critical third-party libraries until after hydration. Use `next/script` for scripts and avoid raw blocking `<script>` tags in component JSX.
- Browser-only values (`window`, `localStorage`, timestamps, random IDs) must be hydration-safe. Use mounted guards for client-only rendering, `useId()` for generated IDs, and keep no-flicker inline scripts narrowly scoped to first-paint-critical persisted values.
- Use `next/image` for application and NFT/media rendering when feasible, with explicit dimensions or `fill` plus `sizes`, and normalize `ipfs://` or remote media URLs before rendering.
- Use passive event listeners for touch, wheel, and scroll handlers when you do not call `preventDefault()`.
- Prefer lazy `useState(() => initialValue)` when initial state reads storage or does non-trivial computation.

## References

- Follow `dapp/src/components/general/ConnectWalletMenu.tsx` for dApp Kit usage.
- Follow `dapp/src/components/ui/dropdown-menu.tsx` for shadcn wrapper conventions.
- Follow `dapp/src/contexts/SuiProvider.tsx` for the existing client query and provider layer.
- After changes, run `cd dapp && pnpm lint` and `cd dapp && pnpm build`.
