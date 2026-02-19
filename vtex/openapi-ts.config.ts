import { defineConfig } from "@hey-api/openapi-ts";

const APIS = [
  "catalog",
  "orders",
  "logistics",
  "pricing",
  "search",
  "checkout",
  "promotions",
] as const;

const sharedPlugins = [
  "@hey-api/typescript",
  "@hey-api/client-fetch",
  {
    name: "zod" as const,
    // Generate request schemas (used by tool adapter for input validation)
    requests: true,
    // Skip response schemas — tools return raw JSON; saves ~50K+ lines
    responses: false,
    // Reusable component schemas (for documentation + cross-reference)
    definitions: true,
    // Carry OpenAPI description metadata through to generated schemas
    metadata: true,
  },
  {
    name: "@hey-api/sdk" as const,
  },
] as const;

export default defineConfig(
  APIS.map((api) => ({
    input: `./schemas/${api}.json`,
    output: {
      path: `./server/generated/${api}`,
    },
    plugins: sharedPlugins,
  })),
);
