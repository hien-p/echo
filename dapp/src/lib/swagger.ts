/**
 * Static OpenAPI spec for the Echo dapp.
 *
 * Originally swagger-jsdoc auto-scanned route files via the filesystem.
 * That can't run on edge / Cloudflare Pages, so we hand-maintain a small
 * spec here. Keep it terse — it's only exposed in dev (`/docs`).
 */

export const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "Echo API",
    version: "0.1.0",
    description: "Echo decentralized feedback & forms platform — internal API.",
  },
  paths: {
    "/api/health": {
      get: {
        summary: "Health check",
        tags: ["Health"],
        responses: {
          "200": {
            description: "API is healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      HealthResponse: {
        type: "object",
        properties: {
          message: { type: "string", example: "OK" },
        },
      },
    },
  },
};
