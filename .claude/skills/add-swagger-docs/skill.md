---
name: add-swagger-docs
description: >-
  Add Swagger/OpenAPI `@swagger` JSDoc annotations to Next.js App Router API routes
  in the `dapp/` workspace, or set up the Swagger infrastructure from scratch if it
  does not exist yet. Use when the user asks to add Swagger, OpenAPI, or API
  documentation, when creating or editing API routes under `dapp/src/app/api/`, or
  when the user mentions documenting endpoints. Also trigger proactively when a new
  API route is created via the `add-dapp-page` skill.
argument-hint: "<route name or path, e.g. 'user' or 'api/transfers'>"
---

# Add Swagger API Documentation

## Task

Annotate API routes in `dapp/src/app/api/` with `@swagger` JSDoc comments so they appear in the interactive Swagger UI at `/docs`.

## Inputs

- `$ARGUMENTS`: route name or path to document (e.g. `"user"`, `"api/transfers"`).
- If empty, ask the user which route(s) they want to document before proceeding.

## Preconditions

- Working directory is the monorepo root.
- `pnpm install` has been run.
- Swagger infrastructure exists: `dapp/src/lib/swagger.ts`, `dapp/src/app/docs/`, and `dapp/src/app/api/docs/swagger.json/route.ts`. If any of these are missing, follow the setup guide in `setup.md` first.

## Steps

### 1. Add `@swagger` JSDoc to the route handler

Place a JSDoc block directly above the exported handler function in the route file.

**Key rules:**

- Use OpenAPI `{param}` syntax, not Next.js `[param]` — e.g. `/api/user/{id}`, not `/api/user/[id]`.
- Use 2-space indentation inside the YAML block.
- Add a `tags` array to group related endpoints in the UI.
- Reference shared schemas from `dapp/src/lib/swagger.ts` with `$ref: "#/components/schemas/..."`.

**GET with path parameter and schema reference:**

```typescript
/**
 * @swagger
 * /api/user/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/User"
 *       404:
 *         description: Not found
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // implementation
}
```

**POST with request body:**

```typescript
/**
 * @swagger
 * /api/transfers:
 *   post:
 *     summary: Create a transfer
 *     tags: [Transfers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [recipient, amount]
 *             properties:
 *               recipient:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       201:
 *         description: Transfer created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Transfer"
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/ErrorResponse"
 */
export async function POST(request: Request) {
  // implementation
}
```

**GET with query parameters:**

```typescript
/**
 * @swagger
 * /api/search:
 *   get:
 *     summary: Search items
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
export async function GET(request: Request) {
  // implementation
}
```

### 2. Add shared schemas (if needed)

If the route returns or accepts a reusable data shape, add it to the `components.schemas` object in `dapp/src/lib/swagger.ts`. See `HealthResponse` and `ErrorResponse` there for the pattern.

Example:

```typescript
components: {
  schemas: {
    User: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        email: { type: "string", format: "email" },
      },
    },
    // ... other schemas
  },
}
```

### 3. Update the `apis` glob (if needed)

The glob in `dapp/src/lib/swagger.ts` is `"./src/app/api/**/route.ts"`. If routes live in a non-standard location, extend the array.

### 4. Verify

Run from the monorepo root:

1. `pnpm format` — fix formatting.
2. `cd dapp && pnpm lint` — no ESLint errors.
3. `cd dapp && pnpm test` — tests pass.
4. `cd dapp && pnpm build` — build succeeds.
5. `cd dapp && pnpm dev` — start dev server, visit `/docs` and confirm the new route appears. Visit `/api/docs/swagger.json` and confirm the route is in the JSON spec.

## Constraints

- Never import `dapp/src/config/clientConfig.ts` in API routes — use `process.env` directly.
- Do not modify files in `examples/`.
- Follow `dapp/src/app/api/health/route.ts` as the canonical example of an annotated route.
- Add `export const dynamic = "force-dynamic"` to non-cacheable API routes.
- If the new route warrants a test, add one in `dapp/test/` per the `add-dapp-page` skill.

## Verification

- [ ] `pnpm format:check` exits 0.
- [ ] `cd dapp && pnpm lint` exits 0.
- [ ] `cd dapp && pnpm test` exits 0.
- [ ] `cd dapp && pnpm build` exits 0.
- [ ] Route appears in Swagger UI at `/docs`.
- [ ] Route appears in JSON spec at `/api/docs/swagger.json`.

## Failure handling

- **Route not appearing in Swagger UI:** Check that the `apis` glob in `dapp/src/lib/swagger.ts` matches the route file path. The default `"./src/app/api/**/route.ts"` covers routes under `dapp/src/app/api/`.
- **Path uses `[id]` instead of `{id}`:** OpenAPI uses `{param}` for path parameters. Replace Next.js bracket syntax in the JSDoc.
- **YAML indentation error in JSDoc:** Use exactly 2 spaces per indentation level inside the `@swagger` block. Misaligned YAML silently drops the route.
- **`swagger-jsdoc` placed in devDependencies:** `swagger-jsdoc` runs at request time to build the spec — it must be in `dependencies`, not `devDependencies`.
- **Missing swagger-ui CSS:** The client component must import `"swagger-ui-react/swagger-ui.css"`. Without it the UI renders without styles.
- **Build fails with "use client" conflict:** API route files must not import `dapp/src/config/clientConfig.ts` (which has `"use client"`). Use `process.env` directly.
- **Schema reference not resolving:** Ensure the schema is defined in `dapp/src/lib/swagger.ts` under `components.schemas` and the `$ref` path matches exactly: `"#/components/schemas/SchemaName"`.
