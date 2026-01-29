#!/usr/bin/env bun
/**
 * MCP Gateway - Serve multiple MCPs through a single tunnel
 *
 * Routes are dynamically generated based on config:
 *   /mcp-fs        → local-fs MCP
 *   /mcp-blog      → blog MCP
 *   /mcp-bookmarks → bookmarks MCP
 *   etc.
 *
 * Usage:
 *   bun run gateway                    # Start with saved config
 *   bun run gateway:setup              # Interactive setup
 *   bun run gateway --fs --blog        # Override: specific MCPs
 *   bun run gateway --path /my/folder  # Override: set local-fs path
 */

import { spawn, type ChildProcess } from "node:child_process";
import { platform } from "node:os";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { loadConfig, AVAILABLE_MCPS, CONFIG_FILE } from "./setup.ts";

interface MCPConfig {
  name: string;
  path: string;
  port: number;
  route: string;
  enabled: boolean;
  process?: ChildProcess;
  args?: string[];
}

/**
 * Parse CLI arguments and merge with saved config
 * Returns null if no config exists (triggers setup wizard)
 */
function parseArgs(): {
  mcps: MCPConfig[];
  fsPath: string | null;
  gatewayPort: number;
} | null {
  const args = process.argv.slice(2);
  let fsPath: string | null = null;
  let explicitMcps = false;
  const enabledMcps: Record<string, boolean> = {};
  let gatewayPort = 8000;

  // Load saved config first
  const savedConfig = loadConfig();
  if (savedConfig) {
    gatewayPort = savedConfig.gatewayPort || 8000;
    fsPath = savedConfig.localFsPath || null;
    for (const mcpId of savedConfig.mcps) {
      enabledMcps[mcpId] = true;
    }
  }

  // Parse CLI args (override saved config)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--path" || arg === "-p") {
      fsPath = args[++i];
      continue;
    }

    if (arg === "--port") {
      gatewayPort = parseInt(args[++i], 10) || 8000;
      continue;
    }

    // Check for --mcpname flags
    if (arg.startsWith("--")) {
      const mcpId = arg.slice(2);
      const mcp = AVAILABLE_MCPS.find((m) => m.id === mcpId);
      if (mcp) {
        enabledMcps[mcpId] = true;
        explicitMcps = true;
        continue;
      }
    }

    // Positional arg could be fs path
    if (!arg.startsWith("-") && !fsPath) {
      fsPath = arg;
    }
  }

  // If CLI specified explicit MCPs, only use those (override saved)
  if (explicitMcps) {
    for (const mcp of AVAILABLE_MCPS) {
      if (!Object.prototype.hasOwnProperty.call(enabledMcps, mcp.id)) {
        enabledMcps[mcp.id] = false;
      }
    }
  }

  // If no config and no CLI args, return null to trigger setup
  if (!savedConfig && !explicitMcps) {
    return null;
  }

  // Find MCP directories
  const mcpsRoot = resolve(dirname(import.meta.dirname || process.cwd()), "..");

  // Build MCP configs from AVAILABLE_MCPS
  const mcps: MCPConfig[] = AVAILABLE_MCPS.map((mcp) => ({
    name: mcp.id,
    path: resolve(mcpsRoot, mcp.path),
    port: mcp.port,
    route: `/mcp-${mcp.id}`,
    enabled: enabledMcps[mcp.id] || false,
    args: mcp.id === "local-fs" && fsPath ? ["--path", fsPath] : [],
  }));

  return { mcps: mcps.filter((m) => m.enabled), fsPath, gatewayPort };
}

/**
 * Copy text to clipboard
 */
