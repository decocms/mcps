#!/usr/bin/env bun
/**
 * WhatsApp MCP Development Server
 *
 * Starts the server on port 8003 with Deco Link tunnel and displays
 * a beautiful terminal message with the webhook URL.
 */

import { spawn } from "bun";

const PORT = 8003;

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  bgGreen: "\x1b[42m",
  bgCyan: "\x1b[46m",
};

const c = colors;

function printBanner() {
  console.log(`
${c.green}${c.bold}
  ╦ ╦┬ ┬┌─┐┌┬┐┌─┐╔═╗┌─┐┌─┐  ╔╦╗╔═╗╔═╗
  ║║║├─┤├─┤ │ └─┐╠═╣├─┘├─┘  ║║║║  ╠═╝
  ╚╩╝┴ ┴┴ ┴ ┴ └─┘╩ ╩┴  ┴    ╩ ╩╚═╝╩  
${c.reset}
`);
}

async function main() {
  console.log(`  ${c.dim}Starting server...${c.reset}\n`);

  // Start the bun server
  const serverProcess = spawn({
    cmd: ["bun", "run", "--hot", "server/main.ts"],
    env: { ...process.env, PORT: String(PORT) },
    cwd: import.meta.dir + "/..",
    stdout: "inherit",
    stderr: "inherit",
  });

  // Give the server a moment to start
  await Bun.sleep(1000);
  console.log(`  ${c.dim}Server started on port ${PORT}${c.reset}\n`);

  // Handle cleanup
  const cleanup = () => {
    console.log(`\n  ${c.dim}Shutting down...${c.reset}\n`);
    serverProcess.kill();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    printBanner();

    // Keep the process running
    await serverProcess.exited;
  } catch (error) {
    console.error(
      `\n  ${c.bold}${c.yellow}⚠${c.reset} ${error instanceof Error ? error.message : error}`,
    );
    console.log(
      `\n  ${c.dim}Make sure Deco CLI is installed! Run ${c.cyan}npm install -g deco-cli${c.reset}`,
    );
    cleanup();
  }
}

main().catch(console.error);
