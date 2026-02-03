#!/usr/bin/env bun

/**
 * Filters a list of MCPs against deploy.json to get only deployable ones
 * Usage: bun run scripts/filter-deployable-mcps.ts ["mcp1","mcp2","mcp3"]
 * Outputs: JSON array of MCPs that are in deploy.json
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const mcpsJson = args[0];

if (!mcpsJson) {
  console.error("❌ Error: MCPs JSON array is required");
  console.error(
    'Usage: bun run scripts/filter-deployable-mcps.ts \'["mcp1","mcp2"]\'',
  );
  process.exit(1);
}

let mcps: string[];
try {
  mcps = JSON.parse(mcpsJson);
} catch (error) {
  console.error("❌ Error: Invalid JSON array provided");
  process.exit(1);
}

// Read deploy.json
const deployJsonPath = join(process.cwd(), "deploy.json");
if (!existsSync(deployJsonPath)) {
  console.error("❌ Error: deploy.json not found");
  console.error("⚠️ Falling back to deploying all changed MCPs");
  console.log(JSON.stringify(mcps));
  process.exit(0);
}

const deployConfig = JSON.parse(readFileSync(deployJsonPath, "utf-8"));
const deployableMcps = Object.keys(deployConfig);

// Filter MCPs that are in deploy.json
const filteredMcps = mcps.filter((mcp) => deployableMcps.includes(mcp));

// Log skipped MCPs to stderr (won't interfere with JSON output)
const skippedMcps = mcps.filter((mcp) => !deployableMcps.includes(mcp));
if (skippedMcps.length > 0) {
  console.error(
    `\n⏭️  Skipping ${skippedMcps.length} MCP(s) not in deploy.json: ${skippedMcps.join(", ")}`,
  );
  console.error(
    "ℹ️  To enable auto-deploy for these MCPs, add them to deploy.json",
  );
}

if (filteredMcps.length > 0) {
  console.error(
    `\n✅ Will deploy ${filteredMcps.length} MCP(s): ${filteredMcps.join(", ")}`,
  );
} else {
  console.error("\n📭 No deployable MCPs after filtering");
}

// Output filtered array as JSON
console.log(JSON.stringify(filteredMcps));
