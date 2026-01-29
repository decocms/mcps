/**
 * Brand MCP - AI-Powered Brand Research & Design System Generator
 *
 * A complete toolset for discovering brand identity and generating design systems.
 *
 * ## Features
 *
 * - **Brand Scraping** - Extract colors, fonts, logos from websites using Firecrawl
 * - **Brand Research** - Deep research using Perplexity AI
 * - **Design System Generation** - CSS variables, JSX components, style guides
 * - **MCP Apps UI** - Interactive brand previews
 * - **Persistent Storage** - Projects stored to filesystem (official MCP filesystem compatible)
 *
 * ## Optional Bindings
 *
 * Configure for full functionality:
 * - **FIRECRAWL** - For website scraping and brand extraction (firecrawl-mcp)
 * - **PERPLEXITY** - For AI-powered brand research (@perplexity-ai/mcp-server)
 * - **FILESYSTEM** - For persistent storage (works with @modelcontextprotocol/server-filesystem or @decocms/mcp-local-fs)
 */
import { withRuntime } from "@decocms/runtime";
import { tools } from "./tools/index.ts";
import { resources } from "./resources/index.ts";
import { StateSchema, type Env, type Registry } from "./types/env.ts";

export { StateSchema };

const PORT = process.env.PORT || 8003;

console.log("[brand-mcp] Starting server...");
console.log("[brand-mcp] Port:", PORT);
console.log("[brand-mcp] Tools count:", tools.length);
console.log("[brand-mcp] Resources count:", resources.length);

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  configuration: {
    scopes: ["PERPLEXITY::*", "FIRECRAWL::*", "FILESYSTEM::*"],
    state: StateSchema,
  },
  tools,
  prompts: [],
  resources,
});

console.log("[brand-mcp] Runtime initialized");

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
        console.log(`[brand-mcp] 🔧 Tool call: ${toolName}`);
      } else if (method !== "unknown") {
        console.log(`[brand-mcp] 📨 Request: ${method}`);
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
    console.log(`[brand-mcp] ⏱️  Response in ${duration}ms`);
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
console.log("🎨 Brand MCP running at: http://localhost:" + PORT + "/mcp");
console.log("");
console.log("[brand-mcp] Available tools:");
console.log("  - BRAND_SCRAPE     - Extract brand identity from websites");
console.log("  - BRAND_RESEARCH   - Deep research using Perplexity AI");
console.log("  - BRAND_DISCOVER   - Combined scraping + research");
console.log("  - BRAND_STATUS     - Check available capabilities");
console.log("  - BRAND_GENERATE   - Generate design system from identity");
console.log("  - BRAND_CREATE     - Full workflow: discover + generate");
console.log("");
console.log("[brand-mcp] MCP Apps (UI Resources):");
console.log("  - ui://brand-preview - Interactive brand preview");
console.log("  - ui://brand-list    - Grid view of brands");
console.log("");
console.log("[brand-mcp] Optional bindings: PERPLEXITY, FIRECRAWL, FILESYSTEM");

// Copy URL to clipboard on macOS
if (process.platform === "darwin") {
  try {
    const proc = Bun.spawn(["pbcopy"], {
      stdin: "pipe",
    });
    proc.stdin.write(`http://localhost:${PORT}/mcp`);
    proc.stdin.end();
    console.log("[brand-mcp] 📋 MCP URL copied to clipboard!");
  } catch {
    // Ignore clipboard errors
  }
}
