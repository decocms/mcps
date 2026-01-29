/**
 * Environment Type Definitions for Brand MCP
 */
import {
  BindingOf,
  type DefaultEnv,
  type BindingRegistry,
} from "@decocms/runtime";
import { z } from "zod";

export const StateSchema = z.object({
  PERPLEXITY: BindingOf("@deco/perplexity-ai")
    .optional()
    .describe(
      "Perplexity AI for brand research - searches for logos, colors, brand identity",
    ),
  FIRECRAWL: BindingOf("@deco/firecrawl")
    .optional()
    .describe(
      "Firecrawl for web scraping - extracts brand assets from websites",
    ),
  // Use mcp-filesystem binding for compatibility with both:
  // - @modelcontextprotocol/server-filesystem (official)
  // - @decocms/mcp-local-fs (our implementation)
  FILESYSTEM: BindingOf("@deco/mcp-filesystem")
    .optional()
    .describe(
      "Filesystem for persistent project storage - works with official MCP filesystem or local-fs",
    ),
});

export type Env = DefaultEnv<typeof StateSchema, BindingRegistry>;

// Re-export Registry type for use in main.ts
export type { Registry } from "../../../shared/registry.ts";
