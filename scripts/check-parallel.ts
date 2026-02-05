#!/usr/bin/env bun
/**
 * Parallel TypeScript check script for MCPs
 *
 * Runs `bun run check` in parallel for all MCPs, excluding legacy ones
 * that haven't been migrated to Zod v4 yet.
 */

import { $ } from "bun";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT_DIR = join(import.meta.dir, "..");

// MCPs to IGNORE (legacy - still using @decocms/runtime/mastra or Zod v3)
// These will be migrated in future PRs
const IGNORED_MCPS = [
  // Using shared (mastra) with Zod v3 - need shared-v2 migration
  "datajud",
  "gemini-pro-vision",
  "nanobanana",
  "pinecone",
  "readonly-sql",
  "reddit",
  "replicate",
  "sora",
  "veo",
  "whisper",
  // Using old runtime features
  "grain",
  // Has oauth.ts type errors - need runtime fix
  "blog-post-generator",
  "content-scraper",
  "discord-read",
  "github",
  "mcp-studio",
  "object-storage",
  "slack-mcp",
  "template-minimal",
  "deco-news-weekly-digest",
  // Has specific issues to fix
  "data-for-seo",
  "deco-llm",
  "hyperdx",
  "meta-ads",
  "registry",
];

async function getWorkspaces(): Promise<string[]> {
  const pkgPath = join(ROOT_DIR, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  return pkg.workspaces || [];
}

function hasCheckScript(workspace: string): boolean {
  try {
    const pkgPath = join(ROOT_DIR, workspace, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return pkg.scripts?.check !== undefined;
  } catch {
    return false;
  }
}

interface CheckResult {
  workspace: string;
  success: boolean;
  error?: string;
}

async function runCheck(workspace: string): Promise<CheckResult> {
  try {
    const cwd = join(ROOT_DIR, workspace);
    const proc = Bun.spawn(["bun", "run", "check"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      // Combine stdout and stderr, filter out the "$ tsc --noEmit" line
      const output = (stdout + stderr)
        .split("\n")
        .filter((line) => !line.startsWith("$") && line.trim() !== "")
        .join("\n")
        .trim();

      return {
        workspace,
        success: false,
        error: output || `Exit code: ${exitCode}`,
      };
    }
    return { workspace, success: true };
  } catch (error) {
    return {
      workspace,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runChecksInBatches(
  workspaces: string[],
  batchSize = 8,
): Promise<void> {
  const results: CheckResult[] = [];
  let completed = 0;
  const total = workspaces.length;

  console.log(`\n🔍 Running TypeScript checks on ${total} MCPs...\n`);

  for (let i = 0; i < workspaces.length; i += batchSize) {
    const batch = workspaces.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(runCheck));

    for (const result of batchResults) {
      completed++;
      const status = result.success ? "✅" : "❌";
      console.log(`[${completed}/${total}] ${status} ${result.workspace}`);
      results.push(result);
    }
  }

  // Summary
  const passed = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`✅ Passed: ${passed.length}`);
  console.log(`❌ Failed: ${failed.length}`);

  if (IGNORED_MCPS.length > 0) {
    console.log(`⏭️  Ignored (legacy): ${IGNORED_MCPS.length}`);
  }

  // Show detailed errors for failed
  if (failed.length > 0) {
    console.log("\n" + "=".repeat(60));
    console.log("DETAILED ERRORS BY WORKSPACE:");
    console.log("=".repeat(60) + "\n");

    for (const result of failed) {
      console.log(`📁 ${result.workspace}`);
      console.log("-".repeat(40));
      console.log(result.error);
      console.log("\n");
    }
    process.exit(1);
  } else {
    console.log("\n🎉 All checks passed!");
  }
}

async function main() {
  try {
    const workspaces = await getWorkspaces();

    // Filter: has check script AND not ignored
    const workspacesWithTS: string[] = workspaces.filter(
      (w) => hasCheckScript(w) && !IGNORED_MCPS.includes(w),
    );

    if (IGNORED_MCPS.length > 0) {
      console.log("⏭️  Ignoring legacy MCPs:", IGNORED_MCPS.join(", "));
    }

    await runChecksInBatches(workspacesWithTS);
  } catch (error) {
    console.log(
      `❌ Script error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

main();
