/**
 * Slides MCP - AI-Powered Presentation Builder
 *
 * This MCP provides tools and prompts for creating beautiful slide presentations
 * through natural conversation with an AI agent.
 *
 * ## Workflow
 *
 * ### Phase 1: Brand Setup (one-time)
 * Use SLIDES_SETUP_BRAND prompt to:
 * 1. Research brand identity
 * 2. Create design system (design-system.jsx, styles.css)
 * 3. Preview at /design.html
 * 4. Iterate until approved
 *
 * ### Phase 2: Create Presentations
 * Use SLIDES_NEW_DECK prompt to:
 * 1. Copy design system from template
 * 2. Create slides with content
 * 3. Preview and iterate
 * 4. Bundle for sharing
 *
 * ## Quick Start
 * Use SLIDES_QUICK_START for fast, simple presentations without brand setup.
 */
import type { Registry } from "@decocms/mcps-shared/registry";
import { type DefaultEnv, withRuntime } from "@decocms/runtime";
import { z } from "zod";
import { tools } from "./tools/index.ts";
import { prompts } from "./prompts.ts";
import { $ } from "bun";

const PORT = process.env.PORT || 8007;
const MCP_URL = `http://localhost:${PORT}/mcp`;

const StateSchema = z.object({});

/**
 * Environment type for the Slides MCP.
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;

const runtime = withRuntime<Env, typeof StateSchema>({
  configuration: {
    scopes: [],
    state: StateSchema,
  },
  tools,
  prompts,
});

// Start server
Bun.serve({
  idleTimeout: 0,
  port: PORT,
  hostname: "0.0.0.0",
  fetch: runtime.fetch,
  development: process.env.NODE_ENV !== "production",
});

// Log and copy to clipboard
console.log(`\n🎯 Slides MCP running at: ${MCP_URL}\n`);
await $`echo ${MCP_URL} | pbcopy`.quiet();
console.log(`📋 MCP URL copied to clipboard!\n`);
