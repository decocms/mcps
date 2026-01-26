/**
 * Type definitions for the Brand MCP environment.
 *
 * This MCP uses bindings matched by tool format, not specific MCP names.
 */
import { type DefaultEnv, type BindingRegistry } from "@decocms/runtime";
import { z } from "zod";

/**
 * Perplexity binding - matches any MCP with perplexity_ask and perplexity_research tools
 */
const PerplexityBindingSchema = [
  {
    name: "perplexity_ask",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "perplexity_research",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

/**
 * Scraper binding - matches any MCP with scrape_content tool
 */
const ScraperBindingSchema = [
  {
    name: "scrape_content",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "firecrawl_scrape",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

/**
 * State schema with bindings matched by tool format.
 *
 * Uses generic "binding" type so any connection with matching tools is shown.
 */
export const StateSchema = z.object({
  /**
   * Perplexity binding - any MCP with perplexity_ask/perplexity_research tools
   */
  PERPLEXITY: z
    .object({
      __type: z.literal("binding").default("binding"),
      __binding: z
        .literal(PerplexityBindingSchema)
        .default(PerplexityBindingSchema),
      value: z.string(),
    })
    .optional()
    .describe("AI research - requires perplexity_ask and perplexity_research"),

  /**
   * Scraper binding - any MCP with scrape_content or firecrawl_scrape tools
   */
  SCRAPER: z
    .object({
      __type: z.literal("binding").default("binding"),
      __binding: z.literal(ScraperBindingSchema).default(ScraperBindingSchema),
      value: z.string(),
    })
    .optional()
    .describe("Web scraping - requires scrape_content or firecrawl_scrape"),
});

/**
 * Registry type for the bindings.
 */
export type Registry = BindingRegistry;

/**
 * Environment type for the Brand MCP.
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;
