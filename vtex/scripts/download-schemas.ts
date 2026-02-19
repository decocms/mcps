/**
 * Download VTEX OpenAPI schemas from the official repository
 */
const SCHEMAS = [
  {
    name: "catalog",
    file: "VTEX%20-%20Catalog%20API.json",
  },
  {
    name: "orders",
    file: "VTEX%20-%20Orders%20API.json",
  },
  {
    name: "logistics",
    file: "VTEX%20-%20Logistics%20API.json",
  },
  {
    name: "pricing",
    file: "VTEX%20-%20Pricing%20API.json",
  },
  {
    name: "search",
    file: "VTEX%20-%20Intelligent%20Search%20API.json",
  },
  {
    name: "checkout",
    file: "VTEX%20-%20Checkout%20API.json",
  },
  {
    name: "promotions",
    file: "VTEX%20-%20Promotions%20%26%20Taxes%20API.json",
  },
];

const BASE_URL =
  "https://raw.githubusercontent.com/vtex/openapi-schemas/master/";

async function downloadSchemas() {
  const fs = await import("fs/promises");
  const path = await import("path");

  const schemasDir = path.join(import.meta.dirname, "..", "schemas");

  await fs.mkdir(schemasDir, { recursive: true });

  for (const schema of SCHEMAS) {
    const url = `${BASE_URL}${schema.file}`;
    console.log(`Downloading ${schema.name} schema...`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to download ${schema.name}: ${response.status} ${response.statusText}`,
      );
    }

    const content = await response.text();

    // Validate it's a valid OpenAPI document
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`${schema.name}: downloaded content is not valid JSON`);
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("openapi" in parsed) ||
      !("paths" in parsed)
    ) {
      throw new Error(
        `${schema.name}: JSON does not look like an OpenAPI spec (missing 'openapi' or 'paths' keys)`,
      );
    }

    const filePath = path.join(schemasDir, `${schema.name}.json`);
    await fs.writeFile(filePath, content, "utf-8");
    console.log(`  ✓ Saved to ${filePath}`);
  }

  console.log("\nAll schemas downloaded successfully!");
}

downloadSchemas().catch((error) => {
  console.error(error);
  process.exit(1);
});
