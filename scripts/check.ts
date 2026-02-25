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

async function checkMcp(
  name: string,
): Promise<{ name: string; ok: boolean; errors: string[] }> {
  const cwd = path.join(root, name);
  try {
    await $`tsc --noEmit`.cwd(cwd).quiet();
    return { name, ok: true, errors: [] };
  } catch (e) {
    const stderr =
      e && typeof e === "object" && "stderr" in e
        ? String((e as { stderr: unknown }).stderr)
        : "";
    const stdout =
      e && typeof e === "object" && "stdout" in e
        ? String((e as { stdout: unknown }).stdout)
        : "";
    const output = (stderr || stdout).trim();

    const lines = output.split("\n").filter((l) => l.includes("error TS"));

    const ownErrors = lines.filter(
      (l) => !l.includes("node_modules/") && !l.includes("../node_modules/"),
    );

    if (ownErrors.length === 0) {
      return { name, ok: true, errors: [] };
    }

    return { name, ok: false, errors: ownErrors };
  }
}

for (let i = 0; i < mcps.length; i += MAX_CONCURRENCY) {
  const batch = mcps.slice(i, i + MAX_CONCURRENCY);
  const results = await Promise.all(batch.map(checkMcp));

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
