#!/usr/bin/env bun

/**
 * Deployment script for MCPs in the monorepo
 * Usage: bun run scripts/deploy.ts [mcp-name] [--preview] [--env KEY=VALUE]...
 *
 * Options:
 *   --preview: Deploy to preview environment (no promotion)
 *   --env KEY=VALUE: Set environment variable (can be used multiple times)
 */

import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const mcpName = args[0];
const isPreview = args.includes("--preview");

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
    "Usage: bun run scripts/deploy.ts [mcp-name] [--preview] [--env KEY=VALUE]...",
  );
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

  // Remove wrangler.json after build (Cloudflare Workers doesn't accept it)
  const wranglerJsonPath = join(mcpPath, "dist/server/wrangler.json");
  if (existsSync(wranglerJsonPath)) {
    console.log("🧹 Removing wrangler.json from build output...");
    await $`rm ${wranglerJsonPath}`;
  }

  // Deploy
  const deployToken = process.env.DECO_DEPLOY_TOKEN;
  if (!deployToken) {
    console.error(
      "❌ Error: DECO_DEPLOY_TOKEN environment variable is required",
    );
    process.exit(1);
  }

  console.log(`🚀 Deploying to ${isPreview ? "preview" : "production"}...`);

  // Build deploy command with env variables
  const baseCmd = isPreview
    ? [
        "deco",
        "deploy",
        "-y",
        "--public",
        "--no-promote",
        "./dist/server",
        "-t",
        deployToken,
      ]
    : ["deco", "deploy", "-y", "--public", "./dist/server", "-t", deployToken];

  const envVarsToPass = [
    "OPENAI_API_KEY",
    "GOOGLE_GENAI_API_KEY",
    "NANOBANANA_API_KEY",
    "OPENROUTER_API_KEY",
    "PINECONE_TOKEN",
    "PINECONE_INDEX",
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

  const result = await $`${baseCmd}`.quiet();

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
