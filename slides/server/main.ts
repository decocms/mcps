/**
 * Slides MCP - AI-Powered Presentation Builder
 *
 * Create beautiful, animated slide decks through natural conversation.
 *
 * ## Features
 *
 * - **Brand-Aware Design Systems** - Create reusable design systems with brand colors, typography, and logos
 * - **Multiple Slide Layouts** - Title, content, stats, two-column, list, quote, image, and custom
 * - **Brand MCP Integration** - Connect to Brand MCP for automatic brand discovery
 * - **MCP Apps UI** - Interactive slide viewer and design system preview
 * - **JSX + Babel** - Modern component-based slides with browser-side transpilation
 */
import { withRuntime } from "@decocms/runtime";
import { tools } from "./tools/index.ts";
import { prompts } from "./prompts.ts";
import { resources } from "./resources/index.ts";
import { StateSchema, type Env, type Registry } from "./types/env.ts";

export { StateSchema };

const PORT = process.env.PORT || 8004;

console.log("[slides-mcp] Starting server...");
console.log("[slides-mcp] Port:", PORT);
console.log("[slides-mcp] Tools count:", tools.length);
console.log("[slides-mcp] Prompts count:", prompts.length);
console.log("[slides-mcp] Resources count:", resources.length);

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  configuration: {
    scopes: ["BRAND::*"],
    state: StateSchema,
  },
  tools,
  prompts,
  resources,
});

console.log("[slides-mcp] Runtime initialized");

/**
 * Fetch handler with logging
 */
const fetchWithLogging = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const startTime = Date.now();

  // Log incoming request
  if (req.method === "POST" && url.pathname === "/mcp") {
    try {
      const body = await req.clone().json();
      const method = body?.method || "unknown";
      const toolName = body?.params?.name;

      if (method === "tools/call" && toolName) {
        console.log(`[slides-mcp] 🔧 Tool call: ${toolName}`);
      } else if (method !== "unknown") {
        console.log(`[slides-mcp] 📨 Request: ${method}`);
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Call the runtime
  const response = await runtime.fetch(req);

  // Log response time for tool calls
  const duration = Date.now() - startTime;
  if (duration > 100) {
    console.log(`[slides-mcp] ⏱️  Response in ${duration}ms`);
  }

  return response;
};

// Start the server
Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  idleTimeout: 0, // Required for SSE
  fetch: fetchWithLogging,
  development: process.env.NODE_ENV !== "production",
});

console.log("");
console.log("🎯 Slides MCP running at: http://localhost:" + PORT + "/mcp");
console.log("");
console.log("[slides-mcp] Available tools:");
console.log("  - DECK_INIT        - Initialize a new presentation");
console.log("  - DECK_GET         - Get current deck state");
console.log("  - SLIDE_CREATE     - Add slides to presentation");
console.log("  - SLIDE_UPDATE     - Modify existing slides");
console.log("  - SLIDE_DELETE     - Remove slides");
console.log("  - SLIDES_PREVIEW   - Preview multiple slides");
console.log("");
console.log("[slides-mcp] MCP Apps (UI Resources):");
console.log("  - ui://slides-viewer  - Full presentation viewer");
console.log("  - ui://design-system  - Brand design system preview");
console.log("  - ui://slide          - Single slide preview");
console.log("");
console.log("[slides-mcp] Optional binding: BRAND (Brand MCP)");
console.log("  Connect Brand MCP for automatic brand discovery");

// Copy URL to clipboard on macOS
if (process.platform === "darwin") {
  try {
    const proc = Bun.spawn(["pbcopy"], {
      stdin: "pipe",
    });
    proc.stdin.write(`http://localhost:${PORT}/mcp`);
    proc.stdin.end();
    console.log("[slides-mcp] 📋 MCP URL copied to clipboard!");
  } catch {
    // Ignore clipboard errors
  }
}
