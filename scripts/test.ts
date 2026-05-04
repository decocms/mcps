import { $, Glob } from "bun";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const MAX_CONCURRENCY = 4;
const root = path.resolve(import.meta.dirname, "..");

const args = process.argv.slice(2);
const onlyNames = new Set(args.filter((a) => !a.startsWith("--")));
const all = args.includes("--all");

const dirs = await readdir(root, { withFileTypes: true });

const candidateMcps = dirs
  .filter(
    (d) =>
      d.isDirectory() &&
      existsSync(path.join(root, d.name, "app.json")) &&
      existsSync(path.join(root, d.name, "tsconfig.json")),
  )
  .map((d) => d.name)
  .sort();

async function hasTests(mcp: string): Promise<boolean> {
  const cwd = path.join(root, mcp);
  const glob = new Glob("**/*.{test,spec}.{ts,tsx,js,jsx}");
  for await (const file of glob.scan({ cwd, onlyFiles: true })) {
    if (file.startsWith("node_modules/") || file.includes("/node_modules/")) {
      continue;
    }
    return true;
  }
  return false;
}

const selected =
  all || onlyNames.size === 0
    ? candidateMcps
    : candidateMcps.filter(
        (name) =>
          onlyNames.has(name) ||
          [...onlyNames].some((filter) => name.includes(filter)),
      );

const mcps: string[] = [];
for (const name of selected) {
  if (await hasTests(name)) mcps.push(name);
}

if (mcps.length === 0) {
  console.log("✅ No MCPs with tests to run");
  process.exit(0);
}

const label =
  all || onlyNames.size === 0 ? "" : ` [${[...onlyNames].join(", ")}]`;

console.log(
  `🧪 Testing ${mcps.length} MCPs (max ${MAX_CONCURRENCY} parallel)${label}\n`,
);

let passed = 0;
let failed = 0;
const failures: Array<{ name: string; output: string }> = [];

async function testMcp(
  name: string,
): Promise<{ name: string; ok: boolean; output: string }> {
  const cwd = path.join(root, name);
  try {
    await $`bun test`.cwd(cwd).quiet();
    return { name, ok: true, output: "" };
  } catch (e) {
    const stderr =
      e && typeof e === "object" && "stderr" in e
        ? String((e as { stderr: unknown }).stderr)
        : "";
    const stdout =
      e && typeof e === "object" && "stdout" in e
        ? String((e as { stdout: unknown }).stdout)
        : "";
    return { name, ok: false, output: (stderr || stdout).trim() };
  }
}

for (let i = 0; i < mcps.length; i += MAX_CONCURRENCY) {
  const batch = mcps.slice(i, i + MAX_CONCURRENCY);
  const results = await Promise.all(batch.map(testMcp));

  for (const { name, ok, output } of results) {
    if (ok) {
      passed++;
      console.log(`  ✅ ${name}`);
    } else {
      failed++;
      failures.push({ name, output });
      console.log(`  ❌ ${name}`);
    }
  }
}

console.log(
  `\n📊 Results: ${passed} passed, ${failed} failed out of ${mcps.length}`,
);

if (failures.length > 0) {
  console.log(`\n❌ Failed MCPs:\n`);
  for (const { name, output } of failures) {
    console.log(`  ${name}:`);
    console.log(
      output
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n"),
    );
    console.log();
  }
  process.exit(1);
}
