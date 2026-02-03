#!/usr/bin/env bun

/**
 * Detects which MCPs have changed based on git diff
 * Usage: bun run scripts/detect-changed-mcps.ts [base-ref] [head-ref]
 * Outputs a JSON array of changed MCP names
 */

import { $ } from "bun";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const baseRef = args[0] || "origin/main";
const headRef = args[1] || "HEAD";

// Get all directories in the repo root that have a package.json
function getAllMcps(): string[] {
  const repoRoot = process.cwd();
  const entries = readdirSync(repoRoot);

  const mcps = entries.filter((entry) => {
    const fullPath = join(repoRoot, entry);

    // Must be a directory
    if (!statSync(fullPath).isDirectory()) return false;

    // Skip special directories and templates
    if (
      [
        ".git",
        ".github",
        "node_modules",
        "scripts",
        "shared",
        "template-with-view",
      ].includes(entry)
    )
      return false;

    const hasPackageJson = existsSync(join(fullPath, "package.json"));
    const hasAppJson = existsSync(join(fullPath, "app.json"));
    // Must have a package.json or app.json
    if (!hasPackageJson && !hasAppJson) return false;

    return true;
  });

  return mcps;
}

// Get changed files between two refs
async function getChangedFiles(): Promise<string[]> {
  try {
    const result = await $`git diff --name-only ${baseRef}...${headRef}`.text();
    return result.trim().split("\n").filter(Boolean);
  } catch (error) {
    console.error("Error getting git diff:", error);
    // Fallback: check all MCPs
    return [];
  }
}

// Files that affect all MCPs when changed (infrastructure/shared files)
// NOTE: deploy.json is NOT included here - it's used as a filter, not a trigger
const GLOBAL_FILES = [
  ".github/workflows/deploy.yml",
  ".github/workflows/deploy-preview.yml",
  "scripts/deploy.ts",
  "scripts/detect-changed-mcps.ts",
  "scripts/filter-deployable-mcps.ts",
  "package.json",
  "bun.lockb",
];

// Determine which MCPs have changes
async function getChangedMcps(): Promise<string[]> {
  const allMcps = getAllMcps();
  const changedFiles = await getChangedFiles();

  if (changedFiles.length === 0) {
    console.error(
      "No changed files detected or git diff failed, checking all MCPs",
    );
    return allMcps;
  }

  const changedMcps = new Set<string>();

  for (const file of changedFiles) {
    // Check if it's a global file that affects all MCPs
    const isGlobalFile = GLOBAL_FILES.some(
      (globalFile) => file === globalFile || file.startsWith(globalFile),
    );

    if (isGlobalFile) {
      console.error(
        `⚠️ Global file changed: ${file} - This will trigger deploy for ALL MCPs`,
      );
      return allMcps;
    }

    // Check if file is in an MCP directory
    for (const mcp of allMcps) {
      if (file.startsWith(`${mcp}/`)) {
        changedMcps.add(mcp);
      }
    }
  }

  return Array.from(changedMcps);
}

// Main execution
const changedMcps = await getChangedMcps();

// Output as JSON array for GitHub Actions
console.log(JSON.stringify(changedMcps));

// Also log to stderr for debugging (won't interfere with JSON output)
if (changedMcps.length > 0) {
  console.error(
    `\n✅ Detected ${changedMcps.length} changed MCP(s): ${changedMcps.join(", ")}`,
  );
} else {
  console.error("\n📭 No MCP changes detected");
}
