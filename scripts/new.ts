#!/usr/bin/env bun

/**
 * Script to create a new MCP app from the template
 *
 * Usage:
 *   bun scripts/new.ts <name> [options]
 *
 * Options:
 *   --description <desc>     Description for package.json
 *   --template <template>    Template to use: "minimal" (default) or "mcp-app"
 */

import { parseArgs } from "util";
import { join } from "path";
import { mkdir, readdir, readFile, writeFile, rm } from "fs/promises";
import { existsSync } from "fs";
import { $ } from "bun";

type Template = "minimal" | "mcp-app";

interface CreateOptions {
  name: string;
  description?: string;
  template: Template;
}

const TEMPLATES_DIR = join(import.meta.dir, "..");
const TEMPLATE_DIR = "template-minimal";
const MCP_APP_TEMPLATE_REPO = "https://github.com/decocms/mcp-app.git";

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

function toFriendlyName(name: string): string {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

async function addToWorkspace(name: string): Promise<void> {
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
}

async function createMinimalMCP(options: CreateOptions): Promise<void> {
  const { name, description } = options;

  const sourcePath = join(TEMPLATES_DIR, TEMPLATE_DIR);

  if (!existsSync(sourcePath)) {
    throw new Error(`Template '${TEMPLATE_DIR}' not found at ${sourcePath}`);
  }

  const destPath = join(TEMPLATES_DIR, name);

  if (existsSync(destPath)) {
    throw new Error(`Directory '${name}' already exists!`);
  }

  console.log(`Creating new MCP: ${name} (template: minimal)`);
  console.log("");

  console.log("Copying template files...");
  await copyDirectory(sourcePath, destPath, [
    "node_modules",
    "dist",
    "app.json",
  ]);

  console.log("Customizing files...");

  const pkgPath = join(destPath, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  pkg.name = name;
  pkg.description = description || `${name} MCP server`;
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");

  const readmePath = join(destPath, "README.md");
  if (existsSync(readmePath)) {
    await writeFile(
      readmePath,
      `# ${name}\n\n${description || "Your MCP server description goes here."}\n\n## Getting Started\n\n1. Configure your MCP in \`server/types/env.ts\`\n2. Implement tools in \`server/tools/\`\n3. Rename \`app.json.example\` to \`app.json\` and customize\n4. Add to \`deploy.json\` for deployment\n5. Test with \`bun run dev\`\n\nSee [template-minimal/README.md](../template-minimal/README.md) for detailed instructions.\n`,
      "utf-8",
    );
  }

  const appJsonExamplePath = join(destPath, "app.json.example");
  const appJsonPath = join(destPath, "app.json");
  if (existsSync(appJsonExamplePath)) {
    const appJson = JSON.parse(await readFile(appJsonExamplePath, "utf-8"));
    const friendlyName = toFriendlyName(name);

    appJson.name = name;
    appJson.friendlyName = friendlyName;
    appJson.connection.url = `https://sites-${name}.decocache.com/mcp`;
    appJson.description = description || `${friendlyName} MCP server`;
    appJson.metadata.short_description = appJson.description;

    await writeFile(
      appJsonPath,
      JSON.stringify(appJson, null, 2) + "\n",
      "utf-8",
    );
    console.log("✓ Created app.json from template");
  }

  await addToWorkspace(name);

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

async function createMcpAppMCP(options: CreateOptions): Promise<void> {
  const { name, description } = options;
  const destPath = join(TEMPLATES_DIR, name);

  if (existsSync(destPath)) {
    throw new Error(`Directory '${name}' already exists!`);
  }

  console.log(`Creating new MCP App: ${name} (template: mcp-app)`);
  console.log("");

  console.log(`Cloning mcp-app template from GitHub...`);
  const tmpDir = join(TEMPLATES_DIR, `.tmp-mcp-app-${Date.now()}`);
  try {
    await $`git clone --depth=1 ${MCP_APP_TEMPLATE_REPO} ${tmpDir}`.quiet();
  } catch {
    throw new Error(
      `Failed to clone mcp-app template. Make sure you have internet access and git installed.`,
    );
  }

  console.log("Copying template files...");
  await copyDirectory(tmpDir, destPath, [
    "node_modules",
    "dist",
    ".git",
    ".github",
    ".claude",
    "AGENTS.md",
    "README.md",
  ]);
  await rm(tmpDir, { recursive: true, force: true });

  console.log("Customizing files...");
  const friendlyName = toFriendlyName(name);
  const desc = description || `${friendlyName} MCP App`;

  const pkgPath = join(destPath, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  pkg.name = name;
  pkg.description = desc;
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");

  const appJsonPath = join(destPath, "app.json");
  if (existsSync(appJsonPath)) {
    const appJson = JSON.parse(await readFile(appJsonPath, "utf-8"));
    appJson.name = name;
    appJson.friendlyName = friendlyName;
    appJson.description = desc;
    appJson.connection.url = `https://sites-${name}.decocache.com/api/mcp`;
    appJson.unlisted = true;
    if (appJson.metadata) {
      appJson.metadata.short_description = desc;
    }
    await writeFile(
      appJsonPath,
      JSON.stringify(appJson, null, 2) + "\n",
      "utf-8",
    );
    console.log("✓ Updated app.json");
  }

  await writeFile(
    join(destPath, "README.md"),
    `# ${name}\n\n${desc}\n\n## Getting Started\n\n\`\`\`bash\ncd ${name}\nbun install\nbun run dev\n\`\`\`\n\n## Structure\n\n- \`api/\` — MCP server (Bun + @decocms/runtime)\n- \`web/\` — React UI (Vite + TanStack Router + shadcn/ui)\n\n## Adding a New Tool\n\n1. Create \`api/tools/my-tool.ts\` using \`createTool\`\n2. Register in \`api/tools/index.ts\`\n3. Create \`web/tools/my-tool/index.tsx\` for the UI\n4. Create \`api/resources/my-tool.ts\` serving \`dist/client/my-tool.html\`\n5. Update build scripts in \`package.json\`\n`,
    "utf-8",
  );

  await addToWorkspace(name);

  console.log("");
  console.log("✅ MCP App created successfully!");
  console.log("");
  console.log("Next steps:");
  console.log(`  cd ${name}`);
  console.log("  bun install");
  console.log("  bun run dev");
  console.log("");
  console.log("Structure:");
  console.log("  api/           # MCP server");
  console.log("  web/           # React UI");
  console.log("  web/tools/     # One folder per tool UI");
  console.log("");
  console.log("Configuration:");
  console.log("  1. Edit api/types/env.ts (StateSchema)");
  console.log("  2. Edit app.json (metadata for store)");
  console.log("  3. Add tools in api/tools/");
  console.log("");
  console.log("Deployment:");
  console.log("  - Add to deploy.json for auto-deployment");
  console.log("  - Create PR (never commit directly to main)");
  console.log("");
}

async function createMCP(options: CreateOptions) {
  if (options.template === "mcp-app") {
    await createMcpAppMCP(options);
  } else {
    await createMinimalMCP(options);
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      description: {
        type: "string",
        short: "d",
      },
      template: {
        type: "string",
        short: "t",
        default: "minimal",
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

Creates a new MCP from a template

Arguments:
  name                   Name of the new MCP (required)

Options:
  -d, --description      Description for package.json
  -t, --template         Template to use: "minimal" (default) or "mcp-app"
  -h, --help             Show this help message

Templates:
  minimal    Basic MCP server (API only, no UI) — uses local template-minimal/
  mcp-app    Full MCP App with React UI — cloned from github.com/decocms/mcp-app

Examples:
  bun scripts/new.ts my-mcp
  bun scripts/new.ts weather-api --description "Weather forecast API"
  bun scripts/new.ts my-app --template mcp-app
  bun scripts/new.ts my-app -t mcp-app --description "My MCP App with UI"
    `);
    process.exit(0);
  }

  const name = positionals[0];

  if (!/^[a-z0-9-]+$/.test(name)) {
    console.error(
      "Error: Name must contain only lowercase letters, numbers, and hyphens",
    );
    process.exit(1);
  }

  const rawTemplate = values.template as string;
  if (rawTemplate !== "minimal" && rawTemplate !== "mcp-app") {
    console.error(
      `Error: Unknown template "${rawTemplate}". Valid options: minimal, mcp-app`,
    );
    process.exit(1);
  }

  try {
    await createMCP({
      name,
      description: values.description as string | undefined,
      template: rawTemplate,
    });
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
