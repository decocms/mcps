/**
 * Bookmarks MCP - Bookmark Management with AI Enrichment
 *
 * Manage bookmarks stored in Supabase with AI-powered enrichment.
 *
 * ## Features
 *
 * - **CRUD Operations** - Create, read, update, delete bookmarks
 * - **Search** - Full-text search across bookmarks
 * - **AI Research** - Use Perplexity to research bookmark content
 * - **Web Scraping** - Use Firecrawl to extract page content
 * - **Classification** - Auto-tag and categorize bookmarks
 * - **Import** - Import from Chrome or Firefox exports
 *
 * ## Bookmark Schema
 *
 * Each bookmark includes:
 * - Basic info: url, title, description, icon
 * - Enrichment: perplexity_research, firecrawl_content
 * - Insights: insight_dev, insight_founder, insight_investor
 * - Metadata: tags, stars, reading_time_min, language
 */
import { withRuntime } from "@decocms/runtime";
import { tools } from "./tools/index.ts";
import { prompts } from "./prompts.ts";
import { StateSchema, type Env } from "./types/env.ts";
import type { BindingRegistry } from "@decocms/runtime";

export { StateSchema };

type Registry = BindingRegistry;

const PORT = process.env.PORT || 8006;

console.log("[bookmarks-mcp] Starting server...");
console.log("[bookmarks-mcp] Port:", PORT);
console.log("[bookmarks-mcp] Tools count:", tools.length);
console.log("[bookmarks-mcp] Prompts count:", prompts.length);

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  configuration: {
    scopes: ["SUPABASE::*", "PERPLEXITY::*", "FIRECRAWL::*"],
    state: StateSchema,
  },
  tools,
  prompts,
  resources: [],
});

console.log("[bookmarks-mcp] Runtime initialized");

/**
 * Fetch handler with logging
 */
const fetchWithLogging = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const startTime = Date.now();

  if (req.method === "POST" && url.pathname === "/mcp") {
    try {
      const body = await req.clone().json();
      const method = body?.method || "unknown";
      const toolName = body?.params?.name;

      if (method === "tools/call" && toolName) {
        console.log(`[bookmarks-mcp] 🔧 Tool call: ${toolName}`);
      } else if (method !== "unknown") {
        console.log(`[bookmarks-mcp] 📨 Request: ${method}`);
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  const response = await runtime.fetch(req);

  const duration = Date.now() - startTime;
  if (duration > 100) {
    console.log(`[bookmarks-mcp] ⏱️  Response in ${duration}ms`);
  }

  return response;
};

// Start the server
Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  idleTimeout: 0,
  fetch: fetchWithLogging,
  development: process.env.NODE_ENV !== "production",
});

console.log("");
console.log("🔖 Bookmarks MCP running at: http://localhost:" + PORT + "/mcp");
console.log("");
console.log("[bookmarks-mcp] Available tools:");
console.log("  CRUD:");
console.log("    - BOOKMARK_LIST            - List bookmarks with filters");
console.log("    - BOOKMARK_GET             - Get single bookmark");
console.log("    - BOOKMARK_CREATE          - Create new bookmark");
console.log("    - BOOKMARK_UPDATE          - Update bookmark");
console.log("    - BOOKMARK_DELETE          - Delete bookmark");
console.log("    - BOOKMARK_SEARCH          - Full-text search");
console.log("");
console.log("  Enrichment:");
console.log("    - BOOKMARK_RESEARCH        - Research with Perplexity");
console.log("    - BOOKMARK_SCRAPE          - Scrape with Firecrawl");
console.log("    - BOOKMARK_CLASSIFY        - Auto-classify with tags");
console.log("    - BOOKMARK_ENRICH_BATCH    - Batch enrich bookmarks");
console.log("");
console.log("  Import:");
console.log("    - BOOKMARK_IMPORT_CHROME   - Import Chrome bookmarks");
console.log("    - BOOKMARK_IMPORT_FIREFOX  - Import Firefox bookmarks");
console.log("");
console.log("[bookmarks-mcp] Required bindings:");
console.log("  - SUPABASE (@supabase/supabase) - Bookmark storage");
console.log("");
console.log("[bookmarks-mcp] Optional bindings:");
console.log("  - PERPLEXITY (@deco/perplexity) - AI research");
console.log("  - FIRECRAWL (@deco/firecrawl) - Web scraping");

// Copy URL to clipboard on macOS
if (process.platform === "darwin") {
  try {
    const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" });
    proc.stdin.write(`http://localhost:${PORT}/mcp`);
    proc.stdin.end();
    console.log("[bookmarks-mcp] 📋 MCP URL copied to clipboard!");
  } catch {
    // Ignore clipboard errors
  }
}
