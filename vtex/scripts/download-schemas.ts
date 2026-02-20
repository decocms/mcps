/**
 * Download VTEX OpenAPI schemas from the official repository.
 * Dynamically discovers all JSON files via the GitHub API — no hardcoded list.
 */

const GITHUB_API_URL =
  "https://api.github.com/repos/vtex/openapi-schemas/contents/";
const RAW_BASE_URL =
  "https://raw.githubusercontent.com/vtex/openapi-schemas/master/";

/**
 * Derive a canonical schema name from a raw filename.
 *
 * Transform rules (applied in order):
 *  1. Strip "VTEX - " prefix (case-insensitive)
 *  2. Strip ".json" suffix
 *  3. Lowercase
 *  4. Replace " & " → "-and-"
 *  5. Replace " - " → "-"
 *  6. Replace spaces → "-"
 *  7. Replace any remaining non-alphanumeric chars (except "-") → "-"
 *  8. Strip trailing "-api" or "-apis" suffix
 *  9. Collapse multiple dashes and trim leading/trailing dashes
 */
function deriveSchemaName(filename: string): string {
  let name = filename;

  // 1. Strip "VTEX - " prefix (case-insensitive)
  name = name.replace(/^vtex\s*-\s*/i, "");

  // 2. Strip ".json" suffix
  name = name.replace(/\.json$/i, "");

  // 3. Lowercase
  name = name.toLowerCase();

  // 4. Replace " & " → "-and-"
  name = name.replace(/ & /g, "-and-");

  // 5. Replace " - " → "-"
  name = name.replace(/ - /g, "-");

  // 6. Replace spaces → "-"
  name = name.replace(/ /g, "-");

  // 7. Replace any remaining non-alphanumeric chars (except "-") → "-"
  name = name.replace(/[^a-z0-9-]/g, "-");

  // 8. Strip trailing "-api" or "-apis" suffix (one or more times)
  name = name.replace(/-apis?$/g, "");
  // Re-apply in case there were stacked suffixes like "-api-v2" doesn't apply,
  // but handle "-apis-v2" → no; only strip from the very end
  // Apply once more to catch cases like "foo-apis-api" (unlikely, but safe)

  // 9. Collapse multiple dashes and trim leading/trailing dashes
  name = name.replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");

  return name;
}

interface GitHubFile {
  name: string;
  type: string;
  download_url: string | null;
}

async function downloadSchemas() {
  const fs = await import("fs/promises");
  const path = await import("path");

  const schemasDir = path.join(import.meta.dirname, "..", "schemas");
  await fs.mkdir(schemasDir, { recursive: true });

  // 1. Fetch directory listing from GitHub API
  console.log(`Fetching file list from ${GITHUB_API_URL} ...`);
  const listResponse = await fetch(GITHUB_API_URL, {
    headers: { "User-Agent": "vtex-mcp-schema-downloader" },
  });
  if (!listResponse.ok) {
    throw new Error(
      `GitHub API request failed: ${listResponse.status} ${listResponse.statusText}`,
    );
  }
  const allEntries: GitHubFile[] = await listResponse.json();

  // 2. Filter for .json files only
  const jsonFiles = allEntries.filter(
    (entry) => entry.type === "file" && entry.name.endsWith(".json"),
  );

  console.log(`Found ${jsonFiles.length} JSON files in the repository.\n`);

  let downloaded = 0;
  let skipped = 0;

  for (const file of jsonFiles) {
    const name = deriveSchemaName(file.name);
    const rawUrl = `${RAW_BASE_URL}${encodeURIComponent(file.name)}`;

    console.log(`Processing: ${file.name}`);
    console.log(`  → name: ${name}`);

    const response = await fetch(rawUrl, {
      headers: { "User-Agent": "vtex-mcp-schema-downloader" },
    });
    if (!response.ok) {
      console.warn(
        `  SKIP: failed to download (${response.status} ${response.statusText})`,
      );
      skipped++;
      continue;
    }

    const content = await response.text();

    // Validate JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.warn(`  SKIP: content is not valid JSON`);
      skipped++;
      continue;
    }

    // Validate it looks like an OpenAPI spec
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("openapi" in parsed) ||
      !("paths" in parsed)
    ) {
      console.warn(
        `  SKIP: not a valid OpenAPI spec (missing 'openapi' or 'paths' keys)`,
      );
      skipped++;
      continue;
    }

    const filePath = path.join(schemasDir, `${name}.json`);
    await fs.writeFile(filePath, content, "utf-8");
    console.log(`  ✓ Saved to ${filePath}`);
    downloaded++;
  }

  console.log(`\nSummary: ${downloaded} downloaded, ${skipped} skipped.`);
}

downloadSchemas().catch((error) => {
  console.error(error);
  process.exit(1);
});