function copyToClipboard(text: string): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const os = platform();
    let cmd: string;
    let cmdArgs: string[];

    if (os === "darwin") {
      cmd = "pbcopy";
      cmdArgs = [];
    } else if (os === "win32") {
      cmd = "clip";
      cmdArgs = [];
    } else {
      cmd = "xclip";
      cmdArgs = ["-selection", "clipboard"];
    }

    try {
      const proc = spawn(cmd, cmdArgs, { stdio: ["pipe", "ignore", "ignore"] });
      proc.stdin?.write(text);
      proc.stdin?.end();
      proc.on("close", (code) => resolvePromise(code === 0));
      proc.on("error", () => resolvePromise(false));
    } catch {
      resolvePromise(false);
    }
  });
}

// Parse args or run setup wizard if no config
let config = parseArgs();

if (!config) {
  // No config found, run the setup wizard
  const { runSetup } = await import("./setup.ts");
  const savedConfig = await runSetup();

  if (!savedConfig || savedConfig.mcps.length === 0) {
    console.log("\n\x1b[90mNo MCPs selected. Exiting.\x1b[0m\n");
    process.exit(0);
  }

  // Re-parse after setup
  config = parseArgs();
  if (!config) {
    console.error("\n\x1b[31mSetup failed. Please try again.\x1b[0m\n");
    process.exit(1);
  }
}

const { mcps, fsPath, gatewayPort } = config;

// Validate fs path if provided
if (fsPath && !existsSync(fsPath)) {
  console.error(`\n❌ Path does not exist: ${fsPath}\n`);
  process.exit(1);
}

console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                      MCP Gateway - Multi-Serve                        ║
╠═══════════════════════════════════════════════════════════════════════╣`);

for (const mcp of mcps) {
  const extra = mcp.name === "local-fs" && fsPath ? ` (${fsPath})` : "";
  console.log(
    `║  🔌 ${mcp.name.padEnd(12)} → :${mcp.port} → ${mcp.route.padEnd(20)}${extra.slice(0, 15).padEnd(15)}║`,
  );
}

console.log(`╚═══════════════════════════════════════════════════════════════════════╝

Starting MCP servers...
`);

// Start each MCP server
for (const mcp of mcps) {
  if (!existsSync(mcp.path)) {
    console.log(`⚠️  Skipping ${mcp.name}: ${mcp.path} not found`);
    mcp.enabled = false;
    continue;
  }

  const args = ["run", "--hot", mcp.path, ...(mcp.args || [])];

  mcp.process = spawn("bun", args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: mcp.port.toString() },
  });

  mcp.process.stdout?.on("data", (data) => {
    const output = data.toString().trim();
    if (output && !output.includes("running at")) {
      console.log(`[${mcp.name}] ${output}`);
    }
  });

  mcp.process.stderr?.on("data", (data) => {
    const output = data.toString().trim();
    if (output) {
      console.error(`[${mcp.name}] ${output}`);
    }
  });

  // Handle MCP process crashes
  mcp.process.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[gateway] ⚠️ ${mcp.name} exited with code ${code}`);
    }
  });

  mcp.process.on("error", (err) => {
    console.error(`[gateway] ⚠️ ${mcp.name} error:`, err.message);
  });

  console.log(`✅ Started ${mcp.name} on port ${mcp.port}`);
}

// Wait for servers to start
await new Promise((r) => setTimeout(r, 2000));

// Create the gateway server that proxies to the appropriate MCP
const enabledMcps = mcps.filter((m) => m.enabled && m.process);

