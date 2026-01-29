#!/usr/bin/env bun
/**
 * Blog MCP - Serve & Link
 *
 * Starts the blog MCP and exposes it via deco link with a ready-to-add URL.
 *
 * Usage:
 *   bun run serve           # Start and expose via tunnel
 *   bun run serve --port 8080  # Custom port
 */

import { spawn } from "node:child_process";
import { platform } from "node:os";
import { resolve } from "node:path";

const DEFAULT_PORT = 8010;

/**
 * Parse CLI arguments
 */
function parseArgs(): { port: number } {
  const args = process.argv.slice(2);
  let port = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "serve") continue;

    if (arg === "--port" || arg === "-p") {
      const p = parseInt(args[++i], 10);
      if (!isNaN(p)) port = p;
      continue;
    }
  }

  return { port };
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

const { port } = parseArgs();

let publicUrl = "";

/**
 * Show the MCP URL banner when we detect the tunnel URL
 */
async function showMcpUrl(tunnelUrl: string) {
  if (publicUrl) return;
  publicUrl = tunnelUrl;

  const mcpUrl = `${publicUrl}/mcp`;

  const copied = await copyToClipboard(mcpUrl);

  console.log(`

╔═══════════════════════════════════════════════════════════════════════╗
║                         ✅ Blog MCP Ready!                            ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  Add this MCP URL to your Deco Mesh:                                  ║
║                                                                       ║
║  ${mcpUrl.padEnd(67)}║
║                                                                       ║
║  ${copied ? "📋 Copied to clipboard!" : "Copy the URL above"}                                                  ║
║                                                                       ║
║  Steps:                                                               ║
║  1. Open mesh-admin.decocms.com                                       ║
║  2. Go to Connections → Add Custom MCP                                ║
║  3. Paste the URL above                                               ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
`);
}

/**
 * Check output for tunnel URL
 */
function checkForTunnelUrl(output: string) {
  const urlMatch = output.match(/https:\/\/[^\s()"']+\.deco\.(site|host)/);
  if (urlMatch) {
    const url = urlMatch[0].replace(/[()]/g, "");
    showMcpUrl(url);
  }
}

console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                    Blog MCP - Serve & Link                            ║
╠═══════════════════════════════════════════════════════════════════════╣
║  🔌 Port: ${port.toString().padEnd(61)}║
║                                                                       ║
║  ⚠️  Note: Only ONE deco link tunnel can run at a time per machine.   ║
║      Stop other 'serve' commands before starting this one.            ║
╚═══════════════════════════════════════════════════════════════════════╝

Starting server and tunnel...
`);

// Get the directory of this script to find main.ts
const scriptDir = import.meta.dirname || resolve(process.cwd(), "server");
const mainScript = resolve(scriptDir, "main.ts");

// Start the MCP server in background
const serverProcess = spawn("bun", ["run", "--hot", mainScript], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: port.toString() },
});

serverProcess.stdout?.on("data", (data) => {
  process.stdout.write(data);
});

serverProcess.stderr?.on("data", (data) => {
  process.stderr.write(data);
});

// Wait for server to start
await new Promise((r) => setTimeout(r, 2000));

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

decoLink.on("close", (code) => {
  serverProcess.kill();
  process.exit(code || 0);
});
