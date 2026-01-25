/**
 * Type definitions for the Slides MCP environment.
 *
 * This file defines the state schema including optional bindings
 * for external services like Perplexity (research) and Firecrawl (web scraping).
 */
import { type DefaultEnv, type BindingRegistry } from "@decocms/runtime";
import { z } from "zod";

/**
 * Perplexity binding schema - defines the tools to match
 */
const PerplexityBindingSchema = [
  {
    name: "perplexity_research",
    inputSchema: {
      type: "object",
      properties: {
        messages: { type: "array" },
        strip_thinking: { type: "boolean" },
      },
      required: ["messages"],
    },
  },
  {
    name: "perplexity_ask",
    inputSchema: {
      type: "object",
      properties: {
        messages: { type: "array" },
      },
      required: ["messages"],
    },
  },
  {
    name: "perplexity_search",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
] as const;

/**
 * Firecrawl binding schema - defines the tools to match
 */
const FirecrawlBindingSchema = [
  {
    name: "firecrawl_scrape",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        formats: { type: "array" },
      },
      required: ["url"],
    },
  },
  {
    name: "firecrawl_crawl",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
      },
      required: ["url"],
    },
  },
  {
    name: "firecrawl_search",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
] as const;

/**
 * State schema with optional bindings for brand research.
 *
 * When PERPLEXITY or FIRECRAWL bindings are configured, the BRAND_RESEARCH
 * tool becomes available to automatically discover brand assets (logos, colors, etc.)
 * from websites.
 */
export const StateSchema = z.object({
  /**
   * Optional Perplexity binding for web research.
   * Used to search for brand information, logo URLs, and brand guidelines.
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
    .describe(
      "Perplexity AI for brand research - requires perplexity_research tool",
    ),

  /**
   * Optional Firecrawl binding for web scraping.
   * Used to extract brand identity (colors, fonts, typography) directly from websites.
   */
  FIRECRAWL: z
    .object({
      __type: z.literal("@deco/firecrawl").default("@deco/firecrawl"),
      __binding: z
        .literal(FirecrawlBindingSchema)
        .default(FirecrawlBindingSchema),
      value: z.string(),
    })
    .optional()
    .describe("Firecrawl for web scraping - requires firecrawl_scrape tool"),
});

/**
 * Registry type for the bindings.
 * We use BindingRegistry directly since the actual binding types
 * are determined at runtime by the configured MCP servers.
 */
export type Registry = BindingRegistry;

/**
 * Environment type for the Slides MCP.
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;