const server = Bun.serve({
  port: gatewayPort,
  idleTimeout: 255, // Max timeout for long MCP requests
  async fetch(req) {
    const url = new URL(req.url);

    // Find matching MCP
    for (const mcp of enabledMcps) {
      if (url.pathname.startsWith(mcp.route)) {
        let targetUrl: string;

        if (mcp.name === "local-fs" && mcp.args?.length) {
          // local-fs needs the path in the URL
          const fsPath = mcp.args[mcp.args.indexOf("--path") + 1];
          const subPath = url.pathname.slice(mcp.route.length) || "";
          targetUrl = `http://localhost:${mcp.port}/mcp${fsPath}${subPath}${url.search}`;
        } else {
          // Other MCPs: /mcp-blog/foo → /mcp/foo
          const newPath = url.pathname.replace(mcp.route, "/mcp");
          targetUrl = `http://localhost:${mcp.port}${newPath}${url.search}`;
        }

        try {
          // Clone headers and remove hop-by-hop headers
          const proxyHeaders = new Headers(req.headers);
          proxyHeaders.delete("host");
          proxyHeaders.delete("connection");

          const proxyReq = new Request(targetUrl, {
            method: req.method,
            headers: proxyHeaders,
            body: req.body,
            // @ts-ignore - Bun supports this
            duplex: "half",
          });

          const response = await fetch(proxyReq);

          // Clone response headers
          const responseHeaders = new Headers(response.headers);
          // Remove transfer-encoding as Bun handles this
          responseHeaders.delete("transfer-encoding");

          return new Response(response.body, {
            status: response.status,
            headers: responseHeaders,
          });
        } catch (error) {
          console.error(`[gateway] Proxy error for ${mcp.name}:`, error);
          return new Response(
            JSON.stringify({
              error: `Failed to proxy to ${mcp.name}: ${error}`,
            }),
            { status: 502, headers: { "Content-Type": "application/json" } },
          );
        }
      }
    }

    // Index page with available MCPs
    if (url.pathname === "/" || url.pathname === "") {
      const mcpList = enabledMcps
        .map((m) => `  - ${m.route} → ${m.name}`)
        .join("\n");

      return new Response(`MCP Gateway\n\nAvailable MCPs:\n${mcpList}\n`, {
        headers: { "Content-Type": "text/plain" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`\n🌐 Gateway running at http://localhost:${gatewayPort}`);
console.log(`\nLocal MCP URLs:`);
for (const mcp of enabledMcps) {
  console.log(`  - http://localhost:${gatewayPort}${mcp.route}`);
}

// Start deco link for the gateway
console.log(`\nStarting tunnel...`);

let publicUrl = "";

async function showUrls(tunnelUrl: string) {
  if (publicUrl) return;
  publicUrl = tunnelUrl;

  const urls = enabledMcps.map((m) => `${publicUrl}${m.route}`);

  console.log(`

╔═══════════════════════════════════════════════════════════════════════╗
║                       ✅ Gateway Ready!                               ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  Add these MCP URLs to your Deco Mesh:                                ║
║                                                                       ║`);

  for (const mcp of enabledMcps) {
    const mcpUrl = `${publicUrl}${mcp.route}`;
    console.log(`║  ${mcp.name.padEnd(12)} ${mcpUrl.padEnd(54)}║`);
  }

  console.log(`║                                                                       ║
║  Steps:                                                               ║
║  1. Open mesh-admin.decocms.com                                       ║
║  2. Go to Connections → Add Custom MCP                                ║
║  3. Paste any URL above                                               ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
`);

  // Copy first URL
  const copied = await copyToClipboard(urls[0]);
  if (copied) {
    console.log(`📋 Copied ${enabledMcps[0].name} URL to clipboard!`);
  }
}

function checkForTunnelUrl(output: string) {
  const urlMatch = output.match(/https:\/\/[^\s()"']+\.deco\.(site|host)/);
  if (urlMatch) {
    const url = urlMatch[0].replace(/[()]/g, "");
    showUrls(url);
  }
}

const decoLink = spawn("deco", ["link", "-p", gatewayPort.toString()], {
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

// Cleanup on exit
function cleanup() {
  for (const mcp of mcps) {
    mcp.process?.kill();
  }
  decoLink.kill();
  server.stop();
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// Prevent crashes from unhandled errors
process.on("uncaughtException", (error) => {
  console.error("[gateway] Uncaught exception:", error.message);
});

process.on("unhandledRejection", (reason) => {
  console.error("[gateway] Unhandled rejection:", reason);
});

decoLink.on("close", (code) => {
  cleanup();
});
