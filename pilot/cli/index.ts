#!/usr/bin/env bun
/**
 * Pilot CLI - Interactive Terminal Client
 *
 * A TUI client for the MCP Mesh that sends messages to Pilot via the event bus.
 * Similar to Codex or Claude Code but using the mesh event patterns.
 *
 * Usage:
 *   bun cli/index.ts
 *   # or with explicit config:
 *   MESH_URL=http://localhost:3000 MESH_TOKEN=xxx bun cli/index.ts
 */

import * as readline from "node:readline";
import { MeshEventClient } from "./mesh-client.ts";

// =============================================================================
// Configuration
// =============================================================================

const config = {
  meshUrl: process.env.MESH_URL || "http://localhost:3000",
  meshToken: process.env.MESH_TOKEN || "",
  debug: process.env.DEBUG === "true",
};

// =============================================================================
// ANSI Colors & Formatting
// =============================================================================

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",

  // Foreground
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  // Background
  bgBlack: "\x1b[40m",
  bgGreen: "\x1b[42m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
};

const c = {
  user: `${colors.bold}${colors.cyan}`,
  assistant: `${colors.bold}${colors.green}`,
  system: `${colors.dim}${colors.yellow}`,
  error: `${colors.bold}${colors.red}`,
  progress: `${colors.dim}${colors.magenta}`,
  reset: colors.reset,
};

// =============================================================================
// UI Helpers
// =============================================================================

function clearLine(): void {
  process.stdout.write("\r\x1b[K");
}

function printBanner(): void {
  console.log(`
${colors.bold}${colors.green}╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   ${colors.cyan}🚀 PILOT CLI${colors.green}                                           ║
║   ${colors.dim}${colors.white}Interactive AI Agent for MCP Mesh${colors.reset}${colors.bold}${colors.green}                      ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝${colors.reset}
`);
}

function printHelp(): void {
  console.log(`
${colors.bold}Commands:${colors.reset}
  ${colors.cyan}/help${colors.reset}      - Show this help
  ${colors.cyan}/new${colors.reset}       - Start new conversation thread
  ${colors.cyan}/status${colors.reset}    - Show connection status
  ${colors.cyan}/debug${colors.reset}     - Toggle debug mode
  ${colors.cyan}/quit${colors.reset}      - Exit

${colors.bold}Tips:${colors.reset}
  • Type your message and press Enter to send
  • Multi-line: end with \\ to continue on next line
  • Press Ctrl+C to cancel current operation
`);
}

function printStatus(client: MeshEventClient): void {
  console.log(`
${colors.bold}Status:${colors.reset}
  Mesh URL:  ${colors.cyan}${config.meshUrl}${colors.reset}
  Chat ID:   ${colors.cyan}${client.getChatId()}${colors.reset}
  Debug:     ${config.debug ? `${colors.green}ON` : `${colors.dim}OFF`}${colors.reset}
`);
}

function formatResponse(text: string): string {
  // Simple markdown-ish formatting
  return text
    .replace(/\*\*(.*?)\*\*/g, `${colors.bold}$1${colors.reset}`) // Bold
    .replace(/`([^`]+)`/g, `${colors.cyan}$1${colors.reset}`); // Inline code
}

// =============================================================================
// Spinner
// =============================================================================

class Spinner {
  private frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private current = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private message = "";

  start(msg: string): void {
    this.message = msg;
    this.current = 0;
    this.interval = setInterval(() => {
      clearLine();
      process.stdout.write(
        `${c.progress}${this.frames[this.current]} ${this.message}${c.reset}`,
      );
      this.current = (this.current + 1) % this.frames.length;
    }, 80);
  }

  update(msg: string): void {
    this.message = msg;
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      clearLine();
    }
  }
}

// =============================================================================
// Main CLI
// =============================================================================

async function main(): Promise<void> {
  // Validate config
  if (!config.meshToken) {
    console.error(`${c.error}Error: MESH_TOKEN not set${c.reset}`);
    console.error(`\nSet it via environment variable or .env file:`);
    console.error(`  export MESH_TOKEN=your-token-here`);
    process.exit(1);
  }

  printBanner();
  console.log(`${c.system}Connecting to ${config.meshUrl}...${c.reset}\n`);

  // Initialize mesh client
  const client = new MeshEventClient({
    url: config.meshUrl,
    token: config.meshToken,
  });

  try {
    await client.initialize();
  } catch (error) {
    console.error(`${c.error}Failed to connect to mesh:${c.reset}`, error);
    process.exit(1);
  }

  console.log(`${c.system}✓ Connected! Type /help for commands.${c.reset}\n`);

  // Setup readline
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${c.user}you ❯${c.reset} `,
    historySize: 100,
  });

  const spinner = new Spinner();
  let multiLineBuffer = "";

  // Handle input
  rl.on("line", async (input) => {
    const trimmed = input.trim();

    // Multi-line continuation
    if (input.endsWith("\\")) {
      multiLineBuffer += input.slice(0, -1) + "\n";
      process.stdout.write(`${colors.dim}...${colors.reset} `);
      return;
    }

    const fullInput = multiLineBuffer + trimmed;
    multiLineBuffer = "";

    // Empty input
    if (!fullInput) {
      rl.prompt();
      return;
    }

    // Commands
    if (fullInput.startsWith("/")) {
      const cmd = fullInput.slice(1).toLowerCase().split(" ")[0];

      switch (cmd) {
        case "help":
        case "h":
        case "?":
          printHelp();
          break;
        case "new":
        case "n":
          console.log(
            `${c.system}Starting new conversation thread...${c.reset}`,
          );
          // Would call NEW_THREAD tool here
          break;
        case "status":
        case "s":
          printStatus(client);
          break;
        case "debug":
        case "d":
          config.debug = !config.debug;
          console.log(
            `${c.system}Debug mode: ${config.debug ? "ON" : "OFF"}${c.reset}`,
          );
          break;
        case "quit":
        case "q":
        case "exit":
          console.log(`\n${c.system}Goodbye! 👋${c.reset}\n`);
          client.close();
          rl.close();
          process.exit(0);
          break;
        default:
          console.log(`${c.error}Unknown command: /${cmd}${c.reset}`);
          console.log(`Type ${c.cyan}/help${c.reset} for available commands.`);
      }

      rl.prompt();
      return;
    }

    // Send message to pilot
    console.log(); // Blank line before response
    spinner.start("Thinking...");

    try {
      // Try direct pilot call first (synchronous, better UX)
      const response = await client.callPilotDirectly(fullInput);

      spinner.stop();

      if (response) {
        console.log(
          `${c.assistant}pilot ❯${c.reset} ${formatResponse(response)}\n`,
        );
      } else {
        // Fallback to event bus (async)
        spinner.start("Publishing message...");
        await client.publishMessage(fullInput);
        spinner.stop();
        console.log(
          `${c.system}Message sent via event bus. Response will appear when ready.${c.reset}\n`,
        );
      }
    } catch (error) {
      spinner.stop();
      console.error(`${c.error}Error:${c.reset}`, error);
    }

    rl.prompt();
  });

  // Handle close
  rl.on("close", () => {
    console.log(`\n${c.system}Session ended.${c.reset}\n`);
    client.close();
    process.exit(0);
  });

  // Handle SIGINT (Ctrl+C)
  process.on("SIGINT", () => {
    spinner.stop();
    console.log(`\n${c.system}Interrupted. Type /quit to exit.${c.reset}\n`);
    rl.prompt();
  });

  // Start prompt
  rl.prompt();
}

// Run
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
