/**
 * Blog MCP - AI-Powered Blog Writing Assistant
 *
 * Helps agents write blog articles with consistent tone of voice and visual style.
 *
 * ## Features
 *
 * - **Tone of Voice Guides** - Create and use consistent writing voice
 * - **Visual Style Guides** - Define image generation style for cover images
 * - **Article Workflows** - Prompts for writing and editing articles
 * - **Cover Image Generation** - Generate cover images via IMAGE_GENERATOR binding
 *
 * ## Article Storage
 *
 * Articles are stored as markdown files with YAML frontmatter in the git repository.
 * The MCP guides the workflow - the agent reads/writes files directly.
 */
import { withRuntime } from "@decocms/runtime";
import { tools } from "./tools/index.ts";
import { prompts } from "./prompts.ts";
import { resources } from "./resources/index.ts";
import { StateSchema, type Env } from "./types/env.ts";
import type { BindingRegistry } from "@decocms/runtime";

export { StateSchema };

type Registry = BindingRegistry;

const PORT = process.env.PORT || 8005;

console.log("[blog-mcp] Starting server...");
console.log("[blog-mcp] Port:", PORT);
console.log("[blog-mcp] Tools count:", tools.length);
console.log("[blog-mcp] Prompts count:", prompts.length);
console.log("[blog-mcp] Resources count:", resources.length);

const runtime = withRuntime<Env, typeof StateSchema, Registry>({
  configuration: {
    scopes: ["IMAGE_GENERATOR::*"],
    state: StateSchema,
  },
  tools,
  prompts,
  resources,
});

console.log("[blog-mcp] Runtime initialized");

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
        console.log(`[blog-mcp] 🔧 Tool call: ${toolName}`);
      } else if (method !== "unknown") {
        console.log(`[blog-mcp] 📨 Request: ${method}`);
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: runtime.fetch type is complex
  const response = await (runtime.fetch as any)(req);

  const duration = Date.now() - startTime;
  if (duration > 100) {
    console.log(`[blog-mcp] ⏱️  Response in ${duration}ms`);
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
console.log("📝 Blog MCP running at: http://localhost:" + PORT + "/mcp");
console.log("");
console.log("[blog-mcp] Available prompts:");
console.log("  - SETUP_PROJECT              - Initialize blog structure");
console.log("  - TONE_OF_VOICE_TEMPLATE     - Create tone of voice guide");
console.log("  - VISUAL_STYLE_TEMPLATE      - Create visual style guide");
console.log("  - WRITE_ARTICLE              - Workflow for writing articles");
console.log("  - EDIT_ARTICLE               - Workflow for editing articles");
console.log("");
console.log("[blog-mcp] Available tools:");
console.log("  Helpers:");
console.log("    - COVER_IMAGE_GENERATE     - Generate cover image");
console.log("    - ARTICLE_FRONTMATTER      - Generate article frontmatter");
console.log("    - ARTICLE_VALIDATE         - Validate article structure");
console.log("");
console.log("  Filesystem (requires OBJECT_STORAGE):");
console.log("    - BLOG_READ_STYLE_GUIDE    - Read tone/visual style guide");
console.log("    - BLOG_LIST_ARTICLES       - List all articles");
console.log("    - BLOG_READ_ARTICLE        - Read an article");
console.log("    - BLOG_WRITE_ARTICLE       - Write an article");
console.log("    - BLOG_DELETE_ARTICLE      - Delete an article");
console.log("");
console.log("[blog-mcp] Resources:");
console.log("  - resource://tone-of-voice-template");
console.log("  - resource://visual-style-template");
console.log("");
console.log("[blog-mcp] Bindings:");
console.log(
  "  - OBJECT_STORAGE (@deco/object-storage) - Folder with blog/ subfolder",
);
console.log("  - IMAGE_GENERATOR (@deco/nanobanana) - Cover image generation");

// Copy URL to clipboard on macOS
if (process.platform === "darwin") {
  try {
    const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" });
    proc.stdin.write(`http://localhost:${PORT}/mcp`);
    proc.stdin.end();
    console.log("[blog-mcp] 📋 MCP URL copied to clipboard!");
  } catch {
    // Ignore clipboard errors
  }
}
