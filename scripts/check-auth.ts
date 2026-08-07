#!/usr/bin/env bun

/**
 * Fails when an MCP serves its handler without authentication.
 *
 * A template is only a default — anyone can delete the wrapper it ships with.
 * This check is the part that actually enforces it:
 *
 *   1. every MCP entrypoint must wrap its handler in `withAuth(...)`;
 *   2. every tool must be built with `createPrivateTool` (plain `createTool`
 *      runs for anonymous callers).
 *
 * MCPs that predate this rule are listed in `auth-exemptions.json` with the
 * reason they are still open. That file is the remediation backlog: entries
 * are removed as MCPs are fixed, and nothing may be added to it without a
 * reviewer signing off.
 *
 * Usage:
 *   bun run scripts/check-auth.ts             # all MCPs
 *   bun run scripts/check-auth.ts slack-mcp   # a subset
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const EXEMPTIONS_FILE = path.join(root, "auth-exemptions.json");

/** Escape hatch for a single tool, e.g. a genuinely public health tool. */
const ALLOW_PUBLIC_MARKER = "deco-allow-public:";

interface Exemptions {
  $schema?: string;
  $comment?: string;
  mcps: Record<string, { reason: string }>;
}

interface Violation {
  mcp: string;
  file: string;
  message: string;
}

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const onlyNames = new Set(args);

async function listMcps(): Promise<string[]> {
  const dirs = await readdir(root, { withFileTypes: true });
  return dirs
    .filter(
      (d) => d.isDirectory() && existsSync(path.join(root, d.name, "app.json")),
    )
    .map((d) => d.name)
    .filter((name) => onlyNames.size === 0 || onlyNames.has(name))
    .sort();
}

/** Collects .ts sources of an MCP, skipping build output and dependencies. */
async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const skip = new Set(["node_modules", "dist", ".wrangler", ".deco", ".vite"]);

  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) {
          await walk(full);
        }
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
        out.push(full);
      }
    }
  }

  await walk(dir);
  return out;
}

/**
 * Blanks out comments and string literals, keeping every newline so line
 * numbers still line up with the original file.
 *
 * Without this the checks match their own documentation: the reference wiring
 * in `template-minimal/server/main.ts` mentions `withAuth(` inside a comment,
 * which would let a file that deleted the real call pass.
 */
function maskNonCode(source: string): string {
  const out = source.split("");
  let state: "code" | "line" | "block" | "'" | '"' | "`" = "code";

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];

    if (state === "code") {
      if (char === "/" && next === "/") {
        state = "line";
        out[i] = " ";
      } else if (char === "/" && next === "*") {
        state = "block";
        out[i] = " ";
      } else if (char === "'" || char === '"' || char === "`") {
        state = char;
      }
      continue;
    }

    if (state === "line") {
      if (char === "\n") {
        state = "code";
      } else {
        out[i] = " ";
      }
      continue;
    }

    if (state === "block") {
      if (char === "*" && next === "/") {
        out[i] = " ";
        out[i + 1] = " ";
        i++;
        state = "code";
      } else if (char !== "\n") {
        out[i] = " ";
      }
      continue;
    }

    // Inside a string literal.
    if (char === "\\") {
      out[i] = " ";
      if (next !== undefined && next !== "\n") {
        out[i + 1] = " ";
        i++;
      }
      continue;
    }
    if (char === state) {
      state = "code";
    } else if (char !== "\n") {
      out[i] = " ";
    }
  }

  return out.join("");
}

/**
 * Entrypoints are the files that hand a fetch handler to a server. Matching on
 * the call rather than on a filename keeps this honest for MCPs that do not
 * follow the `server/main.ts` convention.
 */
function isEntrypoint(source: string): boolean {
  return (
    /\bserve\s*\(/.test(source) ||
    /Bun\.serve\s*\(/.test(source) ||
    /export\s+default\s*{[^}]*\bfetch\b/.test(source)
  );
}

function hasAuth(source: string): boolean {
  return /\bwithAuth\s*\(/.test(source);
}

/**
 * Finds `createTool(` calls that are not `createPrivateTool(` and are not
 * preceded by an explicit `deco-allow-public:` justification.
 *
 * Detection runs on the masked source so comments and strings cannot trigger
 * it; the justification is looked up in the original text, where it lives as
 * a comment.
 */
function publicToolLines(source: string, masked: string): number[] {
  const originalLines = source.split("\n");
  const hits: number[] = [];

  masked.split("\n").forEach((line, index) => {
    if (!/(?<!Private)\bcreateTool\s*\(/.test(line)) {
      return;
    }
    // Look back a few lines for the justification comment.
    const context = originalLines
      .slice(Math.max(0, index - 3), index + 1)
      .join("\n");
    if (context.includes(ALLOW_PUBLIC_MARKER)) {
      return;
    }
    hits.push(index + 1);
  });

  return hits;
}

async function loadExemptions(): Promise<Exemptions> {
  if (!existsSync(EXEMPTIONS_FILE)) {
    return { mcps: {} };
  }
  return JSON.parse(await readFile(EXEMPTIONS_FILE, "utf-8")) as Exemptions;
}

async function main() {
  const exemptions = await loadExemptions();
  const mcps = await listMcps();
  const violations: Violation[] = [];
  const exempted: string[] = [];

  for (const mcp of mcps) {
    if (exemptions.mcps[mcp]) {
      exempted.push(mcp);
      continue;
    }

    const dir = path.join(root, mcp);
    const files = await sourceFiles(dir);
    let foundEntrypoint = false;

    for (const file of files) {
      const source = await readFile(file, "utf-8");
      const masked = maskNonCode(source);
      const rel = path.relative(root, file);

      if (isEntrypoint(masked)) {
        foundEntrypoint = true;
        if (!hasAuth(masked)) {
          violations.push({
            mcp,
            file: rel,
            message:
              "serves a handler without withAuth() — this endpoint is public",
          });
        }
      }

      for (const line of publicToolLines(source, masked)) {
        violations.push({
          mcp,
          file: `${rel}:${line}`,
          message:
            "createTool() runs for anonymous callers — use createPrivateTool()," +
            ` or justify with a "${ALLOW_PUBLIC_MARKER} <reason>" comment`,
        });
      }
    }

    if (!foundEntrypoint) {
      // Proxy-only entries in the registry (official external servers) have no
      // server of their own; nothing to protect here.
      continue;
    }
  }

  console.log(
    `🔐 Auth check: ${mcps.length} MCPs (${exempted.length} exempted)\n`,
  );

  if (violations.length > 0) {
    const byMcp = new Map<string, Violation[]>();
    for (const v of violations) {
      byMcp.set(v.mcp, [...(byMcp.get(v.mcp) ?? []), v]);
    }

    for (const [mcp, items] of byMcp) {
      console.error(`❌ ${mcp}`);
      for (const item of items) {
        console.error(`   ${item.file}\n     ${item.message}`);
      }
      console.error("");
    }

    console.error(
      `${violations.length} violation(s).\n\n` +
        `Fix by wrapping the handler:\n` +
        `  import { withAuth } from "@decocms/mcps-shared/auth";\n` +
        `  serve(withAuth(runtime.fetch));\n\n` +
        `See template-minimal/server/main.ts for the reference wiring.`,
    );
    process.exit(1);
  }

  console.log("✅ All checked MCPs authenticate their transport");

  if (exempted.length > 0) {
    console.log(
      `\nℹ️  Exempted (pending remediation): ${exempted.join(", ")}\n` +
        `   Tracked in auth-exemptions.json.`,
    );
  }
}

main();
