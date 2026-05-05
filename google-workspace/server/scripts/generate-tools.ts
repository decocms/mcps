/**
 * Refresh per-service snapshots in server/tools/generated/ and the
 * human-readable TOOLS.md preview.
 *
 * Run: `bun run generate-tools`
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSnapshots } from "@decocms/mcps-shared/google-mcp/generate-snapshot";
import { BACKEND_MCPS } from "../constants.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "tools", "generated");
const PACKAGE_ROOT = join(HERE, "..", "..");
const TOOLS_MD_PATH = join(PACKAGE_ROOT, "TOOLS.md");

await generateSnapshots({
  title: "Google Workspace — Tool Catalog",
  outDir: OUT_DIR,
  toolsMarkdownPath: TOOLS_MD_PATH,
  prefixed: true,
  backends: Object.entries(BACKEND_MCPS).map(([service, url]) => ({
    service,
    url,
  })),
});
