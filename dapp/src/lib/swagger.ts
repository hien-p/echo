import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "DApp template API",
      version: "1.0.0",
      description: "API documentation for the Next.js DApp template.",
    },
    components: {
      schemas: {
        HealthResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Health status message",
              example: "OK",
            },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "Error message",
              example: "An error occurred",
            },
          },
        },
      },
    },
  },
  apis: ["./src/app/api/**/route.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
