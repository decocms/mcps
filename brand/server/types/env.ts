/**
 * Type definitions for the Brand MCP environment.
 *
 * This MCP requires Perplexity and Firecrawl bindings for brand research.
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
 * State schema with required bindings for brand research.
 *
 * The bindings use __binding to define tool patterns for matching connections:
 * - PERPLEXITY: Matches connections with perplexity_* tools
 * - FIRECRAWL: Matches connections with firecrawl_* tools
 */
export const StateSchema = z.object({
  /**
   * Perplexity binding for web research.
   * Matches connections with tools: perplexity_research, perplexity_ask, etc.
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
   * Firecrawl binding for web scraping.
   * Matches connections with tools: firecrawl_scrape, firecrawl_crawl, etc.
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
 */
export type Registry = BindingRegistry;

/**
 * Environment type for the Brand MCP.
 */
export type Env = DefaultEnv<typeof StateSchema, Registry>;
