import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Counter API",
      version: "1.0.0",
      description: "A simple Next.js API for Sui Counter",
    },
    components: {
      schemas: {
        CounterResponse: {
          type: "object",
          properties: {
            value: {
              type: "integer",
              description: "Current counter value",
              example: 42,
            },
          },
        },
        IncrementResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            digest: {
              type: "string",
              description: "Transaction digest",
              example: "ABC123...",
            },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            effects: {
              type: "object",
              description: "Transaction effects on failure",
            },
          },
        },
      },
    },
  },
  apis: ["./src/app/api/**/route.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
