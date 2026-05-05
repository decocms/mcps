import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateSnapshots } from "@decocms/mcps-shared/google-mcp/generate-snapshot";
import { BACKEND_URL } from "../constants.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "tools", "generated");
const PACKAGE_ROOT = join(HERE, "..", "..");
const TOOLS_MD_PATH = join(PACKAGE_ROOT, "TOOLS.md");

await generateSnapshots({
  title: "Google GKE — Tool Catalog",
  outDir: OUT_DIR,
  toolsMarkdownPath: TOOLS_MD_PATH,
  backends: [{ service: "gke", url: BACKEND_URL }],
});
