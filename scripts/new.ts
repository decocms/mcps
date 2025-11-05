#!/usr/bin/env bun

/**
 * Script to create a new MCP app from templates
 * 
 * Usage:
 *   bun scripts/new.ts <name> [options]
 * 
 * Options:
 *   --template <type>     Template type: minimal, with-view (default: with-view)
 *   --no-view            Remove view/frontend code (API only)
 *   --description <desc>  Description for package.json
 */

import { parseArgs } from "util";
import { join, dirname } from "path";
import { mkdir, readdir, stat, readFile, writeFile, rm } from "fs/promises";
import { existsSync } from "fs";

type TemplateType = "minimal" | "with-view";

interface CreateOptions {
  name: string;
  template: TemplateType;
  noView: boolean;
  description?: string;
}

const TEMPLATES_DIR = join(import.meta.dir, "..");
const TEMPLATE_MAP: Record<TemplateType, string> = {
  "with-view": "template-with-view",
  "minimal": "template-minimal", // Will create this template
};

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

async function replaceInFile(
  filePath: string,
  replacements: Record<string, string>
) {
  let content = await readFile(filePath, "utf-8");
  
  for (const [search, replace] of Object.entries(replacements)) {
    content = content.replaceAll(search, replace);
  }
  
  await writeFile(filePath, content, "utf-8");
}

async function removeDirectory(path: string) {
  if (existsSync(path)) {
    await rm(path, { recursive: true, force: true });
  }
}

async function createMinimalTemplate() {
  const minimalPath = join(TEMPLATES_DIR, "template-minimal");
  
  if (existsSync(minimalPath)) {
    return; // Already exists
  }
  
  console.log("Creating minimal template...");
  
  // Copy from with-view template
  const withViewPath = join(TEMPLATES_DIR, "template-with-view");
  await copyDirectory(withViewPath, minimalPath, ["node_modules", "dist"]);
  
  // Remove view-related files
  await removeDirectory(join(minimalPath, "view"));
  await removeDirectory(join(minimalPath, "public"));
  await rm(join(minimalPath, "index.html"), { force: true });
  await rm(join(minimalPath, "vite.config.ts"), { force: true });
  
  // Update package.json
  const pkgPath = join(minimalPath, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  
  // Remove view-related dependencies
  const viewDeps = [
    "@radix-ui/react-collapsible",
    "@radix-ui/react-popover",
    "@radix-ui/react-slot",
    "@tailwindcss/vite",
    "@tanstack/react-query",
    "@tanstack/react-router",
    "@tanstack/react-router-devtools",
    "class-variance-authority",
    "clsx",
    "lucide-react",
    "next-themes",
    "react",
    "react-dom",
    "sonner",
    "tailwind-merge",
    "tailwindcss",
    "tailwindcss-animate",
  ];
  
  const viewDevDeps = [
    "@cloudflare/vite-plugin",
    "@types/react",
    "@types/react-dom",
    "@vitejs/plugin-react",
    "vite",
    "concurrently",
  ];
  
  viewDeps.forEach(dep => delete pkg.dependencies?.[dep]);
  viewDevDeps.forEach(dep => delete pkg.devDependencies?.[dep]);
  
  // Update scripts
  pkg.scripts = {
    dev: "deco dev",
    configure: "deco configure",
    gen: "deco gen --output=shared/deco.gen.ts",
    deploy: "deco deploy ./server",
  };
  
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  
  // Update wrangler.toml
  const wranglerPath = join(minimalPath, "wrangler.toml");
  let wranglerContent = await readFile(wranglerPath, "utf-8");
  
  // Remove assets section
  wranglerContent = wranglerContent.replace(/\[assets\][^[]*/, "");
  
  await writeFile(wranglerPath, wranglerContent, "utf-8");
  
  console.log("✓ Minimal template created");
}

async function createMCP(options: CreateOptions) {
  const { name, template, noView, description } = options;
  
  // Ensure templates exist
  if (template === "minimal" || noView) {
    await createMinimalTemplate();
  }
  
  // Determine source template
  const sourceTemplate = noView ? "template-minimal" : TEMPLATE_MAP[template];
  const sourcePath = join(TEMPLATES_DIR, sourceTemplate);
  
  if (!existsSync(sourcePath)) {
    throw new Error(`Template '${sourceTemplate}' not found at ${sourcePath}`);
  }
  
  const destPath = join(TEMPLATES_DIR, name);
  
  if (existsSync(destPath)) {
    throw new Error(`Directory '${name}' already exists!`);
  }
  
  console.log(`Creating new MCP: ${name}`);
  console.log(`Template: ${template}${noView ? " (no view)" : ""}`);
  console.log("");
  
  // Copy template
  console.log("Copying template files...");
  await copyDirectory(sourcePath, destPath, ["node_modules", "dist"]);
  
  // Get the original template name from source
  const sourcePkg = JSON.parse(
    await readFile(join(sourcePath, "package.json"), "utf-8")
  );
  const originalName = sourcePkg.name;
  
  // Customize files
  console.log("Customizing files...");
  
  const replacements: Record<string, string> = {
    [originalName]: name,
    "Object Storage MCP": description || `${name} MCP`,
    "object-storage": name,
  };
  
  // Update package.json
  const pkgPath = join(destPath, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  pkg.name = name;
  if (description) {
    pkg.description = description;
  }
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
  
  // Update wrangler.toml
  const wranglerPath = join(destPath, "wrangler.toml");
  if (existsSync(wranglerPath)) {
    await replaceInFile(wranglerPath, replacements);
  }
  
  // Update README.md
  const readmePath = join(destPath, "README.md");
  if (existsSync(readmePath)) {
    await writeFile(
      readmePath,
      `# ${description || name}\n\nYour MCP server description goes here.\n`,
      "utf-8"
    );
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
      "utf-8"
    );
    console.log("✓ Added to workspace");
  }
  
  console.log("");
  console.log("✅ MCP created successfully!");
  console.log("");
  console.log("Next steps:");
  console.log(`  cd ${name}`);
  console.log("  bun install");
  console.log("  bun run dev");
  console.log("");
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      template: {
        type: "string",
        short: "t",
        default: "with-view",
      },
      "no-view": {
        type: "boolean",
        default: false,
      },
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

Creates a new MCP app from a template

Arguments:
  name                   Name of the new MCP (required)

Options:
  -t, --template <type>  Template type: minimal, with-view (default: with-view)
  --no-view              Remove view/frontend code (API only)
  -d, --description      Description for package.json
  -h, --help             Show this help message

Examples:
  bun scripts/new.ts my-mcp
  bun scripts/new.ts my-api --no-view
  bun scripts/new.ts my-mcp --template minimal
  bun scripts/new.ts weather-api --no-view --description "Weather API MCP"
    `);
    process.exit(0);
  }
  
  const name = positionals[0];
  const template = values.template as TemplateType;
  
  if (!["minimal", "with-view"].includes(template)) {
    console.error(`Error: Invalid template '${template}'. Use 'minimal' or 'with-view'`);
    process.exit(1);
  }
  
  // Validate name
  if (!/^[a-z0-9-]+$/.test(name)) {
    console.error("Error: Name must contain only lowercase letters, numbers, and hyphens");
    process.exit(1);
  }
  
  try {
    await createMCP({
      name,
      template,
      noView: values["no-view"] as boolean,
      description: values.description as string | undefined,
    });
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();

