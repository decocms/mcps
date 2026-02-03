#!/usr/bin/env bun

/**
 * Selective deployment script that respects deploy.json entries
 * Usage: bun run scripts/deploy-selective.ts [mcp-name] [--preview] [--env KEY=VALUE]...
 *
 * If mcp-name is not in deploy.json, deployment will be skipped.
 * This prevents accidental deploys and allows gradual rollout.
 */

import { $ } from "bun";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const mcpName = args[0];

if (!mcpName) {
  console.error("❌ Error: MCP name is required");
  console.error(
    "Usage: bun run scripts/deploy-selective.ts [mcp-name] [--preview] [--env KEY=VALUE]...",
  );
  process.exit(1);
}

// Read deploy.json to check if MCP is enabled for deployment
const deployJsonPath = join(process.cwd(), "deploy.json");
if (!existsSync(deployJsonPath)) {
  console.error("❌ Error: deploy.json not found");
  process.exit(1);
}

const deployConfig = JSON.parse(readFileSync(deployJsonPath, "utf-8"));

// Check if MCP is in deploy.json
if (!deployConfig[mcpName]) {
  console.log(`⏭️  Skipping ${mcpName} - Not configured in deploy.json`);
  console.log(`ℹ️  To enable deployment, add this MCP to deploy.json`);
  process.exit(0); // Exit successfully but skip deploy
}

console.log(`✅ ${mcpName} is configured for deployment in deploy.json`);

// Delegate to the regular deploy script
try {
  await $`bun run scripts/deploy.ts ${args}`;
  process.exit(0);
} catch (error) {
  console.error(`❌ Deployment failed for ${mcpName}:`, error);
  process.exit(1);
}
