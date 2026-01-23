/**
 * Generate TypeScript clients from VTEX OpenAPI schemas
 */
import { createClient } from "@hey-api/openapi-ts";
import path from "path";

const SCHEMAS = ["catalog", "orders", "logistics"] as const;

/**
 * Sanitize method names by removing invalid characters
 */
function sanitizeMethodName(name: string): string {
  return name
    .replace(/@/g, "_") // Replace @ with underscore
    .replace(/[^a-zA-Z0-9_]/g, "") // Remove other invalid chars
    .replace(/^_+/, "") // Remove leading underscores
    .replace(/_+$/, ""); // Remove trailing underscores
}

async function generateClients() {
  const schemasDir = path.join(import.meta.dirname, "..", "schemas");
  const outputDir = path.join(import.meta.dirname, "..", "server", "generated");

  for (const schema of SCHEMAS) {
    console.log(`\nGenerating client for ${schema}...`);

    await createClient({
      input: path.join(schemasDir, `${schema}.json`),
      output: path.join(outputDir, schema),
      plugins: [
        "@hey-api/typescript",
        "@hey-api/client-fetch",
        {
          name: "@hey-api/sdk",
          asClass: true,
          operationId: false,
          methodNameBuilder: (operation: any) => {
            // Sanitize the method name to remove @ and other invalid characters
            const name = operation.name || operation.id || "unknown";
            return sanitizeMethodName(name);
          },
        },
      ],
    });

    console.log(`  ✓ Generated ${schema} client`);
  }

  console.log("\nAll clients generated successfully!");
}

generateClients().catch(console.error);
