/**
 * Download VTEX OpenAPI schemas from the official repository
 */
const SCHEMAS = [
  {
    name: "catalog",
    url: "https://raw.githubusercontent.com/vtex/openapi-schemas/master/VTEX%20-%20Catalog%20API.json",
  },
  {
    name: "orders",
    url: "https://raw.githubusercontent.com/vtex/openapi-schemas/master/VTEX%20-%20Orders%20API.json",
  },
  {
    name: "logistics",
    url: "https://raw.githubusercontent.com/vtex/openapi-schemas/master/VTEX%20-%20Logistics%20API.json",
  },
];

async function downloadSchemas() {
  const fs = await import("fs/promises");
  const path = await import("path");

  const schemasDir = path.join(import.meta.dirname, "..", "schemas");

  // Ensure schemas directory exists
  await fs.mkdir(schemasDir, { recursive: true });

  for (const schema of SCHEMAS) {
    console.log(`Downloading ${schema.name} schema...`);

    const response = await fetch(schema.url);
    if (!response.ok) {
      throw new Error(
        `Failed to download ${schema.name}: ${response.statusText}`,
      );
    }

    const content = await response.text();
    const filePath = path.join(schemasDir, `${schema.name}.json`);

    await fs.writeFile(filePath, content, "utf-8");
    console.log(`  ✓ Saved to ${filePath}`);
  }

  console.log("\nAll schemas downloaded successfully!");
}

downloadSchemas().catch(console.error);
