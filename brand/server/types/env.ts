/**
 * Type definitions for the Brand MCP environment.
 *
 * This MCP uses Perplexity for AI research and Content Scraper for web scraping.
 */
import { type DefaultEnv, type BindingRegistry } from "@decocms/runtime";
import { z } from "zod";

/**
 * Perplexity binding schema - matches the actual tools from Perplexity MCP
 *
 * Perplexity MCP exposes ASK and CHAT tools (from @decocms/mcps-shared/search-ai)
 * The input schemas must match exactly what the tools expect.
 */
const PerplexityBindingSchema = [
  {
    name: "ASK",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The question or prompt to ask",
        },
      },
      required: ["prompt"],
    },
  },
] as const;

/**
 * Content Scraper binding schema - matches the actual tools from content-scraper MCP
 *
 * Content Scraper exposes scrape_content with an empty input schema
 * (configuration comes from MCP state, not tool input)
 */
const ContentScraperBindingSchema = [
  {
    name: "scrape_content",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
] as const;

/**
 * State schema with optional bindings for brand research.
 *
 * Bindings are matched by checking if a connection's tools satisfy the binding requirements.
 * The __binding property contains the tool patterns used for matching.
 */
export const StateSchema = z.object({
  /**
   * Perplexity binding for web research.
   * Matches connections with the ASK tool (prompt input required).
   */
  PERPLEXITY: z
    .object({
      __type: z.literal("@deco/perplexity").default("@deco/perplexity"),
      __binding: z
        .literal(PerplexityBindingSchema)
        .default(PerplexityBindingSchema),
      value: z.string(),
    })
    .optional()
    .describe("Perplexity AI for brand research - requires ASK tool"),

  /**
   * Content Scraper binding for web scraping.
   * Matches connections with the scrape_content tool.
   */
  SCRAPER: z
    .object({
      __type: z
        .literal("@deco/content-scraper")
        .default("@deco/content-scraper"),
      __binding: z
        .literal(ContentScraperBindingSchema)
        .default(ContentScraperBindingSchema),
      value: z.string(),
    })
    .optional()
    .describe(
      "Content Scraper for web scraping - requires scrape_content tool",
    ),
});

/**
 * Registry type for the bindings.
 */
export type Registry = BindingRegistry;

/**
 * Environment type for the Brand MCP.
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;
