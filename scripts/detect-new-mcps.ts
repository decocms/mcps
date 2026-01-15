#!/usr/bin/env bun

/**
 * Detects which MCPs are NEW (didn't exist in the previous commit)
 * Usage: bun run scripts/detect-new-mcps.ts [base-ref] [head-ref]
 * Outputs a JSON array of new MCP names
 */

import { $ } from "bun";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const baseRef = args[0] || "origin/main";
const headRef = args[1] || "HEAD";

// Check if a path is a valid MCP directory
function isValidMcp(fullPath: string, entry: string): boolean {
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
      "dist",
      "template-with-view",
      "template-minimal",
    ].includes(entry)
  )
    return false;

  const hasPackageJson = existsSync(join(fullPath, "package.json"));
  const hasAppJson = existsSync(join(fullPath, "app.json"));

  // Must have a package.json or app.json
  return hasPackageJson || hasAppJson;
}

// Get all MCPs in current HEAD
function getCurrentMcps(): string[] {
  const repoRoot = process.cwd();
  const entries = readdirSync(repoRoot);

  return entries.filter((entry) => {
    const fullPath = join(repoRoot, entry);
    return isValidMcp(fullPath, entry);
  });
}

// Get MCPs that existed in the base ref
async function getMcpsAtRef(ref: string): Promise<string[]> {
  try {
    // List directories at the given ref that have package.json or app.json
    const result = await $`git ls-tree --name-only ${ref}`.text();
    const entries = result.trim().split("\n").filter(Boolean);

    const mcps: string[] = [];

    for (const entry of entries) {
      // Skip special directories
      if (
        [
          ".git",
          ".github",
          "node_modules",
          "scripts",
          "shared",
          "dist",
          "template-with-view",
          "template-minimal",
        ].includes(entry)
      )
        continue;

      // Check if this entry has package.json or app.json in the base ref
      try {
        await $`git cat-file -e ${ref}:${entry}/package.json`.quiet();
        mcps.push(entry);
        continue;
      } catch {
        // No package.json, check for app.json
      }

      try {
        await $`git cat-file -e ${ref}:${entry}/app.json`.quiet();
        mcps.push(entry);
      } catch {
        // No app.json either, skip
      }
    }

    return mcps;
  } catch (error) {
    console.error(`Error getting MCPs at ref ${ref}:`, error);
    return [];
  }
}

// Determine which MCPs are new
async function getNewMcps(): Promise<string[]> {
  const currentMcps = getCurrentMcps();
  const previousMcps = await getMcpsAtRef(baseRef);

  // Find MCPs that exist now but didn't exist before
  const newMcps = currentMcps.filter((mcp) => !previousMcps.includes(mcp));

  return newMcps;
}

// Main execution
const newMcps = await getNewMcps();

// Output as JSON array for GitHub Actions
console.log(JSON.stringify(newMcps));

// Also log to stderr for debugging (won't interfere with JSON output)
if (newMcps.length > 0) {
  console.error(
    `\n🆕 Detected ${newMcps.length} new MCP(s): ${newMcps.join(", ")}`,
  );
} else {
  console.error("\n📭 No new MCPs detected");
}
