#!/usr/bin/env bun
/**
 * Optimized TypeScript check script
 * Runs checks in parallel with concurrency limit to avoid overwhelming the system
 */

import { $ } from "bun";
import { join } from "node:path";

const MAX_CONCURRENT = 8; // Run 4 checks at a time
const ROOT_DIR = import.meta.dir.replace("/scripts", "");

async function getWorkspaces(): Promise<string[]> {
  const pkg = await Bun.file(join(ROOT_DIR, "package.json")).json();
  return pkg.workspaces || [];
}

async function hasTypeScriptConfig(dir: string): Promise<boolean> {
  const tsConfigPath = join(ROOT_DIR, dir, "tsconfig.json");
  const file = Bun.file(tsConfigPath);
  return await file.exists();
}

async function runCheck(workspace: string): Promise<{
  workspace: string;
  success: boolean;
  error?: string;
}> {
  try {
    const cwd = join(ROOT_DIR, workspace);
    await $`cd ${cwd} && bun run check`.quiet();
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
  concurrency: number,
): Promise<void> {
  const results: Array<{
    workspace: string;
    success: boolean;
    error?: string;
  }> = [];
  let completed = 0;

  console.log(
    `🔍 Running TypeScript checks on ${workspaces.length} workspaces (${concurrency} concurrent)...\n`,
  );

  // Process workspaces in batches
  for (let i = 0; i < workspaces.length; i += concurrency) {
    const batch = workspaces.slice(i, i + concurrency);
    const batchPromises = batch.map((ws) => runCheck(ws));

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    completed += batch.length;
    const progress = Math.round((completed / workspaces.length) * 100);
    console.log(`Progress: ${completed}/${workspaces.length} (${progress}%)`);
  }

  // Print results
  console.log("\n" + "=".repeat(60));
  const failed = results.filter((r) => !r.success);
  const passed = results.filter((r) => r.success);

  console.log(`✅ Passed: ${passed.length}`);
  console.log(`❌ Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailed workspaces:");
    for (const result of failed) {
      console.log(`  - ${result.workspace}`);
    }
    process.exit(1);
  } else {
    console.log("\n🎉 All checks passed!");
  }
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const changedOnly = args.includes("--changed");

  let workspaces = await getWorkspaces();

  // Filter to only workspaces with tsconfig.json
  const workspacesWithTS = [];
  for (const ws of workspaces) {
    if (await hasTypeScriptConfig(ws)) {
      workspacesWithTS.push(ws);
    }
  }

  if (changedOnly) {
    // Get changed files
    try {
      const output = await $`git diff --name-only origin/main...HEAD`.text();
      const changedFiles = output.trim().split("\n");
      const changedWorkspaces = new Set<string>();

      for (const file of changedFiles) {
        const ws = workspacesWithTS.find((w) => file.startsWith(`${w}/`));
        if (ws) {
          changedWorkspaces.add(ws);
        }
      }

      if (changedWorkspaces.size === 0) {
        console.log("No changed workspaces found. Checking all...");
      } else {
        workspacesWithTS.length = 0;
        workspacesWithTS.push(...changedWorkspaces);
        console.log(
          `Checking ${changedWorkspaces.size} changed workspaces only\n`,
        );
      }
    } catch (error) {
      console.log(
        "Could not detect changed files. Checking all workspaces...\n",
      );
    }
  }

  await runChecksInBatches(workspacesWithTS, MAX_CONCURRENT);
}

main();
