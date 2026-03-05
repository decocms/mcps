#!/usr/bin/env bun

/**
 * Script to create a new MCP app from the template
 *
 * Usage:
 *   bun scripts/new.ts <name> [options]
 *
 * Options:
 *   --description <desc>  Description for package.json
 */

import { parseArgs } from "util";
import { join } from "path";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";

interface CreateOptions {
  name: string;
  description?: string;
}

const TEMPLATES_DIR = join(import.meta.dir, "..");
const TEMPLATE_DIR = "template-minimal";

async function copyDirectory(src: string, dest: string, ignore: string[] = []) {
  await mkdir(dest, { recursive: true });

  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    // Skip ignored files/folders
    if (ignore.includes(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath, ignore);
    } else {
      const content = await readFile(srcPath);
      await writeFile(destPath, content);
    }
  }
}

async function createMCP(options: CreateOptions) {
  const { name, description } = options;

  const sourcePath = join(TEMPLATES_DIR, TEMPLATE_DIR);

  if (!existsSync(sourcePath)) {
    throw new Error(`Template '${TEMPLATE_DIR}' not found at ${sourcePath}`);
  }

  const destPath = join(TEMPLATES_DIR, name);

  if (existsSync(destPath)) {
    throw new Error(`Directory '${name}' already exists!`);
  }

  console.log(`Creating new MCP: ${name}`);
  console.log("");

  // Copy template
  console.log("Copying template files...");
  await copyDirectory(sourcePath, destPath, [
    "node_modules",
    "dist",
    "app.json",
  ]);

  // Customize files
  console.log("Customizing files...");

  // Update package.json
  const pkgPath = join(destPath, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  pkg.name = name;
  if (description) {
    pkg.description = description;
  } else {
    pkg.description = `${name} MCP server`;
  }
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");

  // Update README.md if it exists
  const readmePath = join(destPath, "README.md");
  if (existsSync(readmePath)) {
    await writeFile(
      readmePath,
      `# ${name}\n\n${description || "Your MCP server description goes here."}\n\n## Getting Started\n\n1. Configure your MCP in \`server/types/env.ts\`\n2. Implement tools in \`server/tools/\`\n3. Rename \`app.json.example\` to \`app.json\` and customize\n4. Add to \`deploy.json\` for deployment\n5. Test with \`bun run dev\`\n\nSee [template-minimal/README.md](../template-minimal/README.md) for detailed instructions.\n`,
      "utf-8",
    );
  }

  // Rename app.json.example to app.json if it exists
  const appJsonExamplePath = join(destPath, "app.json.example");
  const appJsonPath = join(destPath, "app.json");
  if (existsSync(appJsonExamplePath)) {
    const appJsonContent = await readFile(appJsonExamplePath, "utf-8");
    const appJson = JSON.parse(appJsonContent);

    // Update basic fields
    appJson.name = name;
    appJson.friendlyName = name
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    appJson.connection.url = `https://sites-${name}.decocache.com/mcp`;
    appJson.description = description || `${appJson.friendlyName} MCP server`;
    appJson.metadata.short_description = appJson.description;

    await writeFile(
      appJsonPath,
      JSON.stringify(appJson, null, 2) + "\n",
      "utf-8",
    );
    console.log("✓ Created app.json from template");
  }

  // Update root package.json workspaces
  const rootPkgPath = join(TEMPLATES_DIR, "package.json");
  const rootPkg = JSON.parse(await readFile(rootPkgPath, "utf-8"));

  if (!rootPkg.workspaces.includes(name)) {
    rootPkg.workspaces.push(name);
    rootPkg.workspaces.sort();
    await writeFile(
      rootPkgPath,
      JSON.stringify(rootPkg, null, 2) + "\n",
      "utf-8",
    );
    console.log("✓ Added to workspace");
  }

  console.log("");
  console.log("✅ MCP created successfully!");
  console.log("");
  console.log("Next steps:");
  console.log(`  cd ${name}`);
  console.log("  bun install");
  console.log("");
  console.log("Configuration:");
  console.log("  1. Edit server/types/env.ts (StateSchema)");
  console.log("  2. Edit app.json (metadata for store)");
  console.log("  3. Implement tools in server/tools/");
  console.log("");
  console.log("Development:");
  console.log("  bun run dev          # Start local server");
  console.log("  bun run fmt          # Format code");
  console.log("  bun run lint         # Lint code");
  console.log("");
  console.log("Deployment:");
  console.log("  - Add to deploy.json for auto-deployment");
  console.log("  - Create PR (never commit directly to main)");
  console.log("");
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      description: {
        type: "string",
        short: "d",
      },
      help: {
        type: "boolean",
        short: "h",
      },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    console.log(`
Usage: bun scripts/new.ts <name> [options]

Creates a new MCP app from the template

Arguments:
  name                   Name of the new MCP (required)

Options:
  -d, --description      Description for package.json
  -h, --help             Show this help message

Examples:
  bun scripts/new.ts my-mcp
  bun scripts/new.ts weather-api --description "Weather forecast API"
    `);
    process.exit(0);
  }

  const name = positionals[0];

  // Validate name
  if (!/^[a-z0-9-]+$/.test(name)) {
    console.error(
      "Error: Name must contain only lowercase letters, numbers, and hyphens",
    );
    process.exit(1);
  }

  try {
    await createMCP({
      name,
      description: values.description as string | undefined,
    });
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
