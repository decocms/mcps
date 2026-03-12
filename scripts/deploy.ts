#!/usr/bin/env bun

/**
 * Deployment script for Cloudflare Workers MCPs (wrangler.toml).
 * Usage: bun run scripts/deploy.ts [mcp-name] [--env KEY=VALUE]...
 *
 * Only runs deco deploy for MCPs with a wrangler.toml.
 * kubernetes-bun MCPs are deployed via publish-registry.yml (deco registry publish).
 */

import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const mcpName = args[0];

// Extract --env arguments
const envArgs: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--env" && args[i + 1]) {
    const envValue = args[i + 1];
    if (!envValue.includes("=")) {
      console.error(`❌ Error: Invalid --env format: ${envValue}`);
      console.error("Expected format: --env KEY=VALUE");
      process.exit(1);
    }
    envArgs.push(envValue);
    i++;
  } else if (args[i] === "--env") {
    console.error("❌ Error: --env flag requires a value");
    console.error("Usage: --env KEY=VALUE");
    process.exit(1);
  }
}

if (!mcpName) {
  console.error("❌ Error: MCP name is required");
  console.error(
    "Usage: bun run scripts/deploy.ts [mcp-name] [--env KEY=VALUE]...",
  );
  process.exit(1);
}

const mcpPath = join(process.cwd(), mcpName);

if (!existsSync(mcpPath)) {
  console.error(`❌ Error: MCP directory not found: ${mcpName}`);
  process.exit(1);
}

const wranglerPath = join(mcpPath, "wrangler.toml");
if (!existsSync(wranglerPath)) {
  console.log(
    `ℹ️  ${mcpName} is a kubernetes-bun MCP — deployment handled by publish-registry.yml`,
  );
  process.exit(0);
}

const packageJsonPath = join(mcpPath, "package.json");
if (!existsSync(packageJsonPath)) {
  console.error(`❌ Error: No package.json found in ${mcpName}`);
  process.exit(1);
}

console.log(`\n🚀 Deploying Cloudflare Workers MCP: ${mcpName}`);
console.log(`📁 Path: ${mcpPath}\n`);

try {
  // Install workspace dependencies first (from root)
  console.log("📦 Installing workspace dependencies...");
  await $`bun install`;

  // Change to MCP directory
  process.chdir(mcpPath);

  // Install dependencies
  console.log("📦 Installing dependencies...");
  await $`bun install`;

  // Build
  console.log("🔨 Building...");
  await $`bun run build`;

  const deployToken = process.env.DECO_DEPLOY_TOKEN;
  if (!deployToken) {
    console.error(
      "❌ Error: DECO_DEPLOY_TOKEN environment variable is required",
    );
    process.exit(1);
  }

  const baseCmd = [
    "deco",
    "deploy",
    "-y",
    "--public",
    "./dist/server",
    "-t",
    deployToken,
  ];

  const envVarsToPass = [
    "OPENAI_API_KEY",
    "GOOGLE_GENAI_API_KEY",
    "NANOBANANA_API_KEY",
    "OPENROUTER_API_KEY",
    "PINECONE_TOKEN",
    "PINECONE_INDEX",
    "REPLICATE_API_TOKEN",
    "PERPLEXITY_API_KEY",
    "META_APP_ID",
    "META_APP_SECRET",
  ];

  const autoEnvArgs: string[] = [];
  for (const envVar of envVarsToPass) {
    if (process.env[envVar]) {
      autoEnvArgs.push(`${envVar}=${process.env[envVar]}`);
    }
  }

  for (const envVar of envArgs) {
    baseCmd.push("--env", envVar);
  }
  for (const envVar of autoEnvArgs) {
    baseCmd.push("--env", envVar);
  }

  const totalEnvVars = envArgs.length + autoEnvArgs.length;
  if (totalEnvVars > 0) {
    console.log(
      `🔐 Setting ${totalEnvVars} environment variable(s) (${autoEnvArgs.length} auto-detected)`,
    );
  }

  console.log(`🚀 Deploying to production (Cloudflare Workers)...`);
  await $`${baseCmd}`.quiet();
  console.log(`\n✅ Deployed successfully!`);

  process.exit(0);
} catch (error) {
  console.error(`\n❌ Deployment failed for ${mcpName}:`, error);
  process.exit(1);
}
