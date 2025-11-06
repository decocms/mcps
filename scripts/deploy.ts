#!/usr/bin/env bun

/**
 * Deployment script for MCPs in the monorepo
 * Usage: bun run scripts/deploy.ts [mcp-name] [--preview]
 */

import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const mcpName = args[0];
const isPreview = args.includes("--preview");

if (!mcpName) {
  console.error("❌ Error: MCP name is required");
  console.error("Usage: bun run scripts/deploy.ts [mcp-name] [--preview]");
  process.exit(1);
}

const mcpPath = join(process.cwd(), mcpName);

// Verify MCP exists
if (!existsSync(mcpPath)) {
  console.error(`❌ Error: MCP directory not found: ${mcpName}`);
  process.exit(1);
}

// Verify package.json exists
const packageJsonPath = join(mcpPath, "package.json");
if (!existsSync(packageJsonPath)) {
  console.error(`❌ Error: No package.json found in ${mcpName}`);
  process.exit(1);
}

console.log(`\n🚀 Deploying MCP: ${mcpName}`);
console.log(`📁 Path: ${mcpPath}`);
console.log(`🔧 Mode: ${isPreview ? "Preview" : "Production"}\n`);

try {
  // Change to MCP directory
  process.chdir(mcpPath);

  // Install dependencies
  console.log("📦 Installing dependencies...");
  await $`bun install`;

  // Build
  console.log("🔨 Building...");
  await $`bun run build`;

  // Deploy
  const deployToken = process.env.DECO_DEPLOY_TOKEN;
  if (!deployToken) {
    console.error(
      "❌ Error: DECO_DEPLOY_TOKEN environment variable is required",
    );
    process.exit(1);
  }

  console.log(`🚀 Deploying to ${isPreview ? "preview" : "production"}...`);

  const deployCmd = isPreview
    ? $`deco deploy -y --public --no-promote ./dist/server -t ${deployToken}`
    : $`deco deploy -y --public ./dist/server -t ${deployToken}`;

  const result = await deployCmd.quiet();

  // Try to extract preview URL from output if in preview mode
  if (isPreview) {
    const output = result.stdout.toString();
    const urlMatch = output.match(/https:\/\/[^\s]+/);
    if (urlMatch) {
      const previewUrl = urlMatch[0];
      console.log(`\n✅ Preview deployed successfully!`);
      console.log(`🔗 Preview URL: ${previewUrl}`);

      // Output for GitHub Actions to capture
      console.log(`\n::set-output name=preview_url::${previewUrl}`);
      console.log(`::set-output name=mcp_name::${mcpName}`);
    }
  } else {
    console.log(`\n✅ Deployed successfully to production!`);
  }

  process.exit(0);
} catch (error) {
  console.error(`\n❌ Deployment failed for ${mcpName}:`, error);
  process.exit(1);
}
