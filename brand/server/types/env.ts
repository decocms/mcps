/**
 * Environment Type Definitions for Brand MCP
 *
 * Uses BindingOf with tool-based matching via Registry.
 */
import {
  BindingOf,
  type DefaultEnv,
  type BindingRegistry,
} from "@decocms/runtime";
import { z } from "zod";

/**
 * Registry defines the tool signatures for each binding type.
 * Connections with matching tools will be shown as options.
 */
export interface Registry extends BindingRegistry {
  "@deco/perplexity": [
    {
      name: "perplexity_ask";
      inputSchema: z.ZodType<{ query?: string; messages?: unknown[] }>;
    },
    {
      name: "perplexity_research";
      inputSchema: z.ZodType<{ query?: string; messages?: unknown[] }>;
      opt?: true;
    },
  ];
  "@deco/scraper": [
    {
      name: "scrape_content";
      inputSchema: z.ZodType<{ url?: string }>;
      opt?: true;
    },
    {
      name: "firecrawl_scrape";
      inputSchema: z.ZodType<{ url?: string }>;
      opt?: true;
    },
  ];
}

/**
 * State schema using BindingOf for clean binding declarations.
 */
export const StateSchema = z.object({
  PERPLEXITY: BindingOf<Registry, "@deco/perplexity">("@deco/perplexity")
    .optional()
    .describe("AI research - any MCP with perplexity_ask tool"),

  SCRAPER: BindingOf<Registry, "@deco/scraper">("@deco/scraper")
    .optional()
    .describe("Web scraping - any MCP with scrape_content or firecrawl_scrape"),
});

/**
 * Environment type for the Brand MCP.
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;
