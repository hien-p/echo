# Swagger Setup Guide

Use this guide only when the Swagger infrastructure does not exist yet. If `dapp/src/lib/swagger.ts`, `dapp/src/app/docs/`, and `dapp/src/app/api/docs/swagger.json/route.ts` already exist, skip this file.

## Install Dependencies

```bash
cd dapp
pnpm add swagger-jsdoc swagger-ui-react
pnpm add -D @types/swagger-jsdoc @types/swagger-ui-react
```

## Core Files

### `dapp/src/lib/swagger.ts`

```typescript
import swaggerJsdoc from "swagger-jsdoc";

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "API Documentation",
      version: "1.0.0",
      description: "Interactive API documentation",
    },
    components: {
      schemas: {
        HealthResponse: {
          type: "object",
          properties: {
            status: { type: "string", example: "ok" },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string" },
            details: { type: "string" },
          },
        },
      },
    },
  },
  apis: ["./src/app/api/**/route.ts"],
});
```

### `dapp/src/app/docs/swagger-ui-client.tsx`

```typescript
"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

export default function SwaggerUIClient() {
  return <SwaggerUI url="/api/docs/swagger.json" />;
}
```

### `dapp/src/app/docs/page.tsx`

```typescript
import { notFound } from "next/navigation";
import SwaggerUIClient from "./swagger-ui-client";

export default function ApiDocs() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <div className="min-h-screen">
      <SwaggerUIClient />
    </div>
  );
}
```

### `dapp/src/app/api/docs/swagger.json/route.ts`

```typescript
import { NextResponse } from "next/server";
import { swaggerSpec } from "@/lib/swagger";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not Found", { status: 404 });
  }

  return NextResponse.json(swaggerSpec);
}
```

## Verification

After creating these files:

1. `pnpm format` — fix formatting.
2. `cd dapp && pnpm lint` — no ESLint errors.
3. `cd dapp && pnpm build` — build succeeds.
4. `cd dapp && pnpm dev` — start dev server.
5. Visit `http://localhost:3000/docs` — Swagger UI should load (may be empty until routes are annotated).
6. Visit `http://localhost:3000/api/docs/swagger.json` — JSON spec should appear.

## Production Options

**Dev-only (default):** The setup above restricts `/docs` and `/api/docs/swagger.json` to `NODE_ENV === "development"`. This is the recommended approach.

**Feature flag:** Replace `NODE_ENV !== "development"` checks with `!process.env.NEXT_PUBLIC_ENABLE_API_DOCS`.

**Auth-protected:** Add bearer token validation in the route handlers before returning the spec.
