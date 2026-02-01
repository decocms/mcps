#!/usr/bin/env bun
/**
 * MCP Local FS - Serve & Link
 *
 * Exposes the current directory (or specified path) via deco link
 * and provides a ready-to-add MCP URL for mesh.
 *
 * Usage:
 *   bunx @decocms/mcp-local-fs serve              # Current directory
 *   bunx @decocms/mcp-local-fs serve /my/folder   # Specific folder
 *   bunx @decocms/mcp-local-fs serve --port 8080  # Custom port
 */

import { spawn } from "node:child_process";
import { platform } from "node:os";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

const PORT = parseInt(process.env.PORT || "3456", 10);

/**
 * Parse CLI arguments
 */
function parseArgs(): { path: string; port: number } {
  const args = process.argv.slice(2);
  let path = process.cwd();
  let port = PORT;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Skip "serve" command itself
    if (arg === "serve") continue;

    // Port flag
    if (arg === "--port" || arg === "-p") {
      const p = parseInt(args[++i], 10);
      if (!isNaN(p)) port = p;
      continue;
    }

    // Skip other flags
    if (arg.startsWith("-")) continue;

    // Positional argument = path
    path = resolve(arg);
  }

  return { path, port };
}

/**
 * Copy text to clipboard
 */
function copyToClipboard(text: string): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const os = platform();
    let cmd: string;
    let args: string[];

    if (os === "darwin") {
      cmd = "pbcopy";
      args = [];
    } else if (os === "win32") {
      cmd = "clip";
      args = [];
    } else {
      cmd = "xclip";
      args = ["-selection", "clipboard"];
    }

    try {
      const proc = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
      proc.stdin?.write(text);
      proc.stdin?.end();
      proc.on("close", (code) => resolvePromise(code === 0));
      proc.on("error", () => resolvePromise(false));
    } catch {
      resolvePromise(false);
    }
  });
}

const { path, port } = parseArgs();

// Validate path exists
if (!existsSync(path)) {
  console.error(`\n❌ Path does not exist: ${path}\n`);
  process.exit(1);
}

// URL-encode the path for the MCP endpoint
const encodedPath = encodeURIComponent(path);

// Track if we've shown the URL already
let publicUrl = "";

/**
 * Show the MCP URL banner when we detect the tunnel URL
 */
async function showMcpUrl(tunnelUrl: string) {
  if (publicUrl) return; // Already shown
  publicUrl = tunnelUrl;

  // Build the full MCP URL with path
  const mcpUrl = `${publicUrl}/mcp?path=${encodedPath}`;

  const copied = await copyToClipboard(mcpUrl);

  console.log(`

╔══════════════════════════════════════════════════════════════════════════════════════════════════╗
║                                      ✅ Ready to Use!                                            ║
╠══════════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                                  ║
║  Add this MCP URL to your Deco Mesh:                                                             ║
║                                                                                                  ║
║  ${mcpUrl}
║                                                                                                  ║
║  ${copied ? "📋 Copied to clipboard!" : "Copy the URL above"}                                                                              ║
║                                                                                                  ║
║  Steps:                                                                                          ║
║  1. Open mesh-admin.decocms.com                                                                  ║
║  2. Go to Connections → Add Custom MCP                                                           ║
║  3. Paste the URL above                                                                          ║
║                                                                                                  ║
╚══════════════════════════════════════════════════════════════════════════════════════════════════╝
`);
}

/**
 * Check output for tunnel URL
 */
function checkForTunnelUrl(output: string) {
  // Match URLs like https://localhost-xxx.deco.host or https://xxx.deco.site
  const urlMatch = output.match(/https:\/\/[^\s()"']+\.deco\.(site|host)/);
  if (urlMatch) {
    const url = urlMatch[0].replace(/[()]/g, "");
    showMcpUrl(url);
  }
}

console.log(`
╔════════════════════════════════════════════════════════════╗
║              MCP Local FS - Serve & Link                   ║
╠════════════════════════════════════════════════════════════╣
║  📁 Serving: ${path.slice(0, 43).padEnd(43)}║
║  🔌 Port: ${port.toString().padEnd(47)}║
║                                                            ║
║  ⚠️  Note: Only ONE deco link tunnel per machine.          ║
║      Stop other 'serve' commands first.                    ║
╚════════════════════════════════════════════════════════════╝

Starting server and tunnel...
`);

// Get the directory of this script to find http.ts
const scriptDir = import.meta.dirname || resolve(process.cwd(), "server");
const httpScript = resolve(scriptDir, "http.ts");

// Start the HTTP server in background
const serverProcess = spawn(
  "bun",
  ["run", httpScript, "--port", port.toString(), "--path", path],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: port.toString() },
  },
);

serverProcess.stderr?.on("data", (data) => {
  const output = data.toString().trim();
  if (output && !output.includes("MCP Local FS")) {
    console.error(`[server] ${output}`);
  }
});

// Wait for server to start
await new Promise((r) => setTimeout(r, 1500));

// Run deco link to get the public URL
const decoLink = spawn("deco", ["link", "-p", port.toString()], {
  stdio: ["inherit", "pipe", "pipe"],
});

decoLink.stdout?.on("data", (data) => {
  const output = data.toString();
  process.stdout.write(output);
  checkForTunnelUrl(output);
});

decoLink.stderr?.on("data", (data) => {
  const output = data.toString();
  process.stderr.write(output);
  checkForTunnelUrl(output);
});

// Handle exit
process.on("SIGINT", () => {
  serverProcess.kill();
  decoLink.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  serverProcess.kill();
  decoLink.kill();
  process.exit(0);
});

// Wait for deco link to exit
decoLink.on("close", (code) => {
  serverProcess.kill();
  process.exit(code || 0);
});
