import { $ } from "bun";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const MAX_CONCURRENCY = 4;
const root = path.resolve(import.meta.dirname, "..");

const args = process.argv.slice(2);
const onlyNames = new Set(args.filter((a) => !a.startsWith("--")));
const all = args.includes("--all");

const dirs = await readdir(root, { withFileTypes: true });

const allMcps = dirs
  .filter(
    (d) =>
      d.isDirectory() &&
      existsSync(path.join(root, d.name, "app.json")) &&
      existsSync(path.join(root, d.name, "tsconfig.json")),
  )
  .map((d) => d.name)
  .sort();

let mcps: string[];

if (all || onlyNames.size === 0) {
  mcps = allMcps;
} else {
  mcps = allMcps.filter(
    (name) =>
      onlyNames.has(name) ||
      [...onlyNames].some((filter) => name.includes(filter)),
  );
}

if (mcps.length === 0) {
  console.log("✅ No MCPs to check");
  process.exit(0);
}

const label =
  all || onlyNames.size === 0 ? "" : ` [${[...onlyNames].join(", ")}]`;

console.log(
  `🔍 Checking ${mcps.length} MCPs (max ${MAX_CONCURRENCY} parallel)${label}\n`,
);

let passed = 0;
let failed = 0;
const failures: Array<{ name: string; errors: string[] }> = [];

function commandOutput(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }

  const stderr =
    "stderr" in error ? String((error as { stderr: unknown }).stderr) : "";
  const stdout =
    "stdout" in error ? String((error as { stdout: unknown }).stdout) : "";

  return (stderr || stdout).trim();
}

async function installMcpDeps(name: string): Promise<void> {
  await $`bun install --filter ./${name}`.cwd(root).quiet();
}

async function typecheckMcp(
  name: string,
): Promise<{ name: string; ok: boolean; errors: string[] }> {
  const cwd = path.join(root, name);

  try {
    await $`bunx tsc --noEmit`.cwd(cwd).quiet();
    return { name, ok: true, errors: [] };
  } catch (error) {
    const output = commandOutput(error);
    const ownErrors = output
      .split("\n")
      .filter(
        (line) =>
          line.includes("error TS") &&
          !line.includes("node_modules/") &&
          !line.includes("../node_modules/"),
      );

    if (ownErrors.length === 0) {
      return { name, ok: true, errors: [] };
    }

    return { name, ok: false, errors: ownErrors };
  }
}

const readyForTypecheck: string[] = [];

for (const name of mcps) {
  try {
    await installMcpDeps(name);
    readyForTypecheck.push(name);
  } catch (error) {
    failed++;
    const output = commandOutput(error);
    failures.push({
      name,
      errors: [output || `Dependency install failed for ${name}`],
    });
    console.log(`  ❌ ${name} (dependency install failed)`);
  }
}

for (let i = 0; i < readyForTypecheck.length; i += MAX_CONCURRENCY) {
  const batch = readyForTypecheck.slice(i, i + MAX_CONCURRENCY);
  const results = await Promise.all(batch.map(typecheckMcp));

  for (const { name, ok, errors } of results) {
    if (ok) {
      passed++;
      console.log(`  ✅ ${name}`);
    } else {
      failed++;
      failures.push({ name, errors });
      console.log(
        `  ❌ ${name} (${errors.length} error${errors.length > 1 ? "s" : ""})`,
      );
    }
  }
}

console.log(
  `\n📊 Results: ${passed} passed, ${failed} failed out of ${mcps.length}`,
);

if (failures.length > 0) {
  console.log(`\n❌ Failed MCPs:\n`);
  for (const { name, errors } of failures) {
    console.log(`  ${name}:`);
    for (const err of errors) {
      console.log(`    ${err}`);
    }
    console.log();
  }
  process.exit(1);
}
