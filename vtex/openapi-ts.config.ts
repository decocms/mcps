import { defineConfig } from "@hey-api/openapi-ts";
import { readdirSync } from "fs";

const schemas = readdirSync("./schemas")
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));

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
  schemas.map((name) => ({
    input: `./schemas/${name}.json`,
    output: { path: `./server/generated/${name}` },
    plugins: sharedPlugins,
  })),
);
