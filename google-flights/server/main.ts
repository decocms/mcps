/**
 * Google Flights MCP Server
 *
 * This MCP provides tools for searching flights, finding airports,
 * and calculating travel dates using Google Flights data.
 */
import { serve } from "@decocms/mcps-shared/serve";
import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import { z } from "zod";
import { tools } from "./tools/index.ts";

console.log("🛫 Google Flights MCP starting...");

const StateSchema = z.object({});

/**
 * Environment type for the MCP
 */
export type Env = DefaultEnv<typeof StateSchema>;

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    scopes: [],
    state: StateSchema,
  },
  tools,
  prompts: [],
});

const port = process.env.PORT || 8001;
serve(runtime.fetch);

const mcpUrl = `http://localhost:${port}/mcp`;
console.log(`🛫 Google Flights MCP running at ${mcpUrl}`);

// Copy MCP URL to clipboard on macOS
import { spawn } from "node:child_process";
const pbcopy = spawn("pbcopy");
pbcopy.stdin.write(mcpUrl);
pbcopy.stdin.end();
console.log("📋 MCP URL copied to clipboard!");
