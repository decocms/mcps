#!/usr/bin/env bun

/**
 * Detects which MCPs have changed based on git diff and watchFolders configuration
 * Usage: bun run scripts/detect-changed-mcps.ts [base-ref] [head-ref]
 * Outputs a JSON array of changed MCP names
 *
 * Behavior:
 * - Only MCPs with `watchFolders` in deploy.json are considered for automatic deploy
 * - MCP is triggered ONLY if changed files match one of its watchFolders
 * - MCPs without watchFolders require manual deployment via workflow_dispatch
 */

import { $ } from "bun";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const baseRef = args[0] || "origin/main";
const headRef = args[1] || "HEAD";

interface DeployConfig {
  site: string;
  entrypoint: string;
  platformName: string;
  watchFolders?: string[];
  watch?: string[];
}

type DeployJson = Record<string, DeployConfig>;

// Load deploy.json to get watchFolders configuration
function loadDeployConfig(): DeployJson {
  const deployJsonPath = join(process.cwd(), "deploy.json");
  if (!existsSync(deployJsonPath)) {
    console.error("❌ deploy.json not found");
    return {};
  }
  try {
    const content = readFileSync(deployJsonPath, "utf-8");
    return JSON.parse(content) as DeployJson;
  } catch (error) {
    console.error("❌ Failed to parse deploy.json:", error);
    return {};
  }
}

// Get changed files between two refs
async function getChangedFiles(): Promise<string[]> {
  try {
    const result = await $`git diff --name-only ${baseRef}...${headRef}`.text();
    return result.trim().split("\n").filter(Boolean);
  } catch (error) {
    console.error("Error getting git diff:", error);
    return [];
  }
}

// Normalize a watch pattern by stripping glob suffixes (e.g. "foo/**" -> "foo")
function normalizeWatchPattern(pattern: string): string {
  return pattern.replace(/\/\*+$/, "").replace(/\*+$/, "");
}

// Check if a changed file matches any watchFolder pattern
function fileMatchesWatchFolder(file: string, watchFolders: string[]): boolean {
  for (const rawFolder of watchFolders) {
    const folder = normalizeWatchPattern(rawFolder);
    // If folder ends with /, check if file starts with it
    if (folder.endsWith("/")) {
      if (file.startsWith(folder)) {
        return true;
      }
    } else {
      // Exact file match or nested file match
      if (file === folder || file.startsWith(folder + "/")) {
        return true;
      }
    }
  }
  return false;
}

// Discover MCPs that have app.json but are NOT in deploy.json (external/registry-only MCPs)
function discoverRegistryOnlyMcps(deployConfig: DeployJson): string[] {
  const rootDir = process.cwd();
  const deployMcpNames = new Set(Object.keys(deployConfig));
  const registryOnlyMcps: string[] = [];

  try {
    const entries = readdirSync(rootDir);
    for (const entry of entries) {
      // Skip non-directories and common non-MCP folders
      if (
        entry.startsWith(".") ||
        entry === "node_modules" ||
        entry === "scripts" ||
        entry === "shared"
      ) {
        continue;
      }

      const entryPath = join(rootDir, entry);
      if (!statSync(entryPath).isDirectory()) {
        continue;
      }

      // If it has app.json but is NOT in deploy.json, it's a registry-only MCP
      const appJsonPath = join(entryPath, "app.json");
      if (existsSync(appJsonPath) && !deployMcpNames.has(entry)) {
        registryOnlyMcps.push(entry);
      }
    }
  } catch (error) {
    console.error("⚠️  Error scanning for registry-only MCPs:", error);
  }

  return registryOnlyMcps;
}

// Determine which MCPs have changes based on watchFolders and app.json presence
async function getChangedMcps(): Promise<string[]> {
  const deployConfig = loadDeployConfig();
  const changedFiles = await getChangedFiles();

  if (changedFiles.length === 0) {
    console.error(
      "No changed files detected (empty commit or git diff failed)",
    );
    console.error(
      "ℹ️  To deploy specific MCPs manually, use workflow_dispatch with the 'mcps' input",
    );
    return [];
  }

  console.error(`\n📁 Changed files (${changedFiles.length}):`);
  for (const file of changedFiles.slice(0, 10)) {
    console.error(`   - ${file}`);
  }
  if (changedFiles.length > 10) {
    console.error(`   ... and ${changedFiles.length - 10} more`);
  }

  const changedMcps = new Set<string>();
  const mcpsWithoutWatchFolders: string[] = [];

  // 1. Check MCPs in deploy.json that have watchFolders or watch
  for (const [mcpName, config] of Object.entries(deployConfig)) {
    const watchPatterns = config.watchFolders ?? config.watch;
    if (!watchPatterns || watchPatterns.length === 0) {
      mcpsWithoutWatchFolders.push(mcpName);
      continue;
    }

    // Check if any changed file matches this MCP's watchFolders
    for (const file of changedFiles) {
      if (fileMatchesWatchFolder(file, watchPatterns)) {
        changedMcps.add(mcpName);
        console.error(`\n✅ ${mcpName} triggered by: ${file}`);
        console.error(`   watchFolders: [${watchPatterns.join(", ")}]`);
        break; // No need to check more files for this MCP
      }
    }
  }

  // 2. Check registry-only MCPs (have app.json but NOT in deploy.json)
  const registryOnlyMcps = discoverRegistryOnlyMcps(deployConfig);
  if (registryOnlyMcps.length > 0) {
    console.error(
      `\n📦 Registry-only MCPs found: ${registryOnlyMcps.join(", ")}`,
    );
  }

  for (const mcpName of registryOnlyMcps) {
    // Check if any changed file is inside this MCP's directory
    for (const file of changedFiles) {
      if (file.startsWith(`${mcpName}/`)) {
        changedMcps.add(mcpName);
        console.error(`\n✅ ${mcpName} (registry-only) triggered by: ${file}`);
        break;
      }
    }
  }

  // Log MCPs without watchFolders (won't be auto-deployed)
  if (mcpsWithoutWatchFolders.length > 0) {
    console.error(
      `\n⚠️  MCPs without watchFolders (require manual deploy): ${mcpsWithoutWatchFolders.join(", ")}`,
    );
  }

  return Array.from(changedMcps);
}

// Main execution
const changedMcps = await getChangedMcps();

// Output as JSON array for GitHub Actions
console.log(JSON.stringify(changedMcps));

// Summary log
if (changedMcps.length > 0) {
  console.error(
    `\n🚀 Will deploy ${changedMcps.length} MCP(s): ${changedMcps.join(", ")}`,
  );
} else {
  console.error("\n📭 No MCPs matched watchFolders criteria");
  console.error(
    "ℹ️  To deploy manually, use workflow_dispatch with the 'mcps' input",
  );
}
