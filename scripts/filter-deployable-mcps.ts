#!/usr/bin/env bun

/**
 * Filters a list of MCPs to get deployable ones:
 * 1. MCPs in deploy.json (internal servers - will be deployed)
 * 2. MCPs with app.json (external servers - will be published to registry)
 *
 * Usage: bun run scripts/filter-deployable-mcps.ts ["mcp1","mcp2","mcp3"]
 * Outputs: JSON array of deployable MCPs
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
let deployableMcps: string[] = [];

if (existsSync(deployJsonPath)) {
  const deployConfig = JSON.parse(readFileSync(deployJsonPath, "utf-8"));
  deployableMcps = Object.keys(deployConfig);
}

// Filter MCPs that are either:
// 1. In deploy.json (internal servers)
// 2. Have app.json (external servers - registry publish)
const filteredMcps = mcps.filter((mcp) => {
  // Check if in deploy.json
  if (deployableMcps.includes(mcp)) {
    return true;
  }

  // Check if has app.json (for registry publish)
  const appJsonPath = join(process.cwd(), mcp, "app.json");
  if (existsSync(appJsonPath)) {
    return true;
  }

  return false;
});

// Log details to stderr (won't interfere with JSON output)
const inDeployJson = filteredMcps.filter((mcp) => deployableMcps.includes(mcp));
const hasAppJson = filteredMcps.filter(
  (mcp) =>
    !deployableMcps.includes(mcp) &&
    existsSync(join(process.cwd(), mcp, "app.json")),
);
const skippedMcps = mcps.filter((mcp) => !filteredMcps.includes(mcp));

if (inDeployJson.length > 0) {
  console.error(
    `\n🚀 Will deploy ${inDeployJson.length} MCP(s) (in deploy.json): ${inDeployJson.join(", ")}`,
  );
}

if (hasAppJson.length > 0) {
  console.error(
    `\n📦 Will publish ${hasAppJson.length} MCP(s) to registry (app.json): ${hasAppJson.join(", ")}`,
  );
}

if (skippedMcps.length > 0) {
  console.error(
    `\n⏭️  Skipping ${skippedMcps.length} MCP(s) (no deploy.json entry or app.json): ${skippedMcps.join(", ")}`,
  );
}

if (filteredMcps.length === 0) {
  console.error("\n📭 No deployable MCPs after filtering");
}

// Output filtered array as JSON
console.log(JSON.stringify(filteredMcps));
